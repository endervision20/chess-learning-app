import {
  BaseDirectory,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { GameReview } from "../types";

const DIR = "reviews";
const opts = { baseDir: BaseDirectory.AppData };

/** A saved review for this game file, or null if there isn't one. */
export async function loadReview(fileName: string): Promise<GameReview | null> {
  try {
    const parsed = JSON.parse(await readTextFile(`${DIR}/${fileName}`, opts));
    return parsed && parsed.version === 1 ? (parsed as GameReview) : null;
  } catch {
    return null;
  }
}

export async function saveReview(fileName: string, review: GameReview): Promise<void> {
  await mkdir(DIR, { ...opts, recursive: true });
  await writeTextFile(`${DIR}/${fileName}`, JSON.stringify(review), opts);
}
