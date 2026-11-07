import type { CardMemory, Color, FlashLine } from "./types";

/** Days until a card is due again, by box. Box 0 = forgotten: due straight away. */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
const DAY = 86400000;

export interface Card {
  key: string; // the position (and side): memory is shared by every line that reaches it
  lineId: string;
  lineName: string;
  side: Color;
  ucis: string[];
  startPly: number; // the position shown is after this many plies
  count: number; // how many of your moves to play
  accept?: string[]; // repertoire: several moves are right at the first position
}

export const cardKey = (side: Color, ucis: string[], ply: number) =>
  `${side}|${ucis.slice(0, ply).join(" ")}`;

/**
 * Two lines conflict if you play the same side and, at the same position, they
 * ask for different moves from you. Differences in the opponent's moves are fine.
 */
export function conflicts(a: FlashLine, b: FlashLine): boolean {
  if (a.side !== b.side) return false;
  if (a.group && a.group === b.group) return false; // alternatives inside one repertoire are fine
  const n = Math.min(a.ucis.length, b.ucis.length);
  for (let i = 0; i < n; i++) {
    if (a.ucis[i] !== b.ucis[i]) {
      const mover: Color = i % 2 === 0 ? "white" : "black";
      return mover === a.side;
    }
  }
  return false;
}

export function conflictWith(line: FlashLine, others: FlashLine[]): FlashLine | undefined {
  return others.find((o) => o.id !== line.id && conflicts(o, line));
}

/** One card per position where it is your turn in the line. */
export function buildCards(lines: FlashLine[], count: number): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  // all the moves that are right at each position (more than one only inside a repertoire)
  const alts = new Map<string, Set<string>>();
  for (const line of lines) {
    for (let p = 0; p < line.ucis.length; p++) {
      if ((p % 2 === 0) !== (line.side === "white")) continue;
      const k = cardKey(line.side, line.ucis, p);
      const s = alts.get(k);
      if (s) s.add(line.ucis[p]);
      else alts.set(k, new Set([line.ucis[p]]));
    }
  }
  for (const line of lines) {
    for (let p = 0; p < line.ucis.length; p++) {
      if ((p % 2 === 0) !== (line.side === "white")) continue;
      const key = cardKey(line.side, line.ucis, p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        lineId: line.id,
        lineName: line.name,
        side: line.side,
        ucis: line.ucis,
        startPly: p,
        count,
        accept: (alts.get(key)?.size ?? 0) > 1 ? [...alts.get(key)!] : undefined,
      });
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface QueueInfo {
  queue: Card[];
  due: number;
  fresh: number;
}

/** Forgotten and due cards first (the most forgotten first), then new ones. */
export function buildQueue(
  cards: Card[],
  memory: Record<string, CardMemory>,
  newLimit: number,
  now = Date.now()
): QueueInfo {
  const due = shuffle(cards.filter((c) => {
    const m = memory[c.key];
    return m && Date.parse(m.due) <= now;
  })).sort((a, b) => memory[a.key].box - memory[b.key].box);
  const fresh = cards.filter((c) => !memory[c.key]).slice(0, newLimit);
  return { queue: [...due, ...fresh], due: due.length, fresh: fresh.length };
}

export function allCardsShuffled(cards: Card[]): Card[] {
  return shuffle(cards);
}

export function lineStats(line: FlashLine, memory: Record<string, CardMemory>, now = Date.now()) {
  return linesStats([line], memory, now);
}

export function linesStats(lines: FlashLine[], memory: Record<string, CardMemory>, now = Date.now()) {
  const cards = buildCards(lines, 1);
  let due = 0;
  let fresh = 0;
  let weak = 0;
  for (const c of cards) {
    const m = memory[c.key];
    if (!m) fresh++;
    else {
      if (Date.parse(m.due) <= now) due++;
      if (m.lapses > 0 && m.box <= 1) weak++;
    }
  }
  return { cards: cards.length, due, fresh, weak };
}

/**
 * The new memory for a card after an answer. A wrong answer sends it back to
 * box 0 (due now). `isRetry` = it was already forgotten earlier this session.
 * `cram` = practising cards that weren't due: correct answers don't change anything.
 */
export function afterAnswer(
  mem: CardMemory | undefined,
  correct: boolean,
  now: Date,
  cram: boolean,
  isRetry: boolean
): CardMemory | undefined {
  const t = now.toISOString();
  if (correct) {
    if (cram && !isRetry) return mem;
    const box = Math.min(INTERVAL_DAYS.length - 1, (mem?.box ?? 0) + 1);
    return {
      box,
      due: new Date(now.getTime() + INTERVAL_DAYS[box] * DAY).toISOString(),
      lapses: mem?.lapses ?? 0,
      seen: (mem?.seen ?? 0) + 1,
      last: t,
    };
  }
  return {
    box: 0,
    due: t,
    lapses: (mem?.lapses ?? 0) + (isRetry ? 0 : 1),
    seen: (mem?.seen ?? 0) + 1,
    last: t,
  };
}
