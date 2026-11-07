import { makeFen } from "chessops/fen";
import { parseSquare, squareFile } from "chessops/util";
import {
  materialInfo,
  parseUciMove,
  replay,
  startPosition,
  toMove,
} from "./chessLogic";
import { moveToUci } from "./lineTools";
import { live } from "./settings";
import { isBookPosition } from "./openings";
import type { StockfishEngine } from "./engine/stockfish";
import type {
  EvalPoint,
  GameReview,
  MoveClass,
  PlayedMove,
  ReviewedMove,
} from "./types";

/** How deep each position is searched. Higher = more accurate but slower. */
export const REVIEW_DEPTH = 14;

/**
 * Bump this when the grading rules change: saved reviews made with older rules
 * are then run again the next time they are opened.
 */
export const REVIEW_CALIB = 2;

// ---- Grading thresholds (win-chance percentages) ----
const BEST_MAX_LOSS = 2; // "best-level": loses at most this much compared with the engine's top move
const BRILLIANT_MIN_WIN = 70; // after a brilliant sacrifice the mover must be clearly winning
const BRILLIANT_MAX_BEFORE = 90; // ...and not already totally winning (unless the sacrifice stands out)
const BRILLIANT_MIN_GAP = 8; // how far the sacrifice must stand out when already totally winning
const SACRIFICE_MIN_DEFICIT = 2; // net material given up (pawns): a piece, or an exchange
const GREAT_MIN_GAP = 15; // the next best move must be at least this much worse
const GREAT_MIN_BEFORE = 5; // not already lost...
const GREAT_MAX_BEFORE = 95; // ...or already won, where everything works

const MATE_CP = 10000;

/** Win chance (0-100) for the side whose evaluation is `cp` centipawns. */
export const winPct = (cp: number) =>
  50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

export interface LineInfo {
  cp: number; // from the side-to-move's view (mates are mapped to +/-10000)
  mate?: number;
  uci: string; // first move of the line
  pv: string[];
}

export interface PosAnalysis {
  lines: LineInfo[]; // best first; usually 2
}

export type Analyser = (fen: string) => Promise<PosAnalysis>;

/** Connects review to a Stockfish engine: top 2 lines at a fixed depth. */
export function engineAnalyser(engine: StockfishEngine, depth = live.reviewDepth): Analyser {
  return async (fen) => {
    const lines: LineInfo[] = [];
    await engine.search(fen, `depth ${depth}`, {
      multiPv: 2,
      onInfo: (info) => {
        const cp =
          info.mate !== undefined
            ? info.mate > 0
              ? MATE_CP - info.mate
              : -MATE_CP - info.mate
            : info.cp ?? 0;
        lines[info.multipv - 1] = {
          cp,
          mate: info.mate,
          uci: info.pv[0] ?? "",
          pv: info.pv,
        };
      },
    });
    return { lines: lines.filter(Boolean) };
  };
}

function fenAfter(fen: string, uci: string): string | null {
  try {
    const pos = startPosition(fen);
    const m = parseUciMove(uci);
    pos.play(toMove(pos, m.from, m.to, m.promotion));
    return makeFen(pos.toSetup());
  } catch {
    return null;
  }
}

// Material from the mover's point of view (pawn = 1, minor = 3, rook = 5, queen = 9)
function material(fen: string, mover: "white" | "black"): number {
  const d = materialInfo(fen).white.diff;
  return mover === "white" ? d : -d;
}

/** Does this move capture something (including en passant)? */
function isCapture(fen: string, uci: string): boolean {
  try {
    const pos = startPosition(fen);
    const m = parseUciMove(uci);
    const from = parseSquare(m.from)!;
    const to = parseSquare(m.to)!;
    const piece = pos.board.get(from);
    if (!piece) return false;
    if (piece.role === "king" && Math.abs(squareFile(to) - squareFile(from)) === 2) return false; // castling
    if (pos.board.has(to)) return true;
    return piece.role === "pawn" && squareFile(from) !== squareFile(to); // en passant
  } catch {
    return false;
  }
}

