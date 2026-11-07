import { replay } from "./chessLogic";
import { moveToUci, ucisToMoves } from "./lineTools";
import type { PlayedMove, SavedGame, TakebackRecord } from "./types";

/** A move that was taken back, shown struck out in the move history. */
export interface Ghost {
  san: string;
  free: boolean; // a free takeback from Helped mode (green), not an assist (amber)
}

const matches = (rec: TakebackRecord, finalUcis: string[]) =>
  rec.prefix.every((u, i) => finalUcis[i] === u);

/**
 * For every ply (0 = White's first move) the moves that were played there and
 * then taken back, oldest first. The real move is drawn below them.
 * Takebacks on a line that was itself later taken back further are not shown here.
 */
export function ghostsByPly(
  moves: PlayedMove[],
  records: TakebackRecord[] | undefined,
  startFen?: string // practice games start from a position, not the standard start
): (Ghost[] | undefined)[] {
  const out: (Ghost[] | undefined)[] = [];
  if (!records || records.length === 0) return out;
  const finalUcis = moves.map(moveToUci);
  for (const rec of records) {
    try {
      if (!matches(rec, finalUcis)) continue;
      const k = rec.prefix.length;
      const all = replay(ucisToMoves([...rec.prefix, ...rec.removed]), startFen);
      for (let j = 0; j < rec.removed.length; j++) {
        const ply = k + j;
        if (!out[ply]) out[ply] = [];
        out[ply]!.push({ san: all.sans[ply], free: !!rec.free });
      }
    } catch {
      /* a record that can't be replayed is skipped */
    }
  }
  return out;
}

/** Small notes for things the move history can't show (older saved games). */
export function legacyNotes(game: SavedGame | undefined): string[] {
  if (!game) return [];
  const notes: string[] = [];
  const records = game.takebacks ?? [];
  const finalUcis = game.moves.map(moveToUci);
  const assistedRecords = records.filter((r) => !r.free);
  const missing = (game.assists?.takebacks ?? 0) - assistedRecords.length;
  if (missing > 0) {
    notes.push(`↩ ${missing} takeback${missing > 1 ? "s" : ""} used (not recorded for this game)`);
  }
  const hidden = records.filter((r) => !matches(r, finalUcis)).length;
  if (hidden > 0) {
    notes.push(
      `${hidden} takeback${hidden > 1 ? "s were" : " was"} on a line that was taken back further`
    );
  }
  if (game.assisted && !game.assists) {
    notes.push("Assisted (details weren't recorded for this game)");
  }
  return notes;
}
