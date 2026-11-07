import raw from "./data/openings.json";
import type { ForcedOpening } from "./types";

export interface OpeningLine {
  eco: string;
  name: string;
  ucis: string[];
  key: string; // position: placement + turn + castling
}

const LINES: OpeningLine[] = (raw as [string, string, string, string][]).map(
  ([eco, name, uci, key]) => ({ eco, name, ucis: uci.split(" "), key })
);

export const positionKey = (fen: string) => fen.split(" ").slice(0, 3).join(" ");

// position -> opening (if several share a position, the first one wins)
const BY_KEY = new Map<string, OpeningLine>();
for (const l of LINES) if (!BY_KEY.has(l.key)) BY_KEY.set(l.key, l);

/** Opening for the position at index `upTo`, or the latest named one before it. */
export function openingAt(fens: string[], upTo: number): OpeningLine | null {
  for (let i = Math.min(upTo, fens.length - 1); i >= 0; i--) {
    const hit = BY_KEY.get(positionKey(fens[i]));
    if (hit) return hit;
  }
  return null;
}

// ---------- Choices for the picker ----------
export interface OpeningChoice {
  name: string;
  eco: string;
  ucis: string[];
}

const BY_NAME = new Map<string, OpeningChoice>();
for (const l of LINES) {
  const cur = BY_NAME.get(l.name);
  if (!cur || l.ucis.length < cur.ucis.length) {
    BY_NAME.set(l.name, { name: l.name, eco: l.eco, ucis: l.ucis });
  }
}
export const OPENING_CHOICES = [...BY_NAME.values()].sort((a, b) =>
  a.name.localeCompare(b.name)
);

const POPULAR_NAMES = [
  "Sicilian Defense",
  "Sicilian Defense: Open",
  "Sicilian Defense: Closed",
  "Sicilian Defense: Najdorf Variation",
  "Sicilian Defense: Dragon Variation",
  "Sicilian Defense: Alapin Variation",
  "French Defense",
  "Caro-Kann Defense",
  "Scandinavian Defense",
  "Pirc Defense",
  "Alekhine Defense",
  "Ruy Lopez",
  "Italian Game",
  "Four Knights Game: Spanish Variation",
  "Scotch Game",
  "Petrov's Defense",
  "Vienna Game",
  "King's Gambit",
  "Queen's Gambit",
  "Queen's Gambit Declined",
  "Slav Defense",
  "Nimzo-Indian Defense",
  "Grünfeld Defense",
  "King's Indian Defense",
  "Catalan Opening",
  "Réti Opening",
  "English Opening",
  "London System",
  "Queen's Pawn Game",
  "Dutch Defense",
];
export const POPULAR_OPENINGS = POPULAR_NAMES.map((n) => BY_NAME.get(n)).filter(
  (x): x is OpeningChoice => !!x
);

