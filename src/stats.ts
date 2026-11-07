import { replay } from "./chessLogic";
import { openingAt, rootOf } from "./openings";
import type { GameListItem } from "./storage/games";
import type { Color, GameResult, GameReview, MoveClass, SavedGame } from "./types";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export type Period = "g10" | "g25" | "g50" | "g100" | "d7" | "d30" | "d90" | "all";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "g10", label: "Last 10 games" },
  { id: "g25", label: "Last 25 games" },
  { id: "g50", label: "Last 50 games" },
  { id: "g100", label: "Last 100 games" },
  { id: "d7", label: "Last 7 days" },
  { id: "d30", label: "Last 30 days" },
  { id: "d90", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

export type TcCat = "untimed" | "bullet" | "blitz" | "rapid" | "classical" | "unknown";
export const TC_LABEL: Record<TcCat, string> = {
  untimed: "Untimed",
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  unknown: "Older (not recorded)",
};

export type OppBand = "any" | "low" | "mid" | "high" | "max";
export const OPP_LABEL: Record<OppBand, string> = {
  any: "Any strength",
  low: "Under 1500",
  mid: "1500 - 1999",
  high: "2000 and up",
  max: "Full strength",
};

export type AssistFilter = "all" | "clean" | "helped";

export interface Filters {
  period: Period;
  tc: TcCat | "all";
  color: Color | "any";
  opp: OppBand;
  assist: AssistFilter; // for the win / loss numbers (the polygon always shows both layers)
  practice: boolean; // include practice games
}

export const DEFAULT_FILTERS: Filters = {
  period: "g50",
  tc: "all",
  color: "any",
  opp: "any",
  assist: "all",
  practice: false,
};

/** Bullet < 3 min, blitz < 8, rapid < 25, else classical (base + 40 x increment, as Lichess does). */
export function tcCategory(g: GameListItem): TcCat {
  if (g.practice) return "untimed";
  if (!g.tc) return "unknown";
  if (g.tc.baseSec === 0) return "untimed";
  const est = g.tc.baseSec + 40 * g.tc.incSec;
  if (est < 180) return "bullet";
  if (est < 480) return "blitz";
  if (est < 1500) return "rapid";
  return "classical";
}

const isClean = (g: { assisted: boolean; helped: boolean }) => !g.assisted && !g.helped;

function oppMatches(elo: number | null, band: OppBand): boolean {
  switch (band) {
    case "any": return true;
    case "low": return elo !== null && elo < 1500;
    case "mid": return elo !== null && elo >= 1500 && elo < 2000;
    case "high": return elo !== null && elo >= 2000;
    case "max": return elo === null;
  }
}

/** Every filter except the period; `assist` is skipped when `ignoreAssist` is set. */
export function baseFilter(all: GameListItem[], f: Filters, ignoreAssist: boolean): GameListItem[] {
  return all.filter((g) => {
    if (g.practice && !f.practice) return false;
    if (f.tc !== "all" && tcCategory(g) !== f.tc) return false;
    if (f.color !== "any" && g.color !== f.color) return false;
    if (!oppMatches(g.elo, f.opp)) return false;
    if (!ignoreAssist) {
      if (f.assist === "clean" && !isClean(g)) return false;
      if (f.assist === "helped" && isClean(g)) return false;
    }
    return true;
  });
}

const DAY = 86400000;

/** The newest games inside the period, and the same-sized period just before it (for comparing). */
export function windowed(
  list: GameListItem[],
  period: Period,
  now: number
): { current: GameListItem[]; previous: GameListItem[] } {
  const sorted = [...list].sort((a, b) => b.date.getTime() - a.date.getTime()); // newest first
  if (period === "all") return { current: sorted, previous: [] };
  if (period[0] === "g") {
    const n = parseInt(period.slice(1), 10);
    return { current: sorted.slice(0, n), previous: sorted.slice(n, 2 * n) };
  }
  const days = parseInt(period.slice(1), 10);
  const start = now - days * DAY;
  const prevStart = now - 2 * days * DAY;
  return {
    current: sorted.filter((g) => g.date.getTime() >= start),
    previous: sorted.filter((g) => g.date.getTime() >= prevStart && g.date.getTime() < start),
  };
}

// ---------------------------------------------------------------------------
// Win / loss summary (needs only the file names)
// ---------------------------------------------------------------------------
export interface Tally {
  g: number;
  w: number;
  d: number;
  l: number;
}
const emptyTally = (): Tally => ({ g: 0, w: 0, d: 0, l: 0 });
function add(t: Tally, r: GameResult) {
  t.g++;
  if (r === "win") t.w++;
  else if (r === "draw") t.d++;
  else t.l++;
}
export const winRate = (t: Tally) => (t.g ? (100 * t.w) / t.g : 0);

export interface Summary {
  total: Tally;
  white: Tally;
  black: Tally;
  byTc: Partial<Record<TcCat, Tally>>;
  assistedShare: number; // 0-100: games that used help or assists
  streak: { kind: GameResult | null; len: number };
  bestWinStreak: number;
  rolling: number[]; // win rate over the last 10 games, game by game (oldest first)
}

export function summarize(items: GameListItem[]): Summary {
  const chrono = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
  const s: Summary = {
    total: emptyTally(),
    white: emptyTally(),
    black: emptyTally(),
    byTc: {},
    assistedShare: 0,
    streak: { kind: null, len: 0 },
    bestWinStreak: 0,
    rolling: [],
  };
  let helped = 0;
  let run = 0;
  chrono.forEach((g, i) => {
    add(s.total, g.result);
    add(g.color === "white" ? s.white : s.black, g.result);
    const cat = tcCategory(g);
    add((s.byTc[cat] ??= emptyTally()), g.result);
    if (!isClean(g)) helped++;
    run = g.result === "win" ? run + 1 : 0;
    s.bestWinStreak = Math.max(s.bestWinStreak, run);
    const from = Math.max(0, i - 9);
    const win = chrono.slice(from, i + 1).filter((x) => x.result === "win").length;
    s.rolling.push((100 * win) / (i + 1 - from));
  });
  s.assistedShare = chrono.length ? (100 * helped) / chrono.length : 0;
  // current streak = how many of the latest games ended the same way
  const last = chrono[chrono.length - 1];
  if (last) {
    let len = 0;
    for (let i = chrono.length - 1; i >= 0 && chrono[i].result === last.result; i--) len++;
    s.streak = { kind: last.result, len };
  }
  return s;
}

// ---------------------------------------------------------------------------
// Facts about one game (needs the game and, for most things, its review)
// ---------------------------------------------------------------------------
export interface GameFacts {
  fileName: string;
  date: number;
  result: GameResult;
  color: Color;
  tcCat: TcCat;
  clean: boolean; // no assists and no help
  practice: boolean;
  moves: number; // moves the player made
  reviewed: boolean;
  opening: string | null; // the main opening it belongs to
  phase: { open: [number, number]; mid: [number, number]; end: [number, number] }; // [accuracy sum, moves]
  accSum: number;
  accCnt: number;
  classes: Partial<Record<MoveClass, number>>; // the player's moves by grade
  advantage: boolean; // clearly winning at some point
  disadvantage: boolean; // clearly worse at some point
  timeScore: number | null; // 0-100, timed games only
}

const moveAccuracy = (loss: number) =>
  Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

const PIECE_VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3 };
function nonPawnMaterial(fen: string): number {
  let s = 0;
  for (const ch of fen.split(" ")[0]) s += PIECE_VALUE[ch.toLowerCase()] ?? 0;
  return s;
}

