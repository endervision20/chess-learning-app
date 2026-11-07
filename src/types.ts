import type { Key } from "chessground/types";

export type Color = "white" | "black";
export type PromotionRole = "queen" | "rook" | "bishop" | "knight";

export interface ForcedOpening {
  name: string;
  eco: string;
  ucis: string[]; // the line as UCI moves, e.g. ["e2e4", "c7c5"]
  mode: "variations" | "exact";
  lines?: string[][]; // repertoire: every line the bot may play (replaces ucis)
}

export const MIN_ELO = 1320;
export const MAX_ELO = 3190; // at this value the strength limiter is turned off

export interface TimeControl {
  label: string;
  baseSec: number; // 0 = unlimited
  incSec: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { label: "Unlimited", baseSec: 0, incSec: 0 },
  { label: "1 + 0  (Bullet)", baseSec: 60, incSec: 0 },
  { label: "3 + 0  (Blitz)", baseSec: 180, incSec: 0 },
  { label: "3 + 2  (Blitz)", baseSec: 180, incSec: 2 },
  { label: "5 + 0  (Blitz)", baseSec: 300, incSec: 0 },
  { label: "10 + 0  (Rapid)", baseSec: 600, incSec: 0 },
  { label: "15 + 10  (Rapid)", baseSec: 900, incSec: 10 },
  { label: "30 + 0  (Classical)", baseSec: 1800, incSec: 0 },
];

export interface GameConfig {
  colorChoice: Color | "random";
  elo: number;
  timeControl: TimeControl;
  showEval: boolean;
  helped: boolean; // warns about bad moves / leaving the book, with free takebacks
  opening: ForcedOpening | null;
  startFen?: string; // practice: start from this position instead of the standard one
  practice?: PracticeInfo;
}

export const DEFAULT_CONFIG: GameConfig = {
  colorChoice: "white",
  elo: 1500,
  timeControl: TIME_CONTROLS[0],
  showEval: true,
  helped: false,
  opening: null,
};

export interface PlayedMove {
  from: Key;
  to: Key;
  promotion?: PromotionRole;
  spentMs?: number; // time taken to play this move (games only)
  clockAfterMs?: number | null; // mover's clock after the move (timed games)
  hints?: number; // times the Hint button was used on the turn this move was played
  warned?: boolean;     // the Helped-mode helper warned about this move
  bookNotice?: boolean; // the helper said this move left the opening book
}

export type GameResult = "win" | "loss" | "draw";

// ---------- Assisted: the Takeback and Hint buttons ----------
export interface AssistCounts {
  takebacks: number;
  hintButton: number; // presses of the Hint button (piece = 1, move = 2)
}

export const NO_ASSISTS: AssistCounts = { takebacks: 0, hintButton: 0 };

export const totalAssists = (a?: AssistCounts): number =>
  a ? a.takebacks + a.hintButton : 0;

/** "takeback ×1, hint ×3" (empty string if nothing was used) */
export function describeAssists(a?: Partial<AssistCounts>): string {
  if (!a) return "";
  const parts: string[] = [];
  if (a.takebacks) parts.push(`takeback ×${a.takebacks}`);
  if (a.hintButton) parts.push(`hint ×${a.hintButton}`);
  return parts.join(", ");
}

/** "↩ 1  💡 3" */
export function assistIcons(a?: Partial<AssistCounts>): string {
  if (!a) return "";
  const parts: string[] = [];
  if (a.takebacks) parts.push(`↩ ${a.takebacks}`);
  if (a.hintButton) parts.push(`💡 ${a.hintButton}`);
  return parts.join("  ");
}

// ---------- Helped: the warnings and book guidance (free takebacks) ----------
export interface HelpCounts {
  warnings: number; // bad-move warnings shown
  bookHints: number; // "you left the book" notices shown
  freeTakebacks: number; // takebacks taken from a warning
}

export const NO_HELP: HelpCounts = { warnings: 0, bookHints: 0, freeTakebacks: 0 };

export const totalHelp = (h?: HelpCounts): number =>
  h ? h.warnings + h.bookHints + h.freeTakebacks : 0;

export function describeHelp(h?: Partial<HelpCounts>): string {
  if (!h) return "";
  const parts: string[] = [];
  if (h.warnings) parts.push(`warning ×${h.warnings}`);
  if (h.bookHints) parts.push(`book notice ×${h.bookHints}`);
  if (h.freeTakebacks) parts.push(`free takeback ×${h.freeTakebacks}`);
  return parts.join(", ");
}

/** "⚠ 2  📖 1  ↶ 1" */
export function helpIcons(h?: Partial<HelpCounts>): string {
  if (!h) return "";
  const parts: string[] = [];
  if (h.warnings) parts.push(`⚠ ${h.warnings}`);
  if (h.bookHints) parts.push(`📖 ${h.bookHints}`);
  if (h.freeTakebacks) parts.push(`↶ ${h.freeTakebacks}`);
  return parts.join("  ");
}

/** One takeback: the moves that were kept, and the moves that were taken back (UCI). */
export interface TakebackRecord {
  prefix: string[];
  removed: string[];
  free?: boolean; // taken from a warning in Helped mode (not an assist)
}

