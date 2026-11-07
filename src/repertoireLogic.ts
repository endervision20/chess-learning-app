import { Chess, type Position } from "chessops/chess";
import { parsePgn, type Node as PgnNode, type PgnNodeData } from "chessops/pgn";
import { makeSanAndPlay, parseSan } from "chessops/san";
import { parseUciMove, toMove } from "./chessLogic";
import { moveToUci, sanToUcis, toBoardMove } from "./lineTools";
import type { Color, LineFolder, RepNode, Repertoire } from "./types";

export const EXPORT_FORMAT = "chess-app-repertoire";

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function newRepertoire(name: string, side: Color): Repertoire {
  const now = new Date().toISOString();
  return { version: 1, id: newId(), name, side, description: "", created: now, updated: now, moves: [] };
}

export function duplicateRepertoire(r: Repertoire): Repertoire {
  const now = new Date().toISOString();
  return {
    ...r,
    id: newId(),
    name: `${r.name} (copy)`,
    favorite: false,
    created: now,
    updated: now,
    moves: JSON.parse(JSON.stringify(r.moves)),
    folders: JSON.parse(JSON.stringify(r.folders ?? [])),
  };
}

// ---------------------------------------------------------------------------
// Tree helpers. A position in the tree is a path of UCI moves from the start.
// All updates copy only the nodes along the path (the rest is shared).
// ---------------------------------------------------------------------------
export function childrenAt(nodes: RepNode[], path: string[]): RepNode[] | null {
  let list = nodes;
  for (const u of path) {
    const n = list.find((x) => x.uci === u);
    if (!n) return null;
    list = n.children;
  }
  return list;
}

export function nodeAt(nodes: RepNode[], path: string[]): RepNode | null {
  if (path.length === 0) return null;
  const parent = childrenAt(nodes, path.slice(0, -1));
  return parent?.find((x) => x.uci === path[path.length - 1]) ?? null;
}

export function addMove(nodes: RepNode[], path: string[], uci: string): RepNode[] {
  if (path.length === 0) {
    return nodes.some((c) => c.uci === uci) ? nodes : [...nodes, { uci, note: "", children: [] }];
  }
  const [head, ...rest] = path;
  return nodes.map((n) => (n.uci === head ? { ...n, children: addMove(n.children, rest, uci) } : n));
}

export function removeAt(nodes: RepNode[], path: string[]): RepNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  if (rest.length === 0) return nodes.filter((n) => n.uci !== head);
  return nodes.map((n) => (n.uci === head ? { ...n, children: removeAt(n.children, rest) } : n));
}

export function setNote(nodes: RepNode[], path: string[], text: string): RepNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  return nodes.map((n) =>
    n.uci !== head ? n : rest.length ? { ...n, children: setNote(n.children, rest, text) } : { ...n, note: text }
  );
}

/** Moves a node up (-1) or down (+1) among its siblings. The first sibling is the main line. */
export function shiftAt(nodes: RepNode[], path: string[], dir: -1 | 1): RepNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  if (rest.length) {
    return nodes.map((n) => (n.uci === head ? { ...n, children: shiftAt(n.children, rest, dir) } : n));
  }
  const i = nodes.findIndex((n) => n.uci === head);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= nodes.length) return nodes;
  const out = [...nodes];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** The path followed by the first (main) move at every step. */
export function extendMain(nodes: RepNode[], prefix: string[]): string[] {
  const out = [...prefix];
  let list = childrenAt(nodes, prefix);
  while (list && list.length > 0) {
    out.push(list[0].uci);
    list = list[0].children;
  }
  return out;
}

/** Every complete line (root to leaf) as UCI moves. */
export function leafLines(nodes: RepNode[], prefix: string[] = []): string[][] {
  const out: string[][] = [];
  for (const n of nodes) {
    const p = [...prefix, n.uci];
    if (n.children.length === 0) out.push(p);
    else for (const l of leafLines(n.children, p)) out.push(l);
  }
  return out;
}

export function countLines(nodes: RepNode[]): number {
  let n = 0;
  for (const x of nodes) n += x.children.length === 0 ? 1 : countLines(x.children);
  return n;
}

export function countMoves(nodes: RepNode[]): number {
  let n = 0;
  for (const x of nodes) n += 1 + countMoves(x.children);
  return n;
}

