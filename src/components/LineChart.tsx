export interface LineSeries {
  key: string;
  name: string;
  color: string;
  values: (number | null)[]; // 0-100, null = no point (the line breaks)
  dots?: boolean;
}

const W = 600;
const H = 170;
const PAD_L = 30;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 14;

/** A small 0-100 line chart. The x axis is just "game number", oldest first. */
export function LineChart({ series, emptyText }: { series: LineSeries[]; emptyText: string }) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (n === 0) return <div className="note">{emptyText}</div>;

  const x = (i: number) =>
    n > 1 ? PAD_L + (i * (W - PAD_L - PAD_R)) / (n - 1) : (PAD_L + W - PAD_R) / 2;
  const y = (v: number) => PAD_T + ((100 - v) * (H - PAD_T - PAD_B)) / 100;

  return (
    <svg className="linechart" viewBox={`0 0 ${W} ${H}`} role="img">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="lc-grid" />
          <text x={PAD_L - 5} y={y(v) + 3} textAnchor="end" className="lc-axis">
            {v}
          </text>
        </g>
      ))}
      {series.map((s) => {
        // break the line wherever there is no value
        const segments: string[] = [];
        let cur = "";
        s.values.forEach((v, i) => {
          if (v === null) {
            if (cur) segments.push(cur);
            cur = "";
          } else {
            cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          }
        });
        if (cur) segments.push(cur);
        return (
          <g key={s.key}>
            {!s.dots &&
              segments.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              ))}
            {s.values.map((v, i) =>
              v === null || (!s.dots && n > 40) ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={s.dots ? 3 : 2.2} fill={s.color}>
                  <title>
                    {s.name}: {v.toFixed(1)} (game {i + 1})
                  </title>
                </circle>
              )
            )}
          </g>
        );
      })}
    </svg>
  );
}
