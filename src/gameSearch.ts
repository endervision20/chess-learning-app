import { replay } from "./chessLogic";
import { openingAt } from "./openings";
import { loadGame, type GameListItem } from "./storage/games";
import { PRACTICE_LABEL, type Color, type GameResult } from "./types";

// ---------------------------------------------------------------------------
// Per-game index (the move list), built on demand and kept in memory
// ---------------------------------------------------------------------------
export interface GameIndex {
  norm: string[]; // every move, simplified for comparing ("Qxa4+" -> "Qa4")
  firstPly: number; // 0 = White's 1st move; practice games can start later
  opening: string; // lower-case opening name ("" if none)
}

const CACHE = new Map<string, GameIndex>();
export const cachedIndex = (fileName: string) => CACHE.get(fileName);
export const forgetIndex = (fileName: string) => CACHE.delete(fileName);

/** Ply number (0 = White's first move) of the first move from a start FEN. */
export function firstPlyOf(startFen?: string): number {
  if (!startFen) return 0;
  const f = startFen.split(" ");
  const full = parseInt(f[5] ?? "1", 10) || 1;
  return (full - 1) * 2 + (f[1] === "b" ? 1 : 0);
}

export async function loadIndex(fileName: string): Promise<GameIndex | null> {
  const hit = CACHE.get(fileName);
  if (hit) return hit;
  try {
    const g = await loadGame(fileName);
    const r = replay(g.moves, g.startFen);
    const fens = r.plies.map((p) => p.fen);
    const op = g.startFen ? null : openingAt(fens, fens.length - 1);
    const idx: GameIndex = {
      norm: r.sans.map(normSan),
      firstPly: firstPlyOf(g.startFen),
      opening: op ? op.name.toLowerCase() : "",
    };
    CACHE.set(fileName, idx);
    return idx;
  } catch (e) {
    console.error("Couldn't index a game:", fileName, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Move notation
// ---------------------------------------------------------------------------
const SAN_RE =
  /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBNqrbn])?|O-O(?:-O)?)[+#]?[!?]*$/;

/** Fixes the case you typed ("nf3" -> "Nf3") and says whether it looks like a move. */
export function asSan(tok: string): string | null {
  let t = tok.replace(/0/g, "O");
  if (/^[nrqk]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
  else if (/^b[a-h][1-8]/.test(t)) t = "B" + t.slice(1); // "bc4" = bishop to c4
  else if (/^o-o/i.test(t)) t = t.toUpperCase();
  return SAN_RE.test(t) ? t : null;
}

/** Drops capture, check, mate and annotation marks so "Qa4", "Qxa4" and "Qxa4+" are the same. */
export function normSan(s: string): string {
  const t = s.replace(/0/g, "O");
  if (/^O(-O)+/.test(t)) return t.replace(/[+#!?]/g, "");
  return t.replace(/[x+#!?=:]/g, "").replace(/(\d)([qrbn])$/, (_, d, p) => d + p.toUpperCase());
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------
export interface MoveSeq {
  start: number | null; // ply number (0 = White's 1st move); null = anywhere in the game
  moves: string[]; // simplified moves, one after another
}

export interface ParsedQuery {
  words: string[];
  wordRes: RegExp[];
  result?: GameResult;
  color?: Color;
  assisted?: boolean;
  helped?: boolean;
  seqs: MoveSeq[];
}

const RESULT_WORDS: Record<string, GameResult> = {
  win: "win", won: "win", wins: "win", victory: "win",
  loss: "loss", lost: "loss", lose: "loss", loses: "loss", defeat: "loss",
  draw: "draw", drawn: "draw", drew: "draw", draws: "draw",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "win black 1 d4 2 ... e6" -> result win, colour black, and the moves 1.d4 e6.
 * Moves can have a number ("19 ... Qxa4", "1 d4", "1.e4 e5") or not ("Qa4").
 */
export function parseQuery(q: string): ParsedQuery {
  const s = q
    .trim()
    .replace(/…/g, "...")
    .replace(/(\d+)\s*(\.\.\.|\.(?!\d))\s*/g, "$1$2 ");
  const toks = s.split(/\s+/).filter(Boolean);
  const out: ParsedQuery = { words: [], wordRes: [], seqs: [] };

  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const num = /^(\d+)(\.\.\.|\.)?$/.exec(t);

    // a move number followed by one or more moves
    if (num && i + 1 < toks.length && asSan(toks[i + 1])) {
      const start = (parseInt(num[1], 10) - 1) * 2 + (num[2] === "..." ? 1 : 0);
      const moves: string[] = [];
      i++;
      while (i < toks.length && asSan(toks[i])) {
        moves.push(normSan(asSan(toks[i])!));
        i++;
      }
      out.seqs.push({ start, moves });
      continue;
    }

    // moves without a number: they have to follow each other somewhere in the game
    if (asSan(t)) {
      const moves: string[] = [];
      while (i < toks.length && asSan(toks[i])) {
        moves.push(normSan(asSan(toks[i])!));
        i++;
      }
      out.seqs.push({ start: null, moves });
      continue;
    }

    const w = t.toLowerCase().replace(/\.+$/, "");
    if (RESULT_WORDS[w]) out.result = RESULT_WORDS[w];
    else if (w === "white" || w === "black") out.color = w;
    else if (w === "assisted") out.assisted = true;
    else if (w === "unassisted") out.assisted = false;
    else if (w === "helped") out.helped = true;
    else if (w) out.words.push(w);
    i++;
  }
  out.wordRes = out.words.map((w) => new RegExp("(?:^|[^a-z0-9])" + escapeRe(w)));
  return out;
}

/** Does the query need the games' moves (or opening names) to be loaded? */
export const needsIndex = (q: ParsedQuery) => q.seqs.length > 0 || q.words.length > 0;

export const isEmptyQuery = (q: ParsedQuery) =>
  !q.words.length &&
  !q.seqs.length &&
  !q.result &&
  !q.color &&
  q.assisted === undefined &&
  q.helped === undefined;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const p2 = (n: number) => String(n).padStart(2, "0");

function dateText(d: Date): string {
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  const h = d.getHours();
  const mi = d.getMinutes();
  const mon = MONTHS[mo];
  const mon3 = mon.slice(0, 3);
  const dow = DAYS[d.getDay()];
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? "am" : "pm";
  return [
    `${y}-${p2(mo + 1)}-${p2(day)}`,
    `${day}/${mo + 1}/${y}`,
    `${p2(day)}/${p2(mo + 1)}/${y}`,
    `${p2(day)}.${p2(mo + 1)}.${y}`,
    `${day} ${mon} ${y}`,
    `${day} ${mon3} ${y}`,
    `${mon} ${day}`,
    `${mon3} ${day}`,
    `${mon} ${y}`,
    String(y),
    dow,
    dow.slice(0, 3),
    `${p2(h)}:${p2(mi)}`,
    `${h12}:${p2(mi)} ${ap}`,
    `${h12}${ap}`,
    ap,
  ].join(" | ");
}

const HAY = new Map<string, string>();
function haystack(g: GameListItem, idx?: GameIndex): string {
  const key = g.fileName + (idx ? "+" : "");
  let h = HAY.get(key);
  if (h === undefined) {
    h = [
      dateText(g.date),
      g.elo === null ? "full strength max" : `vs ${g.elo} ${g.elo}`,
      g.assisted ? "assisted" : "unassisted",
      g.helped ? "helped" : "",
      g.practice ? `practice ${PRACTICE_LABEL[g.practice].toLowerCase()}` : "",
      idx?.opening ?? "",
    ].join(" | ").toLowerCase();
    HAY.set(key, h);
  }
  return h;
}

function seqMatches(idx: GameIndex, seq: MoveSeq): boolean {
  const n = idx.norm;
  const len = seq.moves.length;
  const at = (i0: number) => {
    if (i0 < 0 || i0 + len > n.length) return false;
    for (let k = 0; k < len; k++) if (n[i0 + k] !== seq.moves[k]) return false;
    return true;
  };
  if (seq.start !== null) return at(seq.start - idx.firstPly);
  for (let i0 = 0; i0 + len <= n.length; i0++) if (at(i0)) return true;
  return false;
}

export function matchesQuery(g: GameListItem, idx: GameIndex | undefined, q: ParsedQuery): boolean {
  if (q.result && g.result !== q.result) return false;
  if (q.color && g.color !== q.color) return false;
  if (q.assisted !== undefined && g.assisted !== q.assisted) return false;
  if (q.helped !== undefined && g.helped !== q.helped) return false;
  if (q.seqs.length > 0) {
    if (!idx) return false; // not loaded yet
    for (const s of q.seqs) if (!seqMatches(idx, s)) return false;
  }
  if (q.wordRes.length > 0) {
    const h = haystack(g, idx);
    for (const re of q.wordRes) if (!re.test(h)) return false;
  }
  return true;
}