/** Taking back on the square where the opponent has just captured. */
function isRecapture(
  fenBeforeOpponent: string,
  opponentUci: string,
  fenBeforeMine: string,
  myUci: string
): boolean {
  return (
    opponentUci.slice(2, 4) === myUci.slice(2, 4) &&
    isCapture(fenBeforeOpponent, opponentUci) &&
    isCapture(fenBeforeMine, myUci)
  );
}

function legalMoveCount(fen: string): number {
  try {
    let n = 0;
    for (const [, tos] of startPosition(fen).allDests()) n += tos.size();
    return n;
  } catch {
    return 99;
  }
}

/**
 * Did the move give up material for good? `pv` is the engine's line from the position
 * AFTER the move (so pv[0] is the opponent's reply). Looks at the position after each of
 * the opponent's moves in that line: material must be down straight after the reply
 * and still be down at the end of the line, so a plain trade or a sacrifice that is
 * won straight back doesn't count.
 */
function isSacrifice(
  fenBefore: string,
  fenAfterMove: string,
  pv: string[],
  mover: "white" | "black"
): boolean {
  if (pv.length === 0) return false;
  const base = material(fenBefore, mover);
  let fen: string | null = fenAfterMove;
  const deficits: number[] = [];
  for (let k = 0; k < Math.min(pv.length, 6) && fen; k++) {
    fen = fenAfter(fen, pv[k]);
    if (fen && k % 2 === 0) deficits.push(material(fen, mover) - base);
  }
  if (deficits.length === 0) return false;
  return (
    deficits[0] <= -SACRIFICE_MIN_DEFICIT &&
    deficits[deficits.length - 1] <= -SACRIFICE_MIN_DEFICIT
  );
}

function label(info: LineInfo, whiteToMove: boolean): string {
  const sign = whiteToMove ? 1 : -1;
  if (info.mate !== undefined) {
    const whiteWins = info.mate * sign > 0;
    return `${whiteWins ? "+" : "-"}M${Math.abs(info.mate)}`;
  }
  const cp = (info.cp * sign) / 100;
  return `${cp > 0 ? "+" : ""}${cp.toFixed(1)}`;
}

/**
 * Reviews a whole game. `analyse` returns the engine's top lines for a position.
 * Positions after the game is already over (mate, draw) are scored without the engine.
 */
