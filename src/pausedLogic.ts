import { NO_ASSISTS, NO_HELP, totalAssists, type PausedGame, type SavedGame } from "./types";
import { otherColor } from "./chessLogic";

export interface PausePlan {
  ok: boolean; // false = there is no room (every paused game is pinned)
  evict: PausedGame[]; // the oldest unpinned games, pushed out to make room
}

/** Which paused games must go to make room for one more? */
export function planPause(existing: PausedGame[], max: number): PausePlan {
  const excess = existing.length + 1 - Math.max(1, max);
  if (excess <= 0) return { ok: true, evict: [] };
  const candidates = existing
    .filter((p) => !p.pinned)
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt)); // oldest first
  if (candidates.length < excess) return { ok: false, evict: [] };
  return { ok: true, evict: candidates.slice(0, excess) };
}

/** A paused game that was pushed out counts as a loss by abandonment. */
export function abandonedGame(p: PausedGame): SavedGame {
  const assists = p.assists ?? NO_ASSISTS;
  return {
    version: 1,
    date: p.startedAt,
    playerColor: p.playerColor,
    botElo: p.config.elo,
    timeControl: p.config.timeControl,
    moves: p.moves,
    result: "loss",
    winner: otherColor(p.playerColor),
    reason: "abandonment",
    assisted: totalAssists(assists) > 0,
    assists,
    helped: p.config.helped,
    help: p.help ?? NO_HELP,
    takebacks: p.takebacks,
  };
}