import {
  BaseDirectory,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { Repertoire } from "../types";

// One file per repertoire: repertoires/<id>.json
const DIR = "repertoires";
const opts = { baseDir: BaseDirectory.AppData };

export async function listRepertoires(): Promise<Repertoire[]> {
  await mkdir(DIR, { ...opts, recursive: true });
  const entries = await readDir(DIR, opts);
  const out: Repertoire[] = [];
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith(".json")) continue;
    try {
      const r = JSON.parse(await readTextFile(`${DIR}/${e.name}`, opts)) as Repertoire;
      if (r && r.version === 1 && Array.isArray(r.moves)) out.push(r);
    } catch (err) {
      console.error("Couldn't read a repertoire:", e.name, err);
    }
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated)); // newest first
}

export async function loadRepertoire(id: string): Promise<Repertoire> {
  return JSON.parse(await readTextFile(`${DIR}/${id}.json`, opts));
}

export async function saveRepertoire(rep: Repertoire): Promise<void> {
  await mkdir(DIR, { ...opts, recursive: true });
  await writeTextFile(`${DIR}/${rep.id}.json`, JSON.stringify(rep), opts);
}

export async function deleteRepertoire(id: string): Promise<void> {
  try {
    await remove(`${DIR}/${id}.json`, opts);
  } catch {
    /* already gone */
  }
}
