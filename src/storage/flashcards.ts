import {
  BaseDirectory,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { CardMemory, FlashLine } from "../types";

const DIR = "flashcards";
const LINES_FILE = `${DIR}/lines.json`;
const MEMORY_FILE = `${DIR}/memory.json`;
const opts = { baseDir: BaseDirectory.AppData };

export async function loadFlashLines(): Promise<FlashLine[]> {
  try {
    const parsed = JSON.parse(await readTextFile(LINES_FILE, opts));
    return Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    return []; // no file yet
  }
}

async function saveLines(lines: FlashLine[]) {
  await mkdir(DIR, { ...opts, recursive: true });
  await writeTextFile(LINES_FILE, JSON.stringify({ version: 1, lines }), opts);
}

/** Adds a line to the flashcards. Returns false if the same line (and side) was already there. */
export async function addFlashLine(
  line: Omit<FlashLine, "id" | "created">
): Promise<boolean> {
  const all = await loadFlashLines();
  const key = line.ucis.join(" ");
  if (all.some((l) => l.side === line.side && l.ucis.join(" ") === key)) return false;
  all.push({
    ...line,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    created: new Date().toISOString(),
  });
  await saveLines(all);
  return true;
}

export async function deleteFlashLine(id: string): Promise<FlashLine[]> {
  const all = (await loadFlashLines()).filter((l) => l.id !== id);
  await saveLines(all);
  return all;
}

export async function loadMemory(): Promise<Record<string, CardMemory>> {
  try {
    const parsed = JSON.parse(await readTextFile(MEMORY_FILE, opts));
    return parsed && typeof parsed.cards === "object" ? parsed.cards : {};
  } catch {
    return {};
  }
}

export async function saveMemory(cards: Record<string, CardMemory>): Promise<void> {
  await mkdir(DIR, { ...opts, recursive: true });
  await writeTextFile(MEMORY_FILE, JSON.stringify({ version: 1, cards }), opts);
}

/** Replaces every line that came from one repertoire with its current lines (progress is kept: it is per position). */
export async function replaceFlashGroup(
  group: string,
  lines: Omit<FlashLine, "id" | "created" | "group">[]
): Promise<number> {
  const all = (await loadFlashLines()).filter((l) => l.group !== group);
  const now = new Date().toISOString();
  lines.forEach((line, i) =>
    all.push({
      ...line,
      group,
      id: Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 6),
      created: now,
    })
  );
  await saveLines(all);
  return lines.length;
}

export async function deleteFlashGroup(group: string): Promise<FlashLine[]> {
  const all = (await loadFlashLines()).filter((l) => l.group !== group);
  await saveLines(all);
  return all;
}