export const isPrefix = (prefix: string[], of: string[]) =>
  prefix.length <= of.length && prefix.every((u, i) => of[i] === u);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function exportJson(rep: Repertoire): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      name: rep.name,
      side: rep.side,
      description: rep.description,
      folders: rep.folders ?? [],
      exported: new Date().toISOString(),
      moves: rep.moves,
    },
    null,
    2
  );
}

/** PGN with variations and comments (the first move at each point is the main line). */
export function toPgn(rep: Repertoire): string {
  const esc = (s: string) => s.replace(/[{}]/g, (c) => (c === "{" ? "(" : ")"));
  const label = (p: Position, force: boolean) =>
    p.turn === "white" ? `${p.fullmoves}. ` : force ? `${p.fullmoves}... ` : "";
  const one = (p: Chess, n: RepNode, force: boolean): string => {
    const lab = label(p, force);
    const m = parseUciMove(n.uci);
    const san = makeSanAndPlay(p, toMove(p, m.from, m.to, m.promotion));
    const c = n.note.trim();
    return lab + san + (c ? ` {${esc(c)}}` : "");
  };
  const seq = (pos: Chess, nodes: RepNode[], force: boolean): string => {
    if (nodes.length === 0) return "";
    const [main, ...alts] = nodes;
    const p1 = pos.clone();
    let out = one(p1, main, force);
    for (const alt of alts) {
      const pa = pos.clone();
      const first = one(pa, alt, true);
      const rest = seq(pa, alt.children, alt.note.trim() !== "");
      out += ` (${first}${rest ? " " + rest : ""})`;
    }
    const cont = seq(p1, main.children, alts.length > 0 || main.note.trim() !== "");
    return cont ? `${out} ${cont}` : out;
  };

  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const head = [
    `[Event "${rep.name.replace(/"/g, "'")}"]`,
    `[Site "?"]`,
    `[Date "${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}"]`,
    `[Round "-"]`,
    `[White "?"]`,
    `[Black "?"]`,
    `[Result "*"]`,
    `[Orientation "${rep.side}"]`,
  ].join("\n");
  const desc = rep.description.trim() ? `{${esc(rep.description.trim())}} ` : "";
  return `${head}\n\n${desc}${seq(Chess.default(), rep.moves, true)} *\n`;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

interface Ctx {
  dropped: number;
  folderIds?: Set<string>; // folders that exist (JSON import)
}

/** Keeps only legal moves; anything illegal or malformed is dropped (and counted). */
function cleanNodes(raw: unknown, pos: Chess, ctx: Ctx, depth: number): RepNode[] {
  if (!Array.isArray(raw)) return [];
  const out: RepNode[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || depth > 600) {
      ctx.dropped++;
      continue;
    }
    const o = r as Record<string, unknown>;
    const uci = typeof o.uci === "string" ? o.uci : "";
    if (!UCI_RE.test(uci) || out.some((x) => x.uci === uci)) {
      ctx.dropped++;
      continue;
    }
    try {
      const m = parseUciMove(uci);
      const mv = toMove(pos, m.from, m.to, m.promotion);
      if (!pos.isLegal(mv)) {
        ctx.dropped++;
        continue;
      }
      const next = pos.clone();
      next.play(mv);
      out.push({
        uci,
        note: typeof o.note === "string" ? o.note : "",
        ...(typeof o.name === "string" && o.name.trim() ? { name: o.name.trim() } : {}),
        ...(typeof o.folder === "string" && (o.folder === "" || ctx.folderIds?.has(o.folder))
          ? { folder: o.folder }
          : {}),
        children: cleanNodes(o.children, next, ctx, depth + 1),
      });
    } catch {
      ctx.dropped++;
    }
  }
  return out;
}

function walkPgn(node: PgnNode<PgnNodeData>, pos: Chess, out: RepNode[], ctx: Ctx) {
  for (const child of node.children) {
    const mv = parseSan(pos, child.data.san);
    if (!mv) {
      ctx.dropped++;
      continue;
    }
    const uci = moveToUci(toBoardMove(pos, mv));
    let rn = out.find((x) => x.uci === uci);
    if (!rn) {
      rn = { uci, note: "", children: [] };
      out.push(rn);
    }
    const c = (child.data.comments ?? [])
      .join(" ")
      .replace(/\[%[^\]]*\]/g, "")
      .trim();
    if (c && !rn.note) rn.note = c;
    const next = pos.clone();
    next.play(mv);
    walkPgn(child, next, rn.children, ctx);
  }
}