const ENDGAME_MATERIAL = 26; // both sides' queens, rooks and minor pieces together
const OPENING_MOVES = 12;

function sustained(values: number[], ok: (v: number) => boolean, from: number, run = 3): boolean {
  let streak = 0;
  for (let k = from; k < values.length; k++) {
    streak = ok(values[k]) ? streak + 1 : 0;
    if (streak >= run) return true;
  }
  return false;
}

export function factsOf(
  item: GameListItem,
  game: SavedGame,
  review: GameReview | null
): GameFacts {
  const color = game.playerColor;
  const { plies } = replay(game.moves, game.startFen);
  const facts: GameFacts = {
    fileName: item.fileName,
    date: item.date.getTime(),
    result: game.result,
    color,
    tcCat: tcCategory(item),
    clean: isClean({ assisted: game.assisted, helped: !!game.helped }),
    practice: !!game.practice,
    moves: 0,
    reviewed: !!review,
    opening: null,
    phase: { open: [0, 0], mid: [0, 0], end: [0, 0] },
    accSum: 0,
    accCnt: 0,
    classes: {},
    advantage: false,
    disadvantage: false,
    timeScore: null,
  };

  // opening (the main one, e.g. "Sicilian Defense")
  if (!game.startFen) {
    try {
      const op = openingAt(
        plies.map((p) => p.fen),
        plies.length - 1
      );
      facts.opening = op ? rootOf(op.name) : null;
    } catch {
      facts.opening = null;
    }
  }

  // per-move quality, by phase of the game
  game.moves.forEach((_, i) => {
    if (plies[i].turn !== color) return;
    facts.moves++;
    const r = review?.moves[i];
    if (!r) return;
    const acc = moveAccuracy(r.loss);
    facts.accSum += acc;
    facts.accCnt++;
    facts.classes[r.cls] = (facts.classes[r.cls] ?? 0) + 1;
    const moveNo = Math.floor(i / 2) + 1;
    const lowMaterial = nonPawnMaterial(plies[i].fen) <= ENDGAME_MATERIAL;
    const bucket =
      !game.startFen && moveNo <= OPENING_MOVES
        ? facts.phase.open
        : lowMaterial
        ? facts.phase.end
        : facts.phase.mid;
    bucket[0] += acc;
    bucket[1]++;
  });

  // winning / worse positions, from the review's evaluations
  if (review) {
    const mine = review.evals.map((e) => (color === "white" ? e.pct : 100 - e.pct));
    facts.advantage = sustained(mine, (v) => v >= 75, 10);
    facts.disadvantage = sustained(mine, (v) => v <= 25, 10);
  }

  // time management: did you run out, and how close to it did you get?
  const tc = game.timeControl;
  if (tc.baseSec > 0 && !game.practice) {
    const flagged = game.reason === "timeout" && game.winner !== null && game.winner !== color;
    let minFrac = Infinity;
    game.moves.forEach((m, i) => {
      if (plies[i].turn === color && m.clockAfterMs != null) {
        minFrac = Math.min(minFrac, m.clockAfterMs / (tc.baseSec * 1000));
      }
    });
    if (flagged) facts.timeScore = 0;
    else if (minFrac !== Infinity) facts.timeScore = Math.min(1, minFrac / 0.15) * 100;
  }
  return facts;
}

