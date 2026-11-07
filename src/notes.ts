import type { MoveMark } from "./components/MoveList";

/**
 * Notes on moves. A note belongs to the position reached by a sequence of moves,
 * so its key is that sequence as UCI ("e2e4 c7c5"). "" is the starting position.
 */
export type NoteMap = Record<string, string>;

export const pathKey = (ucis: string[]): string => ucis.join(" ");

/** Drops empty notes. */
export function cleanNotes(notes: NoteMap): NoteMap {
  const out: NoteMap = {};
  for (const [k, v] of Object.entries(notes)) if (v.trim()) out[k] = v;
  return out;
}

/** A guide line stores notes by move number (1 = after the first move); intro = the starting position. */
export function notesFromPly(
  ucis: string[],
  byPly: Record<number, string> | undefined,
  intro?: string
): NoteMap {
  const out: NoteMap = {};
  if (intro) out[""] = intro;
  if (byPly) {
    for (const [p, text] of Object.entries(byPly)) {
      const ply = Number(p);
      if (text && ply >= 1 && ply <= ucis.length) out[pathKey(ucis.slice(0, ply))] = text;
    }
  }
  return out;
}

/** The notes that lie along a line, by move number. */
export function notesToPly(
  ucis: string[],
  notes: NoteMap | undefined
): { intro: string; byPly: Record<number, string> } {
  const byPly: Record<number, string> = {};
  if (notes) {
    for (let p = 1; p <= ucis.length; p++) {
      const t = notes[pathKey(ucis.slice(0, p))];
      if (t && t.trim()) byPly[p] = t.trim();
    }
  }
  return { intro: (notes?.[""] ?? "").trim(), byPly };
}

/** A 📝 beside move `i` (0-based) if it has a note. */
export function noteMark(
  notes: NoteMap | undefined,
  ucis: string[],
  i: number
): MoveMark | undefined {
  const text = notes?.[pathKey(ucis.slice(0, i + 1))];
  return text && text.trim() ? { text: "📝", cls: "notemark", title: text } : undefined;
}
