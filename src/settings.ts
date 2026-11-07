// All the app's settings in one place. Stored in localStorage; every field is validated on load,
// so a missing or damaged value just falls back to its default.

export type BoardTheme =
  | "classic"
  | "green"
  | "blue"
  | "grey"
  | "purple"
  | "coral"
  | "midnight"
  | "custom";

export const BOARD_THEMES: { id: BoardTheme; label: string; light: string; dark: string }[] = [
  { id: "classic", label: "Classic wood", light: "#f0d9b5", dark: "#b58863" },
  { id: "green", label: "Green", light: "#eeeed2", dark: "#769656" },
  { id: "blue", label: "Blue", light: "#dee3e6", dark: "#8ca2ad" },
  { id: "grey", label: "Grey", light: "#d9d9d9", dark: "#8e8e8e" },
  { id: "purple", label: "Purple", light: "#e8dff0", dark: "#8877b3" },
  { id: "coral", label: "Coral", light: "#f3e2c7", dark: "#c0785a" },
  { id: "midnight", label: "Midnight", light: "#9aa5c0", dark: "#4b5578" },
  { id: "custom", label: "Custom colours", light: "#f0d9b5", dark: "#b58863" },
];

export const ACCENTS: { id: string; label: string; color: string; hover: string }[] = [
  { id: "green", label: "Green", color: "#4d8a3c", hover: "#5fa34b" },
  { id: "blue", label: "Blue", color: "#3b78b5", hover: "#4c8fd1" },
  { id: "orange", label: "Orange", color: "#c0702a", hover: "#da843a" },
  { id: "purple", label: "Purple", color: "#7a56b5", hover: "#9068d1" },
  { id: "teal", label: "Teal", color: "#2f8a84", hover: "#3da39c" },
  { id: "red", label: "Red", color: "#b04a45", hover: "#cb5b55" },
];

export const ANIMATIONS = [
  { id: "off", label: "Off", ms: 0 },
  { id: "fast", label: "Fast", ms: 120 },
  { id: "normal", label: "Normal", ms: 200 },
  { id: "slow", label: "Slow", ms: 400 },
] as const;
export type AnimationId = (typeof ANIMATIONS)[number]["id"];

export interface Settings {
  // ----- Appearance -----
  uiScale: number; // 0.7 - 1.2: side panels
  boardScale: number; // 0.7 - 1.1: the board itself
  accent: string; // id from ACCENTS

  // ----- Board -----
  boardTheme: BoardTheme;
  boardLight: string; // used by "custom"
  boardDark: string;
  lastMoveColor: string;
  showCoordinates: boolean;
  showLastMove: boolean;
  showLegalMoves: boolean;
  showCheck: boolean;
  animation: AnimationId;

  // ----- Playing -----
  premove: boolean;
  autoQueen: boolean;
  dragGhost: boolean;
  confirmResign: boolean;
  maxPaused: number; // 1 - 10
  botThinkMs: number; // untimed games: how long the bot thinks per move
  botSpeed: number; // timed games: 0.5 - 2 (how much of its clock the bot uses)
  defaultElo: number;
  defaultColor: "white" | "black" | "random";
  defaultTimeControl: string; // a TIME_CONTROLS label
  defaultShowEval: boolean;
  defaultHelped: boolean;

  // ----- Engine -----
  evalMinDepth: number;
  evalTargetDepth: number;
  evalMaxSec: number;
  hintDepth: number;
  hintMs: number;
  helpDepth: number;
  analysisDepth: number;
  analysisMinDepth: number;
  analysisLines: number; // 1 - 5
  threads: number; // applied when the app starts
  hashMb: number; // applied when the app starts

  // ----- Review & stats -----
  reviewDepth: number;
  statsPeriod: string; // a Period id from stats.ts
  statsPractice: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  uiScale: 1,
  boardScale: 1,
  accent: "green",

  boardTheme: "classic",
  boardLight: "#f0d9b5",
  boardDark: "#b58863",
  lastMoveColor: "#9bc700",
  showCoordinates: true,
  showLastMove: true,
  showLegalMoves: true,
  showCheck: true,
  animation: "normal",

  premove: true,
  autoQueen: false,
  dragGhost: true,
  confirmResign: true,
  maxPaused: 5,
  botThinkMs: 600,
  botSpeed: 1,
  defaultElo: 1500,
  defaultColor: "white",
  defaultTimeControl: "Unlimited",
  defaultShowEval: true,
  defaultHelped: false,

  evalMinDepth: 16,
  evalTargetDepth: 24,
  evalMaxSec: 8,
  hintDepth: 16,
  hintMs: 2500,
  helpDepth: 12,
  analysisDepth: 30,
  analysisMinDepth: 14,
  analysisLines: 3,
  threads: 2,
  hashMb: 32,

  reviewDepth: 14,
  statsPeriod: "g50",
  statsPractice: false,
};

// Which fields the Settings page groups together (used by its per-section Reset buttons)
export const SECTION_KEYS: Record<string, (keyof Settings)[]> = {
  appearance: ["uiScale", "boardScale", "accent"],
  board: [
    "boardTheme", "boardLight", "boardDark", "lastMoveColor", "showCoordinates",
    "showLastMove", "showLegalMoves", "showCheck", "animation",
  ],
  playing: [
    "premove", "autoQueen", "dragGhost", "confirmResign", "maxPaused", "botThinkMs", "botSpeed",
  ],
  newgame: ["defaultElo", "defaultColor", "defaultTimeControl", "defaultShowEval", "defaultHelped"],
  engine: [
    "evalMinDepth", "evalTargetDepth", "evalMaxSec", "hintDepth", "hintMs", "helpDepth",
    "analysisDepth", "analysisMinDepth", "analysisLines", "threads", "hashMb",
  ],
  review: ["reviewDepth", "statsPeriod", "statsPractice"],
};