export interface SavedGame {
  version: 1;
  date: string; // ISO time the game started
  playerColor: Color;
  botElo: number; // MAX_ELO means full strength
  timeControl: TimeControl;
  moves: PlayedMove[];
  result: GameResult; // from the player's point of view
  winner: Color | null;
  reason: string;
  assisted: boolean;
  assists?: AssistCounts; // missing in games saved before this feature
  helped?: boolean; // Helped mode was switched on
  help?: HelpCounts;
  takebacks?: TakebackRecord[]; // where each takeback happened
  notes?: Record<string, string>; // notes from Analysis, keyed by the moves so far ("e2e4 c7c5")
  startFen?: string; // practice games start from a position
  practice?: PracticeInfo;
}

export interface AnalysisInit {
  moves: PlayedMove[];
  game?: SavedGame;
  ply?: number; // open the analysis at this move (default: the end)
  orientation?: Color; // which side to show at the bottom
  fileName?: string; // the saved game's file, so notes can be saved into it
  notes?: Record<string, string>; // notes to show (e.g. from one of your guide lines)
  editLine?: UserLine; // opened to edit one of your guide lines
}

export interface ReviewInit {
  game: SavedGame;
  fileName?: string; // lets the review be saved and reopened later
}

/** A game that was paused to come back to later. */
export interface PausedGame {
  version: 1;
  id: string;
  savedAt: string;
  pinned: boolean; // pinned games are never pushed out by newer ones
  config: GameConfig;
  playerColor: Color;
  startedAt: string;
  moves: PlayedMove[];
  clocks: { white: number; black: number };
  assists: AssistCounts;
  help: HelpCounts;
  takebacks: TakebackRecord[];
}

// ---------- Opening guide ----------
export interface UserLine {
  id: string;
  opening: string; // an opening name from the database
  name: string;
  note: string;
  notes?: Record<number, string>; // a note on each move (1 = after the first move); `note` is for the start
  ucis: string[];
  side: Color; // the side to show the board from
  created: string;
}

// ---------- Game review ----------
export type MoveClass =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "miss"
  | "mistake"
  | "blunder";

export interface ReviewedMove {
  cls: MoveClass;
  loss: number; // win-chance lost by this move, in percentage points
  best?: string; // the engine's preferred move in that position (UCI)
}

export interface EvalPoint {
  pct: number; // White's win chance, 0-100
  label: string; // "+0.3", "-M4", ...
}

export interface GameReview {
  version: 1;
  depth: number;
  moves: ReviewedMove[]; // one per move played
  evals: EvalPoint[]; // one per position (moves + 1)
  calib?: number;
  accuracy: { white: number; black: number };
}
// ---------- Flashcards ----------
export interface FlashLine {
  id: string;
  name: string;
  opening: string;
  ucis: string[]; // from the standard start position
  side: Color; // the side you play
  created: string;
  group?: string; // set for lines that came from a repertoire (its id)
}

export interface CardMemory {
  box: number; // 0 = forgotten, up to 5
  due: string; // ISO time
  lapses: number;
  seen: number;
  last: string;
}
// ---------- Practice ----------
export type PracticeKind = "mates" | "endgame" | "conversion" | "material" | "defence";

export interface PracticeInfo {
  kind: PracticeKind;
  label: string; // e.g. "Endgame: K+R+P vs K+R"
}

export const PRACTICE_KINDS: { id: PracticeKind; label: string; blurb: string }[] = [
  { id: "mates", label: "Basic mates", blurb: "Queen, rook, two bishops, bishop + knight" },
  { id: "endgame", label: "Endgames", blurb: "Convert a winning rook, pawn, minor-piece or queen ending" },
  { id: "conversion", label: "Convert an advantage", blurb: "You're clearly better: finish the job" },
  { id: "material", label: "Win material", blurb: "A tactic is there: find it and cash in" },
  { id: "defence", label: "Defend a worse position", blurb: "You're worse: hold on" },
];

export const PRACTICE_LABEL: Record<PracticeKind, string> = {
  mates: "Basic mates",
  endgame: "Endgame",
  conversion: "Conversion",
  material: "Win material",
  defence: "Defence",
};

// ---------- Repertoire builder ----------
/** One move in a repertoire tree. Its children are the moves that can follow it. */
export interface RepNode {
  uci: string;
  note: string;
  name?: string; // optional name for the line that ends here (only used on a last move)
  folder?: string; // folder of the line(s) through this move; "" = explicitly none. The nearest one towards the end of a line wins
  children: RepNode[]; // the first child is the main line
}

export interface Repertoire {
  version: 1;
  id: string;
  name: string;
  side: Color; // the side you play
  description: string;
  favorite?: boolean; // pinned to the top of the list
  folders?: LineFolder[]; // folders that group this repertoire's lines
  created: string;
  updated: string;
  moves: RepNode[]; // the first moves from the starting position
}

/** A folder inside one repertoire, grouping its lines (e.g. "Closed Sicilian"). */
export interface LineFolder {
  id: string;
  name: string;
  first?: string; // Black repertoires: only shown among the lines against this White first move (UCI)
}
