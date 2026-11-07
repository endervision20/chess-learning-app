import { Chess, type Position } from "chessops/chess";
import { parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";
import { isNormal, type Move } from "chessops/types";
import { makeSquare, squareFile, squareRank } from "chessops/util";
import type { Key } from "chessground/types";
import { parseUciMove } from "./chessLogic";
import type { PlayedMove, PromotionRole } from "./types";

const PROMO_CHAR: Record<PromotionRole, string> = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
};

export const moveToUci = (m: { from: Key; to: Key; promotion?: PromotionRole }) =>
  m.from + m.to + (m.promotion ? PROMO_CHAR[m.promotion] : "");

export const ucisToMoves = (ucis: string[]): PlayedMove[] =>
  ucis.map((u) => parseUciMove(u));

// chessops writes castling as "king takes rook"; the board wants the king's real square
export function toBoardMove(pos: Position, mv: Move): PlayedMove {
  if (!isNormal(mv)) throw new Error("Unsupported move");
  let to = mv.to;
  const piece = pos.board.get(mv.from);
  const target = pos.board.get(mv.to);
  if (piece?.role === "king" && target?.role === "rook" && target.color === piece.color) {
    to = (squareFile(mv.to) > squareFile(mv.from) ? 6 : 2) + 8 * squareRank(mv.from);
  }
  return {
    from: makeSquare(mv.from) as Key,
    to: makeSquare(to) as Key,
    promotion: mv.promotion as PromotionRole | undefined,
  };
}

/** ["e4", "c5", "Nf3"] -> ["e2e4", "c7c5", "g1f3"] */
export function sanToUcis(sans: string[]): string[] {
  const pos = Chess.default();
  const out: string[] = [];
  for (const san of sans) {
    const mv = parseSan(pos, san);
    if (!mv) throw new Error(`Bad move "${san}"`);
    out.push(moveToUci(toBoardMove(pos, mv)));
    pos.play(mv);
  }
  return out;
}

/** Reads the first game in some PGN text (or just "1. e4 c5 2. Nf3 ..."). */
export function importPgn(text: string): { moves: PlayedMove[]; startFen?: string } {
  const games = parsePgn(text);
  if (games.length === 0) throw new Error("No game found in that text.");
  const game = games[0];
  const pos = startingPosition(game.headers).unwrap();
  const moves: PlayedMove[] = [];
  for (const node of game.moves.mainline()) {
    const mv = parseSan(pos, node.san);
    if (!mv) {
      throw new Error(`Couldn't play "${node.san}" (after ${moves.length} moves).`);
    }
    moves.push(toBoardMove(pos, mv));
    pos.play(mv);
  }
  if (moves.length === 0) throw new Error("That PGN has no moves.");
  return { moves, startFen: game.headers.get("FEN") };
}
