import {
  BaseDirectory,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  MAX_ELO,
  NO_ASSISTS,
  NO_HELP,
  type AssistCounts,
  type Color,
  type GameResult,
  type HelpCounts,
  type PracticeKind,
  type SavedGame,
} from "../types";

// Real games live in "games"; practice games live in "practice" (their file
// names start with "p-"), so the two never mix in the lists.
const DIR = "games";
const PRACTICE_DIR = "practice";
const opts = { baseDir: BaseDirectory.AppData };

export const isPracticeFile = (fileName: string) => fileName.startsWith("p-");
const dirOf = (fileName: string) => (isPracticeFile(fileName) ? PRACTICE_DIR : DIR);

const pad = (n: number) => String(n).padStart(2, "0");

// Assisted: tb = takebacks, hb = hint button
const ASSIST_CODES: [string, keyof AssistCounts][] = [
  ["tb", "takebacks"],
  ["hb", "hintButton"],
];
// Helped: wn = warnings, bk = book notices, ft = free takebacks
const HELP_CODES: [string, keyof HelpCounts][] = [
  ["wn", "warnings"],
  ["bk", "bookHints"],
  ["ft", "freeTakebacks"],
];

const codesOf = <K extends string>(table: [string, K][], counts: Record<K, number>) =>
  table
    .filter(([, key]) => counts[key] > 0)
    .map(([code, key]) => `-${code}${counts[key]}`)
    .join("");

// e.g. 20261031-153012_win_white_1500_tc180p2_helped-wn2_assisted-tb1-hb3.json
// practice: p-20261031-153012_win_white_1500_endgame_helped-wn2_assisted-tb1.json
export function makeFileName(g: SavedGame): string {
  const d = new Date(g.date);
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const elo = g.botElo >= MAX_ELO ? "max" : String(g.botElo);
  const helped = g.helped ? `_helped${codesOf(HELP_CODES, g.help ?? NO_HELP)}` : "";
  const assisted = g.assisted ? `_assisted${codesOf(ASSIST_CODES, g.assists ?? NO_ASSISTS)}` : "";
  if (g.practice) {
    return `p-${stamp}_${g.result}_${g.playerColor}_${elo}_${g.practice.kind}${helped}${assisted}.json`;
  }
  const tc = `_tc${g.timeControl.baseSec}p${g.timeControl.incSec}`;
  return `${stamp}_${g.result}_${g.playerColor}_${elo}${tc}${helped}${assisted}.json`;
}

export interface GameListItem {
  fileName: string;
  date: Date;
  result: GameResult;
  color: Color;
  elo: number | null; // null = full strength
  tc: { baseSec: number; incSec: number } | null; // null = older game, or practice
  practice?: PracticeKind; // set for practice games
  helped: boolean;
  help: HelpCounts;
  assisted: boolean;
  assists: AssistCounts;
}

const NAME_RE =
  /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_(win|loss|draw)_(white|black)_(\d+|max)(?:_tc(\d+)p(\d+))?(_helped((?:-[a-z]{2}\d+)*))?(_assisted((?:-[a-z]{2}\d+)*))?\.json$/;

const PRACTICE_RE =
  /^p-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_(win|loss|draw)_(white|black)_(\d+|max)_([a-z]+)(_helped((?:-[a-z]{2}\d+)*))?(_assisted((?:-[a-z]{2}\d+)*))?\.json$/;

function readCodes<K extends string>(table: [string, K][], text: string, into: Record<K, number>) {
  for (const part of text.split("-").filter(Boolean)) {
    const found = table.find(([code]) => part.startsWith(code));
    if (found) into[found[1]] = parseInt(part.slice(2), 10);
  }
}

export function parseFileName(name: string): GameListItem | null {
  const practice = isPracticeFile(name);
  const m = (practice ? PRACTICE_RE : NAME_RE).exec(name);
  if (!m) return null;
  // the practice pattern has one extra group (the kind) before the help/assist groups
  const help: HelpCounts = { ...NO_HELP };
  const assists: AssistCounts = { ...NO_ASSISTS };
  const helpIdx = practice ? 12 : 13;
  const assistIdx = practice ? 14 : 15;
  readCodes(HELP_CODES, m[helpIdx] ?? "", help);
  readCodes(ASSIST_CODES, m[assistIdx] ?? "", assists);
  return {
    fileName: name,
    date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]),
    result: m[7] as GameResult,
    color: m[8] as Color,
    elo: m[9] === "max" ? null : parseInt(m[9], 10),
    tc:
      !practice && m[10] !== undefined
        ? { baseSec: parseInt(m[10], 10), incSec: parseInt(m[11], 10) }
        : null,
    practice: practice ? (m[10] as PracticeKind) : undefined,
    helped: practice ? !!m[11] : !!m[12],
    help,
    assisted: practice ? !!m[13] : !!m[14],
    assists,
  };
}

async function listDir(dir: string): Promise<GameListItem[]> {
  await mkdir(dir, { ...opts, recursive: true });
  const entries = await readDir(dir, opts);
  return entries
    .filter((e) => e.isFile)
    .map((e) => parseFileName(e.name))
    .filter((x): x is GameListItem => x !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // newest first
}

export async function saveGame(game: SavedGame): Promise<string> {
  const fileName = makeFileName(game);
  const dir = dirOf(fileName);
  await mkdir(dir, { ...opts, recursive: true });
  await writeTextFile(`${dir}/${fileName}`, JSON.stringify(game), opts);
  return fileName;
}

export const listGames = () => listDir(DIR);
export const listPractice = () => listDir(PRACTICE_DIR);

export async function loadGame(fileName: string): Promise<SavedGame> {
  return JSON.parse(await readTextFile(`${dirOf(fileName)}/${fileName}`, opts));
}

export async function deleteGame(fileName: string): Promise<void> {
  await remove(`${dirOf(fileName)}/${fileName}`, opts);
  try {
    await remove(`reviews/${fileName}`, opts); // its saved review, if there is one
  } catch {
    /* no review saved */
  }
}

/** Saves the notes written in Analysis into the game's own file (the file name stays the same). */
export async function saveGameNotes(
  fileName: string,
  notes: Record<string, string>
): Promise<void> {
  const game = await loadGame(fileName);
  const next: SavedGame = { ...game };
  if (Object.keys(notes).length > 0) next.notes = notes;
  else delete next.notes;
  await writeTextFile(`${dirOf(fileName)}/${fileName}`, JSON.stringify(next), opts);
}
