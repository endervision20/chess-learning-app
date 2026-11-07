import type { MoveMark } from "./components/MoveList";
import type { PlayedMove } from "./types";

/**
 * Small icons shown after a move in the move history for help that was used on it:
 * the Hint button (amber, counts as assisted) and the Helped-mode helper
 * (green, does not count as assisted).
 */
export function assistMarks(m: PlayedMove): MoveMark[] {
  const out: MoveMark[] = [];
  if (m.hints) {
    out.push({
      text: "💡".repeat(m.hints),
      cls: "hintmark",
      title:
        m.hints === 1
          ? "Hint button used: the piece was highlighted"
          : "Hint button used twice: the move was shown",
    });
  }
  if (m.warned) {
    out.push({ text: "⚠", cls: "helpmark", title: "Helper warned about this move (not an assist)" });
  }
  if (m.bookNotice) {
    out.push({ text: "📖", cls: "helpmark", title: "Helper: this move left the opening book (not an assist)" });
  }
  return out;
}

/** Folds several marks into the single MoveMark a move cell takes. */
export function joinMarks(list: MoveMark[]): MoveMark | undefined {
  if (list.length === 0) return undefined;
  const [first, ...rest] = list;
  return rest.length ? { ...first, more: rest } : first;
}