// ---------------------------------------------------------------------------
// The polygon
// ---------------------------------------------------------------------------
export type AxisId =
  | "opening"
  | "middlegame"
  | "endgame"
  | "tactics"
  | "conversion"
  | "defence"
  | "time"
  | "accuracy";

export const AXES: { id: AxisId; label: string; help: string }[] = [
  { id: "opening", label: "Opening", help: "Accuracy in your first 12 moves (book moves count as perfect)." },
  { id: "middlegame", label: "Middlegame", help: "Accuracy once the opening is over and plenty of pieces remain." },
  { id: "endgame", label: "Endgame", help: "Accuracy once most of the pieces are off." },
  { id: "tactics", label: "Tactics", help: "Brilliant and great moves found, against misses and blunders." },
  { id: "conversion", label: "Conversion", help: "How often a clearly winning position turned into a win." },
  { id: "defence", label: "Defence", help: "How often a clearly worse position was saved (a draw counts partly)." },
  { id: "time", label: "Time", help: "Timed games only: not flagging, and not getting close to it." },
  { id: "accuracy", label: "Accuracy", help: "Your overall move accuracy." },
];

export interface AxisScore {
  id: AxisId;
  score: number | null; // 0 (centre, weak) - 100 (edge, strong); null = not enough games yet
  n: number; // how many moves / games it is based on
}

export interface Aggregate {
  games: number; // games in the layer
  reviewed: number; // of those, reviewed (needed for most axes)
  axes: AxisScore[];
}

