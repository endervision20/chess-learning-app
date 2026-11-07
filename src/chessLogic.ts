import { Chess } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { chessgroundDests } from "chessops/compat";
import { makeSanAndPlay } from "chessops/san";
import { makeSquare, parseSquare, squareFile, squareRank } from "chessops/util";
import type { Move } from "chessops/types";
import type { Key } from "chessground/types";
import type { Color, PromotionRole } from "./types";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const otherColor = (c: Color): Color => (c === "white" ? "black" : "white");

/** Standard start, or a position from a FEN. Throws if the FEN is invalid. */
export function startPosition(fen?: string): Chess {
  if (!fen) return Chess.default();
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

// Convert a chessground move (square names) into a chessops Move.
export function toMove(
  pos: Chess,
  from: Key,
  to: Key,
  promotion?: PromotionRole
): Move {
  const f = parseSquare(from)!;
  const t = parseSquare(to)!;
  const piece = pos.board.get(f);

  // Castling: chessops wants "king takes own rook"
  if (piece?.role === "king" && Math.abs(squareFile(t) - squareFile(f)) === 2) {
    const rookFile = squareFile(t) > squareFile(f) ? 7 : 0;
    return { from: f, to: rookFile + 8 * squareRank(f) };
  }
  if (piece?.role === "pawn" && (squareRank(t) === 0 || squareRank(t) === 7)) {
    return { from: f, to: t, promotion: promotion ?? "queen" };
  }
  return { from: f, to: t };
}

const PROMO_CHAR: Record<string, PromotionRole> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

/** "e7e8n" -> { from: "e7", to: "e8", promotion: "knight" } */
export function parseUciMove(uci: string): {
  from: Key;
  to: Key;
  promotion?: PromotionRole;
} {
  return {
    from: uci.slice(0, 2) as Key,
    to: uci.slice(2, 4) as Key,
    promotion: uci.length > 4 ? PROMO_CHAR[uci[4]] : undefined,
  };
}
/** The square a side's king stands on, e.g. "e1" (null if there isn't one). */
export function kingSquare(fen: string, color: Color): Key | null {
  try {
    const sq = startPosition(fen).board.kingOf(color);
    return sq === undefined ? null : (makeSquare(sq) as Key);
  } catch {
    return null;
  }
}
/** Legal destinations for the side to move in a FEN. */
export function destsFromFen(fen: string): Map<Key, Key[]> {
  try {
    return chessgroundDests(startPosition(fen)) as Map<Key, Key[]>;
  } catch {
    return new Map();
  }
}

export interface Ply {
  fen: string;
  turn: Color;
  check: boolean;
}

function snapshot(pos: Chess): Ply {
  return { fen: makeFen(pos.toSetup()), turn: pos.turn, check: pos.isCheck() };
}

// Position identity for repetition: piece placement, turn, castling, en passant
const repKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

// Replay every move from the start (or from a FEN). Gives the final position
// plus a snapshot, SAN and repetition key for each ply.
export function replay(
  moves: { from: Key; to: Key; promotion?: PromotionRole }[],
  startFen?: string
) {
  const pos = startPosition(startFen);
  const plies: Ply[] = [snapshot(pos)];
  const keys: string[] = [repKey(plies[0].fen)];
  const sans: string[] = [];
  for (const m of moves) {
    sans.push(makeSanAndPlay(pos, toMove(pos, m.from, m.to, m.promotion)));
    const p = snapshot(pos);
    plies.push(p);
    keys.push(repKey(p.fen));
  }
  return { pos, plies, sans, keys };
}

/** Turn an engine line (UCI moves) into readable text: "12. Nf3 Nc6 13. Bb5" */
export function pvToSan(fen: string, pv: string[], maxPlies = 10): string {
  let pos: Chess;
  try {
    pos = startPosition(fen);
  } catch {
    return "";
  }
  const out: string[] = [];
  for (let i = 0; i < Math.min(pv.length, maxPlies); i++) {
    try {
      const m = parseUciMove(pv[i]);
      const prefix =
        pos.turn === "white"
          ? `${pos.fullmoves}.`
          : i === 0
          ? `${pos.fullmoves}...`
          : "";
      const san = makeSanAndPlay(pos, toMove(pos, m.from, m.to, m.promotion));
      out.push(prefix ? `${prefix} ${san}` : san);
    } catch {
      break;
    }
  }
  return out.join(" ");
}

export interface Outcome {
  winner: Color | null; // null = draw
  reason: string;
}

export function getOutcome(pos: Chess, keys: string[]): Outcome | null {
  if (pos.isCheckmate()) return { winner: otherColor(pos.turn), reason: "checkmate" };
  if (pos.isStalemate()) return { winner: null, reason: "stalemate" };
  if (pos.isInsufficientMaterial()) return { winner: null, reason: "insufficient material" };
  const last = keys[keys.length - 1];
  if (keys.filter((k) => k === last).length >= 3)
    return { winner: null, reason: "threefold repetition" };
  if (pos.halfmoves >= 100) return { winner: null, reason: "the 50-move rule" };
  return null;
}

// ---- Captured pieces and material ----
const START_COUNT: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const GLYPH: Record<Color, Record<string, string>> = {
  white: { q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  black: { q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

// The +/- difference is counted from the real pieces on the board, so it is
// exact even after promotions. The captured-piece icons are derived from piece
// counts (a promotion is accounted for), so they can be slightly off in very
// rare cases, such as a promoted piece that was later captured.
export function materialInfo(fen: string) {
  const count: Record<Color, Record<string, number>> = {
    white: { q: 0, r: 0, b: 0, n: 0, p: 0 },
    black: { q: 0, r: 0, b: 0, n: 0, p: 0 },
  };
  for (const ch of fen.split(" ")[0]) {
    const lower = ch.toLowerCase();
    if ("qrbnp".includes(lower) && /[a-z]/i.test(ch)) {
      count[ch === lower ? "black" : "white"][lower]++;
    }
  }
  const score = (c: Color) =>
    Object.keys(VALUE).reduce((s, k) => s + count[c][k] * VALUE[k], 0);
  const diff = score("white") - score("black");

  // Pieces of `opp` that have been taken
  const capturedBy = (opp: Color) => {
    const c = count[opp];
    const pieces = ["q", "r", "b", "n"];
    const promoted = pieces.reduce(
      (s, k) => s + Math.max(0, c[k] - START_COUNT[k]),
      0
    );
    const pawnsTaken = Math.max(0, START_COUNT.p - c.p - promoted);
    const parts = pieces.map((k) =>
      GLYPH[opp][k].repeat(Math.max(0, START_COUNT[k] - c[k]))
    );
    parts.push(GLYPH[opp].p.repeat(pawnsTaken));
    return parts.join("");
  };

  return {
    white: { captured: capturedBy("black"), diff },
    black: { captured: capturedBy("white"), diff: -diff },
  };
}

// ---- Formatting ----
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10000) return `0:0${(total / 1000).toFixed(1)}`;
  const sec = Math.floor(total / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatSpent(ms: number): string {
  return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : formatClock(ms);
}