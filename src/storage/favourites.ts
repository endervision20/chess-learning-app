import {
  BaseDirectory,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

const DIR = "guide";
const FILE = `${DIR}/favourites.json`;
const opts = { baseDir: BaseDirectory.AppData };

export async function loadFavourites(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readTextFile(FILE, opts));
    return Array.isArray(parsed.names) ? parsed.names : [];
  } catch {
    return []; // no file yet
  }
}

export async function saveFavourites(names: string[]): Promise<void> {
  await mkdir(DIR, { ...opts, recursive: true });
  await writeTextFile(FILE, JSON.stringify({ version: 1, names }), opts);
}