export function aggregate(facts: GameFacts[]): Aggregate {
  const rev = facts.filter((f) => f.reviewed);
  const mean = (sum: number, cnt: number, min: number) => (cnt >= min ? sum / cnt : null);

  const phaseSum = (k: "open" | "mid" | "end"): [number, number] =>
    rev.reduce<[number, number]>(
      (a, f) => [a[0] + f.phase[k][0], a[1] + f.phase[k][1]],
      [0, 0]
    );
  const o = phaseSum("open");
  const m = phaseSum("mid");
  const e = phaseSum("end");
  const accSum = rev.reduce((s, f) => s + f.accSum, 0);
  const accCnt = rev.reduce((s, f) => s + f.accCnt, 0);

  let found = 0;
  let missed = 0;
  for (const f of rev) {
    found += (f.classes.brilliant ?? 0) + (f.classes.great ?? 0);
    missed += (f.classes.miss ?? 0) + (f.classes.blunder ?? 0);
  }

  const adv = rev.filter((f) => f.advantage);
  const advPts = adv.reduce((s, f) => s + (f.result === "win" ? 1 : f.result === "draw" ? 0.5 : 0), 0);
  const dis = rev.filter((f) => f.disadvantage);
  const disPts = dis.reduce((s, f) => s + (f.result === "win" ? 1 : f.result === "draw" ? 0.7 : 0), 0);

  const timed = facts.filter((f) => f.timeScore !== null);
  const timeSum = timed.reduce((s, f) => s + (f.timeScore ?? 0), 0);

  const axes: AxisScore[] = [
    { id: "opening", score: mean(o[0], o[1], 5), n: o[1] },
    { id: "middlegame", score: mean(m[0], m[1], 5), n: m[1] },
    { id: "endgame", score: mean(e[0], e[1], 5), n: e[1] },
    {
      id: "tactics",
      score: found + missed >= 3 ? ((found + 2) / (found + missed + 4)) * 100 : null,
      n: found + missed,
    },
    {
      id: "conversion",
      score: adv.length >= 2 ? ((advPts + 1) / (adv.length + 2)) * 100 : null,
      n: adv.length,
    },
    {
      id: "defence",
      score: dis.length >= 2 ? ((disPts + 1) / (dis.length + 2)) * 100 : null,
      n: dis.length,
    },
    { id: "time", score: timed.length >= 2 ? timeSum / timed.length : null, n: timed.length },
    { id: "accuracy", score: mean(accSum, accCnt, 5), n: accCnt },
  ];
  return { games: facts.length, reviewed: rev.length, axes };
}

// ---------------------------------------------------------------------------
// Other breakdowns
// ---------------------------------------------------------------------------
export const GRADE_ORDER: MoveClass[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "miss",
  "mistake",
  "blunder",
];

/** Share (%) of the player's moves at each grade. */
export function gradeShares(facts: GameFacts[]): { total: number; share: Record<MoveClass, number> } {
  const count = {} as Record<MoveClass, number>;
  for (const c of GRADE_ORDER) count[c] = 0;
  let total = 0;
  for (const f of facts) {
    if (!f.reviewed) continue;
    for (const c of GRADE_ORDER) {
      const n = f.classes[c] ?? 0;
      count[c] += n;
      total += n;
    }
  }
  const share = {} as Record<MoveClass, number>;
  for (const c of GRADE_ORDER) share[c] = total ? (100 * count[c]) / total : 0;
  return { total, share };
}

export interface OpeningRow {
  name: string;
  tally: Tally;
  accuracy: number | null;
}

export function openingTable(facts: GameFacts[], limit = 10): OpeningRow[] {
  const map = new Map<string, { t: Tally; sum: number; cnt: number }>();
  for (const f of facts) {
    if (!f.opening) continue;
    const row = map.get(f.opening) ?? { t: emptyTally(), sum: 0, cnt: 0 };
    add(row.t, f.result);
    if (f.reviewed && f.accCnt > 0) {
      row.sum += f.accSum / f.accCnt;
      row.cnt++;
    }
    map.set(f.opening, row);
  }
  return [...map.entries()]
    .map(([name, r]) => ({ name, tally: r.t, accuracy: r.cnt ? r.sum / r.cnt : null }))
    .sort((a, b) => b.tally.g - a.tally.g || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Accuracy of each reviewed game, oldest first, split by layer (null = not in that layer). */
export function accuracySeries(facts: GameFacts[]): { clean: (number | null)[]; helped: (number | null)[] } {
  const chrono = facts.filter((f) => f.reviewed && f.accCnt > 0).sort((a, b) => a.date - b.date);
  return {
    clean: chrono.map((f) => (f.clean ? f.accSum / f.accCnt : null)),
    helped: chrono.map((f) => (f.clean ? null : f.accSum / f.accCnt)),
  };
}
