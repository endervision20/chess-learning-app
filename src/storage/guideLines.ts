import {
  BaseDirectory,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { UserLine } from "../types";

const DIR = "guide";
const FILE = `${DIR}/lines.json`;
const opts = { baseDir: BaseDirectory.AppData };

export async function loadUserLines(): Promise<UserLine[]> {
  try {
    const parsed = JSON.parse(await readTextFile(FILE, opts));
    return Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    return []; // no file yet
  }
}

async function saveAll(lines: UserLine[]) {
  await mkdir(DIR, { ...opts, recursive: true });
  await writeTextFile(FILE, JSON.stringify({ version: 1, lines }), opts);
}

export async function addUserLine(
  line: Omit<UserLine, "id" | "created">
): Promise<UserLine[]> {
  const all = await loadUserLines();
  all.push({
    ...line,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    created: new Date().toISOString(),
  });
  await saveAll(all);
  return all;
}

/** Changes some fields of one of your lines (name, note, notes, moves, side...). */
export async function updateUserLine(
  id: string,
  patch: Partial<Omit<UserLine, "id" | "created">>
): Promise<UserLine[]> {
  const all = (await loadUserLines()).map((l) => (l.id === id ? { ...l, ...patch } : l));
  await saveAll(all);
  return all;
}

export async function deleteUserLine(id: string): Promise<UserLine[]> {
  const all = (await loadUserLines()).filter((l) => l.id !== id);
  await saveAll(all);
  return all;
}
