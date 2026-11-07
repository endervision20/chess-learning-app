interface EvalBarProps {
  pct: number; // White's share, 0-100
  label: string;
  orientation: "white" | "black";
  settling?: boolean; // true while the shown value is still the old position's
}

export function EvalBar({ pct, label, orientation, settling }: EvalBarProps) {
  const whiteBottom = orientation === "white";
  const white = <div className="eval-white" style={{ height: `${pct}%` }} />;
  const black = <div className="eval-black" style={{ height: `${100 - pct}%` }} />;
  return (
    <div className="eval-wrap" title="Stockfish evaluation">
      <div className="eval-bar">
        {whiteBottom ? black : white}
        {whiteBottom ? white : black}
      </div>
      <div className={`eval-label ${settling ? "settling" : ""}`}>{label}</div>
    </div>
  );
}