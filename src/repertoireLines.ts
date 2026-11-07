import { START_FEN, destsFromFen, pvToSan, replay } from "./chessLogic";
import { ucisToMoves } from "./lineTools";
import { openingAt } from "./openings";
import { extendMain, folderOfLine, nodeAt, playableLines } from "./repertoireLogic";
import type { Repertoire } from "./types";

export type RepView = "list" | "tiles";
const VIEW_KEY = "rep-view";
export const loadRepView = (): RepView => {
  try {
    return localStorage.getItem(VIEW_KEY) === "tiles" ? "tiles" : "list";
  } catch {
    return "list";
  }
};
export const saveRepView = (v: RepView) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* the choice just won't be remembered */
  }
};

/** "1. e4 c5 2. Nf3 d6 ..." (the first `max` moves). */
export function formatSans(sans: string[], max = 16): string {
  const parts = sans.slice(0, max).map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s));
  return parts.join(" ") + (sans.length > max ? " …" : "");
}

export interface LineInfo {
  key: string;
  ucis: string[];
  name: string; // your own name for the line, else the opening it reaches
  eco: string;
  sans: string[];
  text: string; // the start of the line, readable
  fen: string; // where it ends
  folder: string | null; // the folder it is in
  search: string;
}

/** Every studyable line of a repertoire (for Black, only those starting with `first` if given). */
export function buildLineInfos(rep: Repertoire, first: string | null): LineInfo[] {
  const out: LineInfo[] = [];
  for (const ucis of playableLines(rep.moves, rep.side)) {
    if (first && ucis[0] !== first) continue;
    try {
      const r = replay(ucisToMoves(ucis));
      const fens = r.plies.map((p) => p.fen);
      const op = openingAt(fens, fens.length - 1);
      const custom = nodeAt(rep.moves, ucis)?.name?.trim() ?? "";
      const name = custom || op?.name || "Unnamed line";
      out.push({
        key: ucis.join(" "),
        ucis,
        name,
        eco: op?.eco ?? "",
        sans: r.sans,
        text: formatSans(r.sans, 14),
        fen: fens[fens.length - 1],
        folder: folderOfLine(rep.moves, ucis),
        search: `${name} ${op?.eco ?? ""} ${formatSans(r.sans, 400)}`.toLowerCase(),
      });
    } catch (e) {
      console.error("Skipped a line that couldn't be replayed:", e);
    }
  }
  return out;
}

export interface FirstMove {
  uci: string;
  san: string;
  eco: string;
  opening: string;
  fen: string; // the position after it
  lines: number; // lines of yours that answer it
}

/** All 20 first moves for White, with how many of your lines answer each (used for Black repertoires). */
export function firstMoves(rep: Repertoire): FirstMove[] {
  const counts = new Map<string, number>();
  for (const l of playableLines(rep.moves, rep.side)) counts.set(l[0], (counts.get(l[0]) ?? 0) + 1);
  const out: FirstMove[] = [];
  for (const [from, tos] of destsFromFen(START_FEN)) {
    for (const to of tos) {
      const uci = from + to;
      const r = replay(ucisToMoves([uci]));
      const fens = r.plies.map((p) => p.fen);
      const op = openingAt(fens, 1);
      out.push({
        uci,
        san: pvToSan(START_FEN, [uci], 1).replace(/^\d+\.\s*/, ""),
        eco: op?.eco ?? "",
        opening: op?.name ?? "",
        fen: fens[1],
        lines: counts.get(uci) ?? 0,
      });
    }
  }
  // moves with lines first, then the rest (the sort is stable)
  return out.sort((a, b) => Number(b.lines > 0) - Number(a.lines > 0));
}

/** A thumbnail position for a repertoire: where its main line gets to. */
export function previewFen(rep: Repertoire): string {
  try {
    const r = replay(ucisToMoves(extendMain(rep.moves, []).slice(0, 10)));
    return r.plies[r.plies.length - 1].fen;
  } catch {
    return START_FEN;
  }
}