export function resetKeys(s: Settings, keys: (keyof Settings)[]): Settings {
  const next = { ...s } as Record<string, unknown>;
  for (const k of keys) next[k] = DEFAULT_SETTINGS[k];
  return next as unknown as Settings;
}

const KEY = "chess-app-settings";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Takes whatever was stored and returns a complete, valid Settings object. */
export function sanitize(raw: unknown): Settings {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const num = (k: keyof Settings, lo: number, hi: number, round = false): number => {
    const v = Number(p[k]);
    const n = p[k] === undefined || !Number.isFinite(v) ? (d[k] as number) : v;
    return round ? Math.round(clamp(n, lo, hi)) : clamp(n, lo, hi);
  };
  const bool = (k: keyof Settings): boolean => (typeof p[k] === "boolean" ? (p[k] as boolean) : (d[k] as boolean));
  const hex = (k: keyof Settings): string => (typeof p[k] === "string" && HEX.test(p[k] as string) ? (p[k] as string) : (d[k] as string));
  const oneOf = <T extends string>(k: keyof Settings, list: readonly T[]): T =>
    list.includes(p[k] as T) ? (p[k] as T) : (d[k] as unknown as T);

  const evalTarget = num("evalTargetDepth", 10, 40, true);
  const analysisDepth = num("analysisDepth", 10, 50, true);
  return {
    uiScale: num("uiScale", 0.7, 1.2),
    boardScale: num("boardScale", 0.7, 1.1),
    accent: oneOf("accent", ACCENTS.map((a) => a.id)),

    boardTheme: oneOf("boardTheme", BOARD_THEMES.map((t) => t.id)),
    boardLight: hex("boardLight"),
    boardDark: hex("boardDark"),
    lastMoveColor: hex("lastMoveColor"),
    showCoordinates: bool("showCoordinates"),
    showLastMove: bool("showLastMove"),
    showLegalMoves: bool("showLegalMoves"),
    showCheck: bool("showCheck"),
    animation: oneOf("animation", ANIMATIONS.map((a) => a.id)),

    premove: bool("premove"),
    autoQueen: bool("autoQueen"),
    dragGhost: bool("dragGhost"),
    confirmResign: bool("confirmResign"),
    maxPaused: num("maxPaused", 1, 10, true),
    botThinkMs: num("botThinkMs", 100, 5000, true),
    botSpeed: num("botSpeed", 0.5, 2),
    defaultElo: num("defaultElo", 1320, 3190, true),
    defaultColor: oneOf("defaultColor", ["white", "black", "random"] as const),
    defaultTimeControl: typeof p.defaultTimeControl === "string" ? (p.defaultTimeControl as string) : d.defaultTimeControl,
    defaultShowEval: bool("defaultShowEval"),
    defaultHelped: bool("defaultHelped"),

    evalMinDepth: Math.min(num("evalMinDepth", 6, 40, true), evalTarget),
    evalTargetDepth: evalTarget,
    evalMaxSec: num("evalMaxSec", 1, 60, true),
    hintDepth: num("hintDepth", 6, 30, true),
    hintMs: num("hintMs", 500, 15000, true),
    helpDepth: num("helpDepth", 6, 24, true),
    analysisDepth,
    analysisMinDepth: Math.min(num("analysisMinDepth", 6, 40, true), analysisDepth),
    analysisLines: num("analysisLines", 1, 5, true),
    threads: num("threads", 1, 16, true),
    hashMb: num("hashMb", 16, 2048, true),

    reviewDepth: num("reviewDepth", 8, 24, true),
    statsPeriod: typeof p.statsPeriod === "string" ? (p.statsPeriod as string) : d.statsPeriod,
    statsPractice: bool("statsPractice"),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : {});
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * The settings as they are right now. Code that isn't a React component (the engines, the Board)
 * reads `live.something`; `applySettings` keeps it up to date whenever a setting changes.
 */
export let live: Settings = loadSettings();

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

/** Applies the look-and-feel settings to the whole window (CSS variables and data attributes). */
export function applySettings(s: Settings) {
  live = s;
  const root = document.documentElement;
  const style = root.style;
  style.setProperty("--ui", String(s.uiScale));
  style.setProperty("--board-scale", String(s.boardScale));

  const theme = BOARD_THEMES.find((t) => t.id === s.boardTheme) ?? BOARD_THEMES[0];
  const light = s.boardTheme === "custom" ? s.boardLight : theme.light;
  const dark = s.boardTheme === "custom" ? s.boardDark : theme.dark;
  style.setProperty("--sq-light", light);
  style.setProperty("--sq-dark", dark);
  style.setProperty("--last-move", hexToRgba(s.lastMoveColor, 0.45));

  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  style.setProperty("--accent", accent.color);
  style.setProperty("--accent-hover", accent.hover);

  root.dataset.board = s.boardTheme === "classic" ? "classic" : "flat";
  root.dataset.coords = s.showCoordinates ? "on" : "off";
  root.dataset.lastmove = s.showLastMove ? "on" : "off";
  root.dataset.dests = s.showLegalMoves ? "on" : "off";
  root.dataset.check = s.showCheck ? "on" : "off";
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Chessground's animation option from the settings. */
export function animationOption(s: Settings = live): { enabled: boolean; duration: number } {
  const a = ANIMATIONS.find((x) => x.id === s.animation) ?? ANIMATIONS[2];
  return { enabled: a.ms > 0, duration: a.ms };
}