export interface ImportResult {
  rep: Repertoire;
  dropped: number; // moves that were illegal or unreadable and were left out
  format: "json" | "pgn";
}

/** Reads text exported by this app (JSON), or a PGN with variations (e.g. from a Lichess study). */
export function parseImport(text: string): ImportResult {
  const t = text.trim();
  if (!t) throw new Error("There is nothing to import.");
  const rep = newRepertoire("Imported repertoire", "white");
  const ctx: Ctx = { dropped: 0 };

  if (t.startsWith("{") || t.startsWith("[{") || t.startsWith("[]")) {
    let data: unknown;
    try {
      data = JSON.parse(t);
    } catch {
      throw new Error("That isn't valid JSON.");
    }
    const obj = (Array.isArray(data) ? { moves: data } : data) as Record<string, unknown>;
    if (!Array.isArray(obj.moves)) throw new Error("This doesn't look like an exported repertoire.");
    if (typeof obj.name === "string" && obj.name.trim()) rep.name = obj.name.trim();
    if (obj.side === "white" || obj.side === "black") rep.side = obj.side;
    if (typeof obj.description === "string") rep.description = obj.description;
    rep.folders = parseFolders(obj.folders);
    ctx.folderIds = new Set(rep.folders.map((f) => f.id));
    rep.moves = cleanNodes(obj.moves, Chess.default(), ctx, 0);
    return { rep, dropped: ctx.dropped, format: "json" };
  }

  const games = parsePgn(t);
  if (games.length === 0) throw new Error("No game found in that text.");
  let name = "";
  let side: Color | null = null;
  let desc = "";
  for (const g of games) {
    if (g.headers.get("FEN")) {
      ctx.dropped++; // only games from the standard start can be used
      continue;
    }
    walkPgn(g.moves, Chess.default(), rep.moves, ctx);
    if (!name) {
      const ev = g.headers.get("Event");
      if (ev && ev !== "?") name = ev;
    }
    const o = g.headers.get("Orientation");
    if (!side && (o === "white" || o === "black")) side = o;
    if (!desc && g.comments && g.comments.length > 0) desc = g.comments.join("\n").trim();
  }
  if (rep.moves.length === 0) throw new Error("That PGN has no usable moves.");
  if (name) rep.name = name;
  if (side) rep.side = side;
  rep.description = desc;
  return { rep, dropped: ctx.dropped, format: "pgn" };
}

// ---------------------------------------------------------------------------
// Lines, names, adding several lines at once
// ---------------------------------------------------------------------------
/** Every line you can study. For Black a line needs at least one Black move. */
export function playableLines(nodes: RepNode[], side: Color): string[][] {
  return leafLines(nodes).filter((l) => l.length > (side === "black" ? 1 : 0));
}

export function setName(nodes: RepNode[], path: string[], name: string): RepNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  return nodes.map((n) => {
    if (n.uci !== head) return n;
    if (rest.length) return { ...n, children: setName(n.children, rest, name) };
    const { name: _old, ...others } = n;
    return name.trim() ? { ...others, name: name.trim() } : others;
  });
}

/** Adds `add` into `base`: moves that already exist are shared, new ones become branches. */
export function mergeTrees(base: RepNode[], add: RepNode[]): RepNode[] {
  const out = [...base];
  for (const a of add) {
    const i = out.findIndex((n) => n.uci === a.uci);
    if (i < 0) {
      out.push(a);
    } else {
      const b = out[i];
      out[i] = {
        ...b,
        note: b.note.trim() ? b.note : a.note,
        ...(b.name ? { name: b.name } : a.name ? { name: a.name } : {}),
        ...(b.folder !== undefined ? { folder: b.folder } : a.folder !== undefined ? { folder: a.folder } : {}),
        children: mergeTrees(b.children, a.children),
      };
    }
  }
  return out;
}

export function lineToNodes(ucis: string[]): RepNode[] {
  let nodes: RepNode[] = [];
  for (let i = ucis.length - 1; i >= 0; i--) nodes = [{ uci: ucis[i], note: "", children: nodes }];
  return nodes;
}

