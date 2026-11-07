import { useMemo, useState } from "react";
import { pvToSan, START_FEN } from "../chessLogic";
import { searchOpenings, type OpeningChoice } from "../openings";
import type { ForcedOpening } from "../types";

interface OpeningPickerProps {
  value: ForcedOpening | null;
  onChange: (value: ForcedOpening | null) => void;
}

export function OpeningPicker({ value, onChange }: OpeningPickerProps) {
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchOpenings(query), [query]);

  const pick = (o: OpeningChoice) => {
    onChange({
      name: o.name,
      eco: o.eco,
      ucis: o.ucis,
      mode: value?.mode ?? "variations",
    });
    setBrowsing(false);
    setQuery("");
  };

  return (
    <div className="opening-picker">
      {value?.lines && !browsing && (
        <div className="opening-current">
          <div className="opening-current-name">{value.name}</div>
          <div className="note">
            Stockfish plays any line of this repertoire, for as long as you stay in it. Once you leave
            the lines, it plays normally.
          </div>
          <div className="buttons">
            <button onClick={() => setBrowsing(true)}>Change</button>
            <button onClick={() => onChange(null)}>Clear</button>
          </div>
        </div>
      )}

      {value && !value.lines && !browsing && (
        <div className="opening-current">
          <div className="opening-current-name">
            {value.eco ? `${value.eco} · ` : ""}
            {value.name}
          </div>
          <div className="opening-current-moves">
            {pvToSan(START_FEN, value.ucis, 40)}
          </div>
          <div className="seg">
            <button
              className={value.mode === "variations" ? "selected" : ""}
              onClick={() => onChange({ ...value, mode: "variations" })}
            >
              Any variation
            </button>
            <button
              className={value.mode === "exact" ? "selected" : ""}
              onClick={() => onChange({ ...value, mode: "exact" })}
            >
              This exact line
            </button>
          </div>
          <div className="note">
            {value.mode === "variations"
              ? "Stockfish follows this opening and picks randomly between its variations when it has a choice."
              : "Stockfish only plays the moves of this exact line."}{" "}
            Once you leave the line, it plays normally.
          </div>
          <div className="buttons">
            <button onClick={() => setBrowsing(true)}>Change</button>
            <button onClick={() => onChange(null)}>Clear</button>
          </div>
        </div>
      )}

      {!value && !browsing && (
        <button onClick={() => setBrowsing(true)}>Choose an opening...</button>
      )}

      {browsing && (
        <>
          <input
            className="opening-search"
            autoFocus
            placeholder="Search: sicilian, najdorf, reti, catalan..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="opening-results">
            {results.map((o) => (
              <button
                key={o.name}
                className="opening-result"
                onClick={() => pick(o)}
                title={pvToSan(START_FEN, o.ucis, 40)}
              >
                <span className="eco">{o.eco}</span> {o.name}
              </button>
            ))}
            {results.length === 0 && <div className="note">No matches.</div>}
          </div>
          <button onClick={() => setBrowsing(false)}>Cancel</button>
        </>
      )}
    </div>
  );
}
