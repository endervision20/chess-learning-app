import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { clearFactsCache } from "../statsData";
import { saveMemory } from "./flashcards";

const opts = { baseDir: BaseDirectory.AppData };

/** Deletes every saved game review (they are rebuilt the next time you open a review). */
export async function deleteAllReviews(): Promise<void> {
  try {
    await remove("reviews", { ...opts, recursive: true });
  } catch {
    /* no reviews folder yet: nothing to delete */
  }
  clearFactsCache();
}

/** Forgets how well you know each flashcard (the cards themselves stay). */
export async function resetFlashcardMemory(): Promise<void> {
  await saveMemory({});
}
