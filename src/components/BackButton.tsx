interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

/** The same Back button, in the same place (top left of the window), on every screen. */
export function BackButton({ onClick, label = "Back" }: BackButtonProps) {
  return (
    <button className="back-btn" onClick={onClick} title={label}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M9.5 3 4.5 8l5 5M5 8h8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}
