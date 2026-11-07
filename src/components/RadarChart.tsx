export interface RadarLayer {
  key: string;
  name: string;
  values: (number | null)[]; // 0 = centre (weak), 100 = edge (strong), null = not enough data
  stroke: string;
  fill: string;
  dashed?: boolean;
}

interface RadarProps {
  labels: string[];
  layers: RadarLayer[]; // drawn in order: the last one is on top
}

const W = 460;
const H = 410;
const CX = W / 2;
const CY = H / 2 + 4;
const R = 130;
const RINGS = [20, 40, 60, 80, 100];

/** A polygon chart: the centre is weak, the outer edge is strong. */
export function RadarChart({ labels, layers }: RadarProps) {
  const n = labels.length;
  const angle = (k: number) => -Math.PI / 2 + (2 * Math.PI * k) / n;
  const pt = (k: number, v: number) => {
    const r = (R * Math.max(0, Math.min(100, v))) / 100;
    return [CX + r * Math.cos(angle(k)), CY + r * Math.sin(angle(k))] as const;
  };
  const ring = (v: number) =>
    labels.map((_, k) => pt(k, v).join(",")).join(" ");

  return (
    <svg className="radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Performance polygon">
      {RINGS.map((v) => (
        <polygon key={v} points={ring(v)} className="radar-ring" />
      ))}
      {labels.map((_, k) => {
        const [x, y] = pt(k, 100);
        return <line key={k} x1={CX} y1={CY} x2={x} y2={y} className="radar-spoke" />;
      })}
      {RINGS.filter((v) => v % 40 === 0 || v === 100).map((v) => (
        <text key={v} x={CX + 3} y={CY - (R * v) / 100 - 2} className="radar-scale">
          {v}
        </text>
      ))}

      {layers.map((layer) => (
        <g key={layer.key}>
          <polygon
            points={layer.values.map((v, k) => pt(k, v ?? 0).join(",")).join(" ")}
            fill={layer.fill}
            stroke={layer.stroke}
            strokeWidth={layer.dashed ? 1.6 : 2}
            strokeDasharray={layer.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
          />
          {!layer.dashed &&
            layer.values.map((v, k) => {
              const [x, y] = pt(k, v ?? 0);
              return (
                <circle
                  key={k}
                  cx={x}
                  cy={y}
                  r={v === null ? 2.5 : 3.5}
                  fill={v === null ? "none" : layer.stroke}
                  stroke={layer.stroke}
                  strokeWidth={1.5}
                >
                  <title>
                    {labels[k]} ({layer.name}): {v === null ? "not enough data" : Math.round(v)}
                  </title>
                </circle>
              );
            })}
        </g>
      ))}

      {labels.map((label, k) => {
        const a = angle(k);
        const x = CX + (R + 16) * Math.cos(a);
        const y = CY + (R + 16) * Math.sin(a);
        const c = Math.cos(a);
        const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
        const dy = Math.sin(a) > 0.5 ? 12 : Math.sin(a) < -0.5 ? -2 : 4;
        return (
          <text key={label} x={x} y={y + dy} textAnchor={anchor} className="radar-label">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
