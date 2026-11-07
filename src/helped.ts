import type { DrawShape } from "chessground/draw";
import { makeFen } from "chessops/fen";
import {
  materialInfo,
  parseUciMove,
  pvToSan,
  startPosition,
  toMove,
} from "./chessLogic";
import { bookMoves } from "./openings";
import { winPct, type Analyser } from "./review";
import type { Color, ForcedOpening } from "./types";

/** A move that costs at least this much win chance gets a warning. */
export const BAD_MOVE_LOSS = 15;

export interface HelpFinding {
  lines: string[]; // what to tell the player
  shapes: DrawShape[]; // arrows to draw on the board
  bad: boolean; // the move was a bad one
  book: boolean; // the move left the opening book
}

// "12. Nf3" / "12... Nf6" -> "Nf3" / "Nf6"
const sanOf = (fen: string, uci: string) =>
  pvToSan(fen, [uci], 1).replace(/^\d+\.(\.\.)?\s*/, "");

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

function material(fen: string, mover: Color): number {
  const d = materialInfo(fen).white.diff;
  return mover === "white" ? d : -d;
}

function worth(points: number): string {
  if (points >= 9) return "your queen";
  if (points >= 5) return "a rook";
  if (points >= 3) return "a knight or bishop";
  if (points >= 2) return "two pawns' worth of material";
  return "a pawn";
}

/**
 * Checks a move the player just made. Returns null if there is nothing to
 * say, otherwise what is wrong with it and how the opponent punishes it.
 */
export async function checkMove(opts: {
  analyse: Analyser;
  fenBefore: string;
  uci: string; // the move that was played
  mover: Color;
  book?: { forced: ForcedOpening; played: string[] }; // moves before this one
}): Promise<HelpFinding | null> {
  const { analyse, fenBefore, uci, mover, book } = opts;
  const lines: string[] = [];
  const shapes: DrawShape[] = [];
  let leftBook = false;
  let playedBookMove = false;

  // 1. Opening book: did the move leave the line?
  if (book) {
    const options = bookMoves(book.forced, book.played);
    if (options.length > 0) {
      const mine = uci.slice(0, 4);
      playedBookMove = options.some((o) => o.uci === mine);
      if (!playedBookMove) {
        leftBook = true;
        const sans = options.slice(0, 4).map((o) => sanOf(fenBefore, o.uci));
        lines.push(`That leaves the book. Book moves here: ${sans.join(", ")}.`);
        const top = parseUciMove(options[0].uci);
        shapes.push({ orig: top.from, dest: top.to, brush: "green" });
      }
    }
  }

  // 2. Engine: is it a bad move?
  let bad = false;
  if (!playedBookMove) {
    const before = await analyse(fenBefore);
    const best = before.lines[0];
    const fenAfter = fenAfterUci(fenBefore, uci);
    if (best && best.uci !== uci && fenAfter && !startPosition(fenAfter).isEnd()) {
      const after = await analyse(fenAfter);
      const top = after.lines[0];
      if (top) {
        const loss = winPct(best.cp) - (100 - winPct(top.cp));
        if (loss >= BAD_MOVE_LOSS && top.pv[0]) {
          bad = true;
          const reply = top.pv[0];
          const replySan = sanOf(fenAfter, reply);
          const opponent = mover === "white" ? "Black" : "White";

          // material lost along the opponent's best line
          const base = material(fenBefore, mover);
          const f1 = fenAfterUci(fenAfter, reply);
          let lost = f1 ? base - material(f1, mover) : 0;
          if (f1 && top.pv.length >= 3) {
            const f2 = fenAfterUci(f1, top.pv[1]);
            const f3 = f2 ? fenAfterUci(f2, top.pv[2]) : null;
            if (f3) lost = Math.min(lost, base - material(f3, mover));
          }

          if (top.mate !== undefined && top.mate > 0) {
            lines.push(
              `Bad move: it allows checkmate. ${opponent} plays ${replySan} and mates in ${top.mate}.`
            );
          } else if (lost >= 1) {
            lines.push(
              `Bad move: after ${opponent}'s ${replySan} you lose ${worth(lost)}.`
            );
          } else {
            lines.push(
              `Bad move: ${opponent}'s ${replySan} gives them a big advantage (about ${Math.round(
                loss
              )}% win chance lost).`
            );
          }
          const r = parseUciMove(reply);
          shapes.push({ orig: r.from, dest: r.to, brush: "red" });
        }
      }
    }
  }

  if (!bad && !leftBook) return null;
  return { lines, shapes, bad, book: leftBook };
}