/** Plain move lists, one line per row: "1. e4 c5 2. Nf3 d6". Bad rows are reported and skipped. */
export function parseSanRows(text: string): { lines: string[][]; errors: string[] } {
  const lines: string[][] = [];
  const errors: string[] = [];
  for (const row of text.split(/\r?\n/)) {
    const cleaned = row
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\$\d+/g, " ")
      .replace(/[!?]+/g, "")
      .replace(/\b(1-0|0-1|1\/2-1\/2)\b/g, " ")
      .replace(/\*/g, " ")
      .replace(/\d+\s*\.(\s*\.\.)?/g, " ");
    const toks = cleaned.split(/\s+/).filter(Boolean);
    if (toks.length === 0) continue;
    try {
      lines.push(sanToUcis(toks.map((t) => t.replace(/0/g, "O"))));
    } catch (e) {
      const short = row.trim().length > 40 ? row.trim().slice(0, 40) + "…" : row.trim();
      errors.push(`“${short}”: ${e instanceof Error ? e.message : "couldn't read it"}`);
    }
  }
  return { lines, errors };
}

/** A PGN (with variations) as a move tree, for merging into an existing repertoire. */
export function pgnToNodes(text: string): { moves: RepNode[]; dropped: number } {
  const ctx: Ctx = { dropped: 0 };
  const moves: RepNode[] = [];
  for (const g of parsePgn(text)) {
    if (g.headers.get("FEN")) {
      ctx.dropped++;
      continue;
    }
    walkPgn(g.moves, Chess.default(), moves, ctx);
  }
  return { moves, dropped: ctx.dropped };
}

/**
 * Adds several lines at once. Text with headers or ( ) variations is read as PGN;
 * otherwise every row is one line of moves.
 */
export function addLinesFromText(
  nodes: RepNode[],
  text: string
): { moves: RepNode[]; addedLines: number; errors: string[] } {
  const errors: string[] = [];
  let tree = nodes;
  let addedLines = 0;
  if (/\[\w+\s+"/.test(text) || text.includes("(")) {
    const { moves, dropped } = pgnToNodes(text);
    if (dropped) errors.push(`${dropped} moves couldn't be read and were left out.`);
    addedLines = countLines(moves);
    tree = mergeTrees(tree, moves);
  } else {
    const parsed = parseSanRows(text);
    errors.push(...parsed.errors);
    for (const l of parsed.lines) tree = mergeTrees(tree, lineToNodes(l));
    addedLines = parsed.lines.length;
  }
  return { moves: tree, addedLines, errors };
}

// ---------------------------------------------------------------------------
// Folders inside a repertoire
// ---------------------------------------------------------------------------
/**
 * The folder a line is in, or null. A folder is stored on a move; the nearest move towards the end of the
 * line that has one decides (so a line you extend later stays in the same folder).
 */
export function folderOfLine(nodes: RepNode[], path: string[]): string | null {
  const chain: RepNode[] = [];
  let list = nodes;
  for (const u of path) {
    const n = list.find((x) => x.uci === u);
    if (!n) break;
    chain.push(n);
    list = n.children;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const f = chain[i].folder;
    if (f !== undefined) return f || null;
  }
  return null;
}

/** Puts the line that ends at `path` into a folder (null = no folder). */
export function setLineFolder(nodes: RepNode[], path: string[], folderId: string | null): RepNode[] {
  const inherited = folderOfLine(nodes, path.slice(0, -1));
  const value = folderId === inherited ? undefined : folderId ?? "";
  const apply = (list: RepNode[], p: string[]): RepNode[] => {
    const [head, ...rest] = p;
    return list.map((n) => {
      if (n.uci !== head) return n;
      if (rest.length) return { ...n, children: apply(n.children, rest) };
      const { folder: _old, ...others } = n;
      return value === undefined ? others : { ...others, folder: value };
    });
  };
  return path.length === 0 ? nodes : apply(nodes, path);
}

/** Takes every line out of a folder (used when the folder is deleted). */
export function stripFolder(nodes: RepNode[], id: string): RepNode[] {
  return nodes.map((n) => {
    const { folder, ...others } = n;
    return {
      ...others,
      ...(folder !== undefined && folder !== id ? { folder } : {}),
      children: stripFolder(n.children, id),
    };
  });
}

export function parseFolders(raw: unknown): LineFolder[] {
  if (!Array.isArray(raw)) return [];
  const out: LineFolder[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || typeof o.name !== "string" || !o.name.trim()) continue;
    if (out.some((x) => x.id === o.id)) continue;
    out.push({
      id: o.id,
      name: o.name.trim(),
      ...(typeof o.first === "string" && UCI_RE.test(o.first) ? { first: o.first } : {}),
    });
  }
  return out;
}
