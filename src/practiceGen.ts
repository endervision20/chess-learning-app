import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import {
  materialInfo,
  parseUciMove,
  replay,
  startPosition,
  toMove,
} from "./chessLogic";
import type { StockfishEngine } from "./engine/stockfish";
import { OPENING_CHOICES } from "./openings";
import { listGames, loadGame } from "./storage/games";
import type { Color, PracticeKind } from "./types";

export type EndgameType = "any" | "rook" | "pawn" | "minor" | "queen";

export interface PracticePosition {
  fen: string;
  side: Color; // the side you play (it is your move)
  label: string; // shown in the game list and on the board screen
}

export interface GenOptions {
  kind: PracticeKind;
  endgameType: EndgameType;
  engine: StockfishEngine;
  cancelled: () => boolean;
  onStatus: (text: string) => void;
}

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

const MATE = 10000;
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rnd(a.length)];

// ---------------------------------------------------------------------------
// Engine helper: the top lines of a position at a fixed depth
// ---------------------------------------------------------------------------
interface Line {
  cp: number; // from the side to move's view (mates are +/-10000)
  uci: string;
  pv: string[];
}

async function topLines(engine: StockfishEngine, fen: string, depth: number, n: number) {
  const out: Line[] = [];
  await engine.search(fen, `depth ${depth}`, {
    multiPv: n,
    onInfo: (i) => {
      const cp =
        i.mate !== undefined
          ? i.mate > 0
            ? MATE - i.mate
            : -MATE - i.mate
          : i.cp ?? 0;
      out[i.multipv - 1] = { cp, uci: i.pv[0] ?? "", pv: i.pv };
    },
  });
  return out.filter(Boolean);
}

function check(opts: GenOptions) {
  if (opts.cancelled()) {
    opts.engine.stop();
    throw new Cancelled();
  }
}

function fenAfterUci(fen: string, uci: string): string | null {
  try {
    const pos = startPosition(fen);
    const m = parseUciMove(uci);
    pos.play(toMove(pos, m.from, m.to, m.promotion));
    return makeFen(pos.toSetup());
  } catch {
    return null;
  }
}

const materialFor = (fen: string, side: Color) => {
  const d = materialInfo(fen).white.diff;
  return side === "white" ? d : -d;
};

