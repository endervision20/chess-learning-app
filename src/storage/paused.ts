import {
  BaseDirectory,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { planPause } from "../pausedLogic";
import type { PausedGame } from "../types";

const DIR = "paused";
const opts = { baseDir: BaseDirectory.AppData };

export async function listPaused(): Promise<PausedGame[]> {
  await mkdir(DIR, { ...opts, recursive: true });
  const entries = await readDir(DIR, opts);
  const out: PausedGame[] = [];
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith(".json")) continue;
    try {
      const p = JSON.parse(await readTextFile(`${DIR}/${e.name}`, opts)) as PausedGame;
      if (p && p.version === 1 && Array.isArray(p.moves)) out.push(p);
    } catch (err) {
      console.error("Couldn't read a paused game:", e.name, err);
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt)); // newest first
}

export async function deletePaused(id: string): Promise<void> {
  try {
    await remove(`${DIR}/${id}.json`, opts);
  } catch {
    /* already gone */
  }
}

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  const all = await listPaused();
  const p = all.find((g) => g.id === id);
  if (!p) return;
  await writeTextFile(`${DIR}/${id}.json`, JSON.stringify({ ...p, pinned }), opts);
}

export interface PauseResult {
  ok: boolean;
  evicted: PausedGame[]; // pushed out to make room (the caller saves them as losses)
}

/**
 * Pauses a game. `replaceId` is the paused game this one was resumed from:
 * it is replaced rather than counted twice.
 */
export async function pauseGame(
  game: PausedGame,
  max: number,
  replaceId?: string
): Promise<PauseResult> {
  const existing = (await listPaused()).filter((p) => p.id !== replaceId);
  const plan = planPause(existing, max);
  if (!plan.ok) return { ok: false, evicted: [] };
  await writeTextFile(`${DIR}/${game.id}.json`, JSON.stringify(game), opts);
  for (const e of plan.evict) await deletePaused(e.id);
  if (replaceId) await deletePaused(replaceId);
  return { ok: true, evicted: plan.evict };
}