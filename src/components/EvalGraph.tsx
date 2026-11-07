interface EvalGraphProps {
  values: number[]; // White's win chance for every position, 0-100
  current: number; // the position being viewed
  onSelect: (index: number) => void;
}

export function EvalGraph({ values, current, onSelect }: EvalGraphProps) {
  const n = Math.max(1, values.length - 1);
  const x = (i: number) => (i / n) * 100;
  const y = (pct: number) => 40 * (1 - pct / 100);
  const line = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `0,40 ${line} 100,40`;

  return (
    <svg
      className="eval-graph"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - rect.left) / rect.width) * n);
        onSelect(Math.max(0, Math.min(values.length - 1, i)));
      }}
    >
      <rect x="0" y="0" width="100" height="40" className="eg-bg" />
      <polygon points={area} className="eg-area" />
      <line x1="0" y1="20" x2="100" y2="20" className="eg-mid" />
      <polyline points={line} className="eg-line" fill="none" />
      <line x1={x(current)} y1="0" x2={x(current)} y2="40" className="eg-cursor" />
    </svg>
  );
}