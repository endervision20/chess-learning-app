import type { MoveClass } from "./types";

export const CLASS_META: Record<MoveClass, { label: string; symbol: string; cls: string }> = {
  brilliant: { label: "Brilliant", symbol: "!!", cls: "c-brilliant" },
  great: { label: "Great", symbol: "!", cls: "c-great" },
  best: { label: "Best", symbol: "★", cls: "c-best" },
  excellent: { label: "Excellent", symbol: "✓", cls: "c-excellent" },
  good: { label: "Good", symbol: "●", cls: "c-good" },
  book: { label: "Book", symbol: "📖", cls: "c-book" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", cls: "c-inaccuracy" },
  miss: { label: "Miss", symbol: "✗", cls: "c-miss" },
  mistake: { label: "Mistake", symbol: "?", cls: "c-mistake" },
  blunder: { label: "Blunder", symbol: "??", cls: "c-blunder" },
};

export const CLASS_ORDER: MoveClass[] = [
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