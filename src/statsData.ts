import { analysisEngine } from "./engine/stockfish";
import { engineAnalyser, reviewGame } from "./review";
import { factsOf, type GameFacts } from "./stats";
import { loadGame, type GameListItem } from "./storage/games";
import { loadReview, saveReview } from "./storage/reviews";

// What we know about each game for the Stats page, kept in memory so changing a filter is instant.
const FACTS = new Map<string, GameFacts>();

/** Forget everything loaded so far (used after the saved reviews are deleted). */
export function clearFactsCache() {
  FACTS.clear();
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r));

/** Loads (or reuses) the facts for these games. Games that can't be read are skipped. */
export async function loadFacts(
  items: GameListItem[],
  onProgress?: (done: number, total: number) => void,
  cancelled?: () => boolean
): Promise<GameFacts[]> {
  const out: GameFacts[] = [];
  for (let i = 0; i < items.length; i++) {
    if (cancelled?.()) break;
    const item = items[i];
    const hit = FACTS.get(item.fileName);
    if (hit) {
      out.push(hit);
    } else {
      try {
        const game = await loadGame(item.fileName);
        const review = await loadReview(item.fileName);
        const f = factsOf(item, game, review);
        FACTS.set(item.fileName, f);
        out.push(f);
      } catch (e) {
        console.error("Couldn't read a game for the stats:", item.fileName, e);
      }
    }
    if ((i + 1) % 10 === 0 || i === items.length - 1) {
      onProgress?.(i + 1, items.length);
      await yieldToUi();
    }
  }
  return out;
}

/** Reviews games that haven't been reviewed yet (this is the slow bit) and saves each review. */
export async function reviewMissing(
  items: GameListItem[],
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean
): Promise<void> {
  const analyser = engineAnalyser(analysisEngine);
  for (let i = 0; i < items.length; i++) {
    if (cancelled()) return;
    onProgress(i, items.length);
    const item = items[i];
    try {
      const game = await loadGame(item.fileName);
      if (game.moves.length === 0) continue;
      const review = await reviewGame(game.moves, analyser, undefined, cancelled, game.startFen);
      if (!review || cancelled()) return;
      await saveReview(item.fileName, review);
      FACTS.set(item.fileName, factsOf(item, game, review));
    } catch (e) {
      console.error("Couldn't review a game:", item.fileName, e);
    }
  }
  onProgress(items.length, items.length);
}