/** A position that is playable: legal, not already over, with a choice of moves. */
function playable(fen: string): Chess | null {
  try {
    const pos = startPosition(fen);
    if (pos.isEnd()) return null;
    return pos;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Placing pieces at random (basic mates and endgames)
// ---------------------------------------------------------------------------
function fenOf(board: string[], turn: Color): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const c = board[r * 8 + f];
      if (!c) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += c;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${turn === "white" ? "w" : "b"} - - 0 1`;
}

const cheb = (a: number, b: number) =>
  Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)));

/** `strong` and `weak` are piece letters without the king, e.g. "RPP". The strong side moves. */
function randomPlacement(strong: string, weak: string, strongColor: Color): string | null {
  const board: string[] = Array(64).fill("");
  const put = (ch: string): number => {
    const isPawn = ch.toLowerCase() === "p";
    for (let t = 0; t < 200; t++) {
      const s = rnd(64);
      if (board[s]) continue;
      const rank = s >> 3;
      if (isPawn && (rank === 0 || rank === 7)) continue;
      board[s] = ch;
      return s;
    }
    return -1;
  };
  const weakColor: Color = strongColor === "white" ? "black" : "white";
  const as = (ch: string, c: Color) => (c === "white" ? ch.toUpperCase() : ch.toLowerCase());

  const k1 = put(as("K", strongColor));
  const k2 = put(as("K", weakColor));
  if (k1 < 0 || k2 < 0 || cheb(k1, k2) < 2) return null;

  const bishops: number[] = [];
  for (const ch of strong) {
    const s = put(as(ch, strongColor));
    if (s < 0) return null;
    if (ch === "B") bishops.push(s);
  }
  for (const ch of weak) if (put(as(ch, weakColor)) < 0) return null;

  // two bishops must be on opposite colours
  if (bishops.length === 2) {
    const col = (s: number) => ((s & 7) + (s >> 3)) % 2;
    if (col(bishops[0]) === col(bishops[1])) return null;
  }
  return fenOf(board, strongColor);
}
const fmtSide = (s: string) => "K" + [...s].map((c) => "+" + c).join("");

// ---------------------------------------------------------------------------
// Basic mates
// ---------------------------------------------------------------------------
const MATES = [
  { strong: "Q", label: "Basic mate: queen", w: 3 },
  { strong: "R", label: "Basic mate: rook", w: 3 },
  { strong: "BB", label: "Basic mate: two bishops", w: 2 },
  { strong: "BN", label: "Basic mate: bishop and knight", w: 1 },
];

function weighted<T extends { w: number }>(list: T[]): T {
  let r = Math.random() * list.reduce((s, x) => s + x.w, 0);
  for (const x of list) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function genMate(): PracticePosition {
  for (let t = 0; t < 500; t++) {
    const cfg = weighted(MATES);
    const side: Color = Math.random() < 0.5 ? "white" : "black";
    const fen = randomPlacement(cfg.strong, "", side);
    if (!fen || !playable(fen)) continue;
    // don't hand over a position that is mate in one already
    const pos = playable(fen)!;
    let mateInOne = false;
    for (const [from, tos] of pos.allDests()) {
      for (const to of tos) {
        const p2 = pos.clone();
        p2.play({ from, to, promotion: undefined });
        if (p2.isCheckmate()) mateInOne = true;
      }
    }
    if (mateInOne) continue;
    return { fen, side, label: cfg.label };
  }
  throw new Error("Couldn't set up a position. Try again.");
}

// ---------------------------------------------------------------------------
// Endgames (placed at random, then checked with Stockfish: it must be winning)
// ---------------------------------------------------------------------------
const ENDGAMES: { type: Exclude<EndgameType, "any">; strong: string; weak: string }[] = [
  { type: "rook", strong: "RP", weak: "R" },
  { type: "rook", strong: "RPP", weak: "RP" },
  { type: "rook", strong: "RPPP", weak: "RPP" },
  { type: "rook", strong: "RPP", weak: "R" },
  { type: "rook", strong: "RB", weak: "R" },
  { type: "pawn", strong: "P", weak: "" },
  { type: "pawn", strong: "PP", weak: "P" },
  { type: "pawn", strong: "PPP", weak: "PP" },
  { type: "pawn", strong: "PPP", weak: "PPP" },
  { type: "minor", strong: "BP", weak: "" },
  { type: "minor", strong: "NP", weak: "" },
  { type: "minor", strong: "BPP", weak: "B" },
  { type: "minor", strong: "NPP", weak: "N" },
  { type: "minor", strong: "BPP", weak: "N" },
  { type: "minor", strong: "BN", weak: "N" },
  { type: "queen", strong: "Q", weak: "R" },
  { type: "queen", strong: "QP", weak: "Q" },
  { type: "queen", strong: "QPP", weak: "QP" },
  { type: "queen", strong: "Q", weak: "BN" },
];

async function genEndgame(opts: GenOptions): Promise<PracticePosition> {
  const pool = ENDGAMES.filter((e) => opts.endgameType === "any" || e.type === opts.endgameType);
  let tried = 0;
  for (let t = 0; t < 400; t++) {
    check(opts);
    const cfg = pick(pool);
    const side: Color = Math.random() < 0.5 ? "white" : "black";
    const fen = randomPlacement(cfg.strong, cfg.weak, side);
    if (!fen || !playable(fen)) continue;
    tried++;
    opts.onStatus(`Checking endgames with Stockfish (${tried})...`);
    const ls = await topLines(opts.engine, fen, 11, 1);
    check(opts);
    const cp = ls[0]?.cp ?? 0;
    // clearly winning, but not a position that is over in a couple of moves
    if (cp >= 150 && cp < 3000) {
      return { fen, side, label: `Endgame: ${fmtSide(cfg.strong)} vs ${fmtSide(cfg.weak)}` };
    }
  }
  throw new Error("Couldn't find a good endgame. Try again.");
}

// ---------------------------------------------------------------------------
// Middlegames: conversion / winning material / defending
// ---------------------------------------------------------------------------
type MiddleKind = "conversion" | "material" | "defence";

const MIDDLE_LABEL: Record<MiddleKind, string> = {
  conversion: "Convert the advantage",
  material: "Win material",
  defence: "Defend the position",
};

/** Is this position right for the exercise? `ls` is the engine's top 2 lines. */
function judge(kind: MiddleKind, fen: string, side: Color, ls: Line[], quick: boolean): boolean {
  if (ls.length === 0) return false;
  const cp = ls[0].cp;
  if (kind === "conversion") {
    return quick ? cp >= 150 && cp <= 1100 : cp >= 250 && cp <= 900;
  }
  if (kind === "defence") {
    return quick ? cp <= -60 && cp >= -600 : cp <= -120 && cp >= -450;
  }
  // win material: one move clearly stands out and it wins something that stays won
  if (ls.length < 2) return false;
  const gap = cp - ls[1].cp;
  if (quick) return cp >= 80 && gap >= 100;
  if (cp < 150 || cp > 800 || gap < 150) return false;
  const base = materialFor(fen, side);
  let f: string | null = fen;
  const gains: number[] = [];
  const pv = ls[0].pv;
  for (let k = 0; k < Math.min(pv.length, 4) && f; k++) {
    f = fenAfterUci(f, pv[k]);
    if (f) gains.push(materialFor(f, side) - base);
  }
  if (gains.length < 2) return false;
  const settled = gains.length >= 3 ? Math.min(gains[1], gains[2]) : gains[1];
  return settled >= 1;
}

/** Positions from your own saved games (instant, and they are your kind of position). */
async function ownPositions(): Promise<string[]> {
  try {
    const list = await listGames();
    const fens: string[] = [];
    const chosen = [...list].sort(() => Math.random() - 0.5).slice(0, 12);
    for (const item of chosen) {
      try {
        const g = await loadGame(item.fileName);
        if (g.moves.length < 16) continue;
        const { plies } = replay(g.moves);
        for (let k = 0; k < 3; k++) {
          const ply = 10 + rnd(Math.max(1, plies.length - 12));
          if (plies[ply]) fens.push(plies[ply].fen);
        }
      } catch {
        /* skip an unreadable game */
      }
    }
    return fens;
  } catch {
    return [];
  }
}

function randomOpening(): string[] {
  const options = OPENING_CHOICES.filter((o) => o.ucis.length >= 4 && o.ucis.length <= 12);
  return pick(options).ucis;
}

async function genMiddle(opts: GenOptions, kind: MiddleKind): Promise<PracticePosition> {
  const deadline = Date.now() + 120000;
  let checked = 0;
  const label = MIDDLE_LABEL[kind];

  const finish = (fen: string): PracticePosition => ({
    fen,
    side: startPosition(fen).turn,
    label,
  });

  // 1. positions from your own games
  opts.onStatus("Looking through your games...");
  for (const fen of await ownPositions()) {
    check(opts);
    const pos = playable(fen);
    if (!pos) continue;
    checked++;
    opts.onStatus(`Checking positions (${checked})...`);
    const quick = await topLines(opts.engine, fen, 9, 2);
    if (!judge(kind, fen, pos.turn, quick, true)) continue;
    const deep = await topLines(opts.engine, fen, 13, 2);
    check(opts);
    if (judge(kind, fen, pos.turn, deep, false)) return finish(fen);
  }

  // 2. otherwise play out a random game from a known opening and look for a good moment
  while (Date.now() < deadline) {
    let pos = Chess.default();
    let ply = 0;
    for (const u of randomOpening()) {
      const m = parseUciMove(u);
      try {
        pos.play(toMove(pos, m.from, m.to, m.promotion));
        ply++;
      } catch {
        break;
      }
    }
    for (let step = 0; step < 70 && Date.now() < deadline; step++) {
      check(opts);
      if (pos.isEnd()) break;
      const fen = makeFen(pos.toSetup());
      const cand = await topLines(opts.engine, fen, 8, 4);
      check(opts);
      if (cand.length === 0) break;

      if (ply >= 14 && ply % 2 === 0) {
        checked++;
        opts.onStatus(`Looking for a good position (${checked} checked)...`);
        if (judge(kind, fen, pos.turn, cand, true)) {
          const deep = await topLines(opts.engine, fen, 13, 2);
          check(opts);
          if (judge(kind, fen, pos.turn, deep, false)) return finish(fen);
        }
      }

      // the next move: usually near the best, sometimes a small slip so the game gets lopsided
      const best = cand[0].cp;
      const slack = Math.random() < 0.3 ? 140 : 40;
      const pool = cand.filter((c) => c.uci && c.cp >= best - slack);
      const choice = pick(pool.length ? pool : cand);
      const m = parseUciMove(choice.uci);
      try {
        pos.play(toMove(pos, m.from, m.to, m.promotion));
        ply++;
      } catch {
        break;
      }
    }
  }
  throw new Error("Couldn't find a good position in time. Try again.");
}

// ---------------------------------------------------------------------------
export async function generatePosition(opts: GenOptions): Promise<PracticePosition> {
  opts.onStatus("Setting up...");
  switch (opts.kind) {
    case "mates":
      return genMate();
    case "endgame":
      return genEndgame(opts);
    default:
      return genMiddle(opts, opts.kind);
  }
}
