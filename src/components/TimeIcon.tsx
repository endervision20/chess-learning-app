import type { ReactElement } from "react";
import { TC_LABEL, tcKind, type TcKind } from "../timeControl";

interface TimeIconProps {
  baseSec: number | null;
  incSec: number;
}

const ICONS: Record<Exclude<TcKind, "unlimited" | "unknown">, ReactElement> = {
  bullet: (
    <path d="M8 1c2 2 3.2 4 3.2 6.2V13H4.8V7.2C4.8 5 6 3 8 1zM4.8 14h6.4v1.4H4.8z" fill="currentColor" />
  ),
  blitz: <path d="M9.5 1 3 9h4.2L6.3 15 13 7H8.8z" fill="currentColor" />,
  rapid: (
    <>
      <circle cx="8" cy="9" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6.3" y="0.8" width="3.4" height="1.6" fill="currentColor" />
    </>
  ),
  classical: (
    <path
      d="M4 1.5h8M4 14.5h8M5 1.5c0 3.5 3 4.3 3 6.5s-3 3-3 6.5M11 1.5c0 3.5-3 4.3-3 6.5s3 3 3 6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  ),
};

/** Icon for a time control, coloured by its category. */
export function TimeIcon({ baseSec, incSec }: TimeIconProps) {
  const kind: TcKind = baseSec === null ? "unknown" : tcKind(baseSec, incSec);
  const title =
    baseSec !== null && baseSec > 0
      ? `${TC_LABEL[kind]} ${baseSec / 60}+${incSec}`
      : TC_LABEL[kind];
  return (
    <span className={`tc-icon tc-${kind}`} title={title}>
      {kind === "unlimited" ? (
        "∞"
      ) : kind === "unknown" ? (
        "–"
      ) : (
        <svg viewBox="0 0 16 16" width="16" height="16">
          {ICONS[kind]}
        </svg>
      )}
    </span>
  );
}