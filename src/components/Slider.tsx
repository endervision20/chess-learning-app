import type { CSSProperties } from "react";

interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}

/** A slider that matches the app (the filled part is green). */
export function Slider({ min, max, step = 1, value, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ "--fill": `${pct}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}