// "Reti" matches "Réti"
const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function searchOpenings(query: string, limit = 40): OpeningChoice[] {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return POPULAR_OPENINGS;
  const hits = OPENING_CHOICES.filter((o) => {
    const n = fold(o.name);
    return words.every((w) => n.includes(w));
  });
  hits.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

// ---------- Book (forced opening) ----------
const startsWith = (line: string[], prefix: string[]) => {
  if (line.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (line[i] !== prefix[i]) return false;
  return true;
};

const POOL_CACHE = new WeakMap<ForcedOpening, string[][]>();
function pool(forced: ForcedOpening): string[][] {
  let p = POOL_CACHE.get(forced);
  if (!p) {
    if (forced.lines && forced.lines.length > 0) {
      p = forced.lines; // a repertoire: any of its lines
    } else if (forced.mode === "exact") {
      p = [forced.ucis];
    } else {
      p = [forced.ucis];
      for (const l of LINES) if (startsWith(l.ucis, forced.ucis)) p.push(l.ucis);
    }
    POOL_CACHE.set(forced, p);
  }
  return p;
}

/** The bot's next book move (UCI), or null if the book has run out. */
export function bookMove(forced: ForcedOpening, played: string[]): string | null {
  const n = played.length;
  const counts = new Map<string, number>();
  for (const line of pool(forced)) {
    if (line.length > n && startsWith(line, played)) {
      counts.set(line[n], (counts.get(line[n]) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  // sqrt keeps popular moves likely without drowning out the rarer ones
  const options = [...counts].map(([m, c]) => [m, Math.sqrt(c)] as const);
  let r = Math.random() * options.reduce((s, [, w]) => s + w, 0);
  for (const [m, w] of options) {
    r -= w;
    if (r <= 0) return m;
  }
  return options[options.length - 1][0];
}
/** Every book move available here, most common first (for hints and warnings). */
export function bookMoves(
  forced: ForcedOpening,
  played: string[]
): { uci: string; count: number }[] {
  const n = played.length;
  const counts = new Map<string, number>();
  for (const line of pool(forced)) {
    if (line.length > n && startsWith(line, played)) {
      counts.set(line[n], (counts.get(line[n]) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([uci, count]) => ({ uci, count }))
    .sort((a, b) => b.count - a.count);
}
export type BookState = "in" | "done" | "left";

/** in = the book continues, done = the line finished, left = you left the line. */
export function bookStatus(forced: ForcedOpening, played: string[]): BookState {
  let matched = false;
  for (const line of pool(forced)) {
    if (startsWith(line, played)) {
      if (line.length > played.length) return "in";
      matched = true;
    }
  }
  return matched ? "done" : "left";
}
// ---------- Guide helpers ----------
const LINES_BY_NAME = new Map<string, OpeningLine[]>();
for (const l of LINES) {
  const arr = LINES_BY_NAME.get(l.name);
  if (arr) arr.push(l);
  else LINES_BY_NAME.set(l.name, [l]);
}

export const linesForName = (name: string): OpeningLine[] =>
  LINES_BY_NAME.get(name) ?? [];

export const getOpening = (name: string): OpeningChoice | undefined =>
  BY_NAME.get(name);

/** Names that are sub-variations of `name`. */
export function childNames(name: string): string[] {
  const a = `${name}: `;
  const b = `${name}, `;
  return OPENING_CHOICES.filter(
    (o) => o.name.startsWith(a) || o.name.startsWith(b)
  ).map((o) => o.name);
}

/** Every opening matching the search (all of them when the search is empty). */
export function allOpenings(query: string): OpeningChoice[] {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return OPENING_CHOICES;
  const hits = OPENING_CHOICES.filter((o) => {
    const n = fold(o.name);
    return words.every((w) => n.includes(w));
  });
  hits.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return hits;
}

/** Every named opening a line passes through, deepest (most specific) first. */
export function openingsAlong(fens: string[], upTo: number): OpeningLine[] {
  const seen = new Set<string>();
  const out: OpeningLine[] = [];
  for (let i = 0; i <= Math.min(upTo, fens.length - 1); i++) {
    const hit = BY_KEY.get(positionKey(fens[i]));
    if (hit && !seen.has(hit.name)) {
      seen.add(hit.name);
      out.push(hit);
    }
  }
  return out.reverse();
}
// ---------- Book check for game review ----------
let PREFIXES: Set<string> | null = null;
function prefixes(): Set<string> {
  if (!PREFIXES) {
    PREFIXES = new Set<string>();
    for (const l of LINES) {
      for (let k = 1; k <= l.ucis.length; k++) {
        PREFIXES.add(l.ucis.slice(0, k).join(" "));
      }
    }
  }
  return PREFIXES;
}

/** True if these moves are part of a known opening line, or reach a named opening position. */
export function isBookPosition(ucis: string[], fen: string): boolean {
  return prefixes().has(ucis.join(" ")) || BY_KEY.has(positionKey(fen));
}
/** The opening one level up: "A: B, C" -> "A: B" -> "A" (null for a top-level opening). */
export function parentOf(name: string): string | null {
  let n = name;
  for (;;) {
    const cut = Math.max(n.lastIndexOf(", "), n.lastIndexOf(": "));
    if (cut <= 0) return null;
    n = n.slice(0, cut);
    if (BY_NAME.has(n)) return n;
  }
}
// ---------- Main openings and their variations (for the guide) ----------
const ROOT_CACHE = new Map<string, string>();
/** The main opening a name belongs to: "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense". */
export function rootOf(name: string): string {
  const cached = ROOT_CACHE.get(name);
  if (cached) return cached;
  let cur = name;
  for (;;) {
    const p = parentOf(cur);
    if (!p) break;
    cur = p;
  }
  ROOT_CACHE.set(name, cur);
  return cur;
}

/** Only the main openings (nothing above them), A-Z. */
export const ROOTS: OpeningChoice[] = OPENING_CHOICES.filter((o) => parentOf(o.name) === null);

const BY_ROOT = new Map<string, OpeningChoice[]>();
for (const o of OPENING_CHOICES) {
  const r = rootOf(o.name);
  if (r === o.name) continue;
  const arr = BY_ROOT.get(r);
  if (arr) arr.push(o);
  else BY_ROOT.set(r, [o]);
}

/** Every variation and sub-variation under a main opening, A-Z. */
export const variationsOf = (root: string): OpeningChoice[] => BY_ROOT.get(root) ?? [];

/** Search inside a given list (empty search = the whole list, in its own order). */
export function searchWithin(items: OpeningChoice[], query: string): OpeningChoice[] {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  const hits = items.filter((o) => {
    const n = fold(o.name);
    return words.every((w) => n.includes(w));
  });
  hits.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return hits;
}
