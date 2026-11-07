import { useEffect, useRef, useState } from "react";
import { BackButton } from "../components/BackButton";
import { Slider } from "../components/Slider";
import { analysisEngine } from "../engine/stockfish";
import { Cancelled, generatePosition, type EndgameType } from "../practiceGen";
import {
  DEFAULT_CONFIG,
  MAX_ELO,
  MIN_ELO,
  PRACTICE_KINDS,
  TIME_CONTROLS,
  type GameConfig,
  type PracticeKind,
} from "../types";

interface PracticeSetupProps {
  onBack: () => void;
  onStart: (config: GameConfig) => void;
}

const OPT_KEY = "practice-options";

interface Options {
  kind: PracticeKind;
  elo: number;
  helped: boolean;
  showEval: boolean;
  endgameType: EndgameType;
}

const DEFAULT_OPTIONS: Options = {
  kind: "endgame",
  elo: 1500,
  helped: false,
  showEval: false,
  endgameType: "any",
};

function loadOptions(): Options {
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(OPT_KEY) ?? "{}") };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

/** Pick what to practise, how strong the bot is, helper and eval bar. Then a position is made. */
export function PracticeSetup({ onBack, onStart }: PracticeSetupProps) {
  const [opts, setOpts] = useState<Options>(loadOptions);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const cancel = useRef(false);

  useEffect(() => {
    return () => {
      cancel.current = true;
      analysisEngine.stop();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(OPT_KEY, JSON.stringify(opts));
    } catch {
      /* the choices just won't be remembered */
    }
  }, [opts]);

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const begin = async () => {
    if (busy) return;
    cancel.current = false;
    setBusy(true);
    setError("");
    setStatus("Starting Stockfish...");
    try {
      await analysisEngine.init();
      const pos = await generatePosition({
        kind: opts.kind,
        endgameType: opts.endgameType,
        engine: analysisEngine,
        cancelled: () => cancel.current,
        onStatus: setStatus,
      });
      if (cancel.current) return;
      onStart({
        ...DEFAULT_CONFIG,
        colorChoice: pos.side,
        elo: opts.elo,
        timeControl: TIME_CONTROLS[0],
        showEval: opts.showEval,
        helped: opts.helped,
        opening: null,
        startFen: pos.fen,
        practice: { kind: opts.kind, label: pos.label },
      });
    } catch (e) {
      if (!(e instanceof Cancelled)) {
        console.error("Practice position failed:", e);
        setError(e instanceof Error ? e.message : "Couldn't make a position (see console).");
      }
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    cancel.current = true;
    analysisEngine.stop();
  };

  return (
    <div className="config">
      <BackButton onClick={onBack} />
      <h1>Practice setup</h1>

      <div className="field">
        <div className="field-label">What to practise</div>
        <div className="practice-kinds">
          {PRACTICE_KINDS.map((k) => (
            <button
              key={k.id}
              className={`kind-card ${opts.kind === k.id ? "selected" : ""}`}
              disabled={busy}
              onClick={() => set("kind", k.id)}
            >
              <span className="menu-title">{k.label}</span>
              <span className="menu-sub">{k.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {opts.kind === "endgame" && (
        <div className="field">
          <div className="field-label">Endgame type</div>
          <select
            value={opts.endgameType}
            disabled={busy}
            onChange={(e) => set("endgameType", e.target.value as EndgameType)}
          >
            <option value="any">Any</option>
            <option value="rook">Rook endgames</option>
            <option value="pawn">Pawn endgames</option>
            <option value="minor">Bishop / knight endgames</option>
            <option value="queen">Queen endgames</option>
          </select>
        </div>
      )}

      <div className="field">
        <div className="field-label">
          Bot strength: {opts.elo >= MAX_ELO ? "Full strength" : `${opts.elo} Elo`}
        </div>
        <Slider
          min={MIN_ELO}
          max={MAX_ELO}
          step={10}
          value={opts.elo}
          onChange={(elo) => set("elo", elo)}
        />
        <div className="note">
          Elo values are approximate. The far right is unrestricted.
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={opts.showEval}
          disabled={busy}
          onChange={(e) => set("showEval", e.target.checked)}
        />
        Show evaluation bar
      </label>

      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={opts.helped}
            disabled={busy}
            onChange={(e) => set("helped", e.target.checked)}
          />
          <span className="helped-label">Helped mode</span>
        </label>
        <div className="note">
          Warns you after a bad move, shows how it's punished, and lets you take it back for
          free. The Hint button is always there and counts as assisted.
        </div>
      </div>

      {busy && (
        <div className="setup-card gen-box">
          <div>{status}</div>
          <div className="note">
            Positions are checked with Stockfish, so this can take a few seconds.
          </div>
          <button onClick={stop}>Cancel</button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      <div className="config-buttons">
        <span />
        <button className="primary" disabled={busy} onClick={begin}>
          Start practice
        </button>
      </div>
    </div>
  );
}
