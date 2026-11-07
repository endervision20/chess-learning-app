export type TcKind = "bullet" | "blitz" | "rapid" | "classical" | "unlimited" | "unknown";

export const TC_LABEL: Record<TcKind, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  unlimited: "Unlimited",
  unknown: "Time control not recorded",
};

/** Same split as Lichess: base time + 40 x increment. */
export function tcKind(baseSec: number, incSec: number): TcKind {
  if (baseSec === 0) return "unlimited";
  const total = baseSec + 40 * incSec;
  if (total < 180) return "bullet";
  if (total < 480) return "blitz";
  if (total < 1500) return "rapid";
  return "classical";
}