export async function reviewGame(
  moves: PlayedMove[],
  analyse: Analyser,
  onProgress?: (done: number, total: number) => void,
  cancelled?: () => boolean,
  startFen?: string
): Promise<GameReview | null> {
  const { plies } = replay(moves, startFen);
  const n = moves.length;
  const ucis = moves.map(moveToUci);

  // 1. analyse every position
  const A: PosAnalysis[] = [];
  for (let k = 0; k <= n; k++) {
    if (cancelled?.()) return null;
    const pos = startPosition(plies[k].fen);
    if (pos.isCheckmate()) {
      A.push({ lines: [{ cp: -MATE_CP, mate: 0, uci: "", pv: [] }] });
    } else if (pos.isEnd()) {
      A.push({ lines: [{ cp: 0, uci: "", pv: [] }] });
    } else {
      const res = await analyse(plies[k].fen);
      if (cancelled?.()) return null;
      A.push(res.lines.length ? res : { lines: [{ cp: 0, uci: "", pv: [] }] });
    }
    onProgress?.(k + 1, n + 1);
  }

  // 2. evaluation of every position, from White's point of view
  const evals: EvalPoint[] = A.map((a, k) => {
    const whiteToMove = plies[k].turn === "white";
    const top = a.lines[0];
    const stm = winPct(top.cp);
    const pct = whiteToMove ? stm : 100 - stm;
    let text = label(top, whiteToMove);
    if (top.mate === 0) text = whiteToMove ? "0-1" : "1-0";
    return { pct, label: text };
  });

  // 3. classify every move
  const out: ReviewedMove[] = [];
  const losses: number[] = [];
  const accSum = { white: 0, black: 0 };
  const accCount = { white: 0, black: 0 };
  let inBook = !startFen; // a practice position isn't an opening

  for (let i = 1; i <= n; i++) {
    const before = A[i - 1];
    const after = A[i];
    const mover = plies[i - 1].turn;
    const played = ucis[i - 1];
    const bestLine = before.lines[0];
    const wBest = winPct(bestLine.cp);
    const playedBest = bestLine.uci === played;

    // Win chance for the mover after the move actually played. This comes from
    // searching the position the move leads to, which also catches tactics the
    // search from the earlier position missed.
    const wAfter = 100 - winPct(after.lines[0].cp);
    const loss = Math.max(0, wBest - wAfter);
    losses.push(loss);

    const second = before.lines[1];
    const gap = second ? wBest - winPct(second.cp) : 0;

    if (inBook && !isBookPosition(ucis.slice(0, i), plies[i].fen)) inBook = false;

    // "Best-level": the engine's top move, or the second line when it is practically as good
    const bestLevel =
      loss <= BEST_MAX_LOSS &&
      (playedBest || (!!second && second.uci === played && gap <= 1.5));

    // A recapture is the obvious reply, never brilliant or great
    const recapture =
      i >= 2 && isRecapture(plies[i - 2].fen, ucis[i - 2], plies[i - 1].fen, played);

    let cls: MoveClass;
    if (inBook) {
      cls = "book";
    } else if (
      // Brilliant: a best move that gives up material for good, and the mover is winning after it
      bestLevel &&
      !recapture &&
      wAfter >= BRILLIANT_MIN_WIN &&
      (wBest <= BRILLIANT_MAX_BEFORE || gap >= BRILLIANT_MIN_GAP) &&
      isSacrifice(plies[i - 1].fen, plies[i].fen, after.lines[0].pv, mover)
    ) {
      cls = "brilliant";
    } else if (
      // Great: the best move, and hard to find because every other move is clearly worse.
      // Not a recapture, not simply escaping a check with one or two legal replies,
      // and not just delivering mate.
      playedBest &&
      loss <= BEST_MAX_LOSS &&
      !recapture &&
      gap >= GREAT_MIN_GAP &&
      wBest >= GREAT_MIN_BEFORE &&
      wBest <= GREAT_MAX_BEFORE &&
      !(startPosition(plies[i - 1].fen).isCheck() && legalMoveCount(plies[i - 1].fen) <= 2) &&
      !startPosition(plies[i].fen).isCheckmate()
    ) {
      cls = "great";
    } else if (playedBest && loss <= BEST_MAX_LOSS) {
      cls = "best";
    } else if (loss <= BEST_MAX_LOSS) {
      cls = "excellent";
    } else if (loss <= 5) {
      cls = "good";
    } else {
      const opponentJustErred = i >= 2 && losses[i - 2] >= 10;
      if (loss <= 20 && opponentJustErred && wBest >= 60) cls = "miss";
      else if (loss <= 10) cls = "inaccuracy";
      else if (loss <= 20) cls = "mistake";
      else cls = "blunder";
    }

    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
    accSum[mover] += acc;
    accCount[mover] += 1;

    out.push({
      cls,
      loss: Math.round(loss * 10) / 10,
      best: bestLine.uci && !playedBest ? bestLine.uci : undefined,
    });
  }

  const avg = (c: "white" | "black") =>
    accCount[c] ? Math.round((accSum[c] / accCount[c]) * 10) / 10 : 0;

  return {
    version: 1,
    depth: live.reviewDepth,
    calib: REVIEW_CALIB,
    moves: out,
    evals,
    accuracy: { white: avg("white"), black: avg("black") },
  };
}
