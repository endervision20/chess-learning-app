import { useState } from "react";
import type { Key } from "chessground/types";

import { Board } from "../components/Board";
import { EvalBar } from "../components/EvalBar";
import { OpeningPicker } from "../components/OpeningPicker";
import { PlayerBar } from "../components/PlayerBar";
import { Slider } from "../components/Slider";
import { START_FEN } from "../chessLogic";
import { BackButton } from "../components/BackButton"
import { MAX_ELO, MIN_ELO, TIME_CONTROLS, type Color, type GameConfig } from "../types";

interface ConfigPageProps {
  initial: GameConfig;
  onBack: () => void;
  onStart: (config: GameConfig) => void;
}

const NO_DESTS = new Map<Key, Key[]>();

export function ConfigPage({ initial, onBack, onStart }: ConfigPageProps) {
  const [cfg, setCfg] = useState<GameConfig>(initial);
  const update = (patch: Partial<GameConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const tcIndex = Math.max(
    0,
    TIME_CONTROLS.findIndex((t) => t.label === cfg.timeControl.label)
  );

  const orientation: Color = cfg.colorChoice === "black" ? "black" : "white";
  const botName = `Stockfish (${cfg.elo >= MAX_ELO ? "full strength" : cfg.elo})`;
  const timed = cfg.timeControl.baseSec > 0;
  const bar = (c: Color) => (
    <PlayerBar
      name={c === orientation ? "You" : botName}
      captured=""
      diff={0}
      clockMs={cfg.timeControl.baseSec * 1000}
      timed={timed}
      active={false}
    />
  );

  return (
    <div className="game-layout config-layout">
      <BackButton onClick={onBack} />
      <div className="board-row">
        {cfg.showEval && <EvalBar pct={50} label="0.0" orientation={orientation} />}
        <div className="board-col">
          {bar(orientation === "white" ? "black" : "white")}
          <Board
            fen={START_FEN}
            orientation={orientation}
            turnColor="white"
            playerColor="white"
            interactive={false}
            dests={NO_DESTS}
            resync={0}
            onMove={() => {}}
          />
          {bar(orientation)}
        </div>
      </div>

      <div className="side-panel">
        <div className="status quiet">Game setup</div>

        <div className="setup-card">
          <div className="field">
            <div className="field-label">Play as</div>
            <div className="seg">
              {(["white", "random", "black"] as const).map((c) => (
                <button
                  key={c}
                  className={cfg.colorChoice === c ? "selected" : ""}
                  onClick={() => update({ colorChoice: c })}
                >
                  {c[0].toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              Bot strength: {cfg.elo >= MAX_ELO ? "Full strength" : `${cfg.elo} Elo`}
            </div>
            <Slider
              min={MIN_ELO}
              max={MAX_ELO}
              step={10}
              value={cfg.elo}
              onChange={(elo) => update({ elo })}
            />
            <div className="note">
              Elo values are approximate: Stockfish's strength limiter is only a
              rough estimate of human ratings. The far right is unrestricted.
            </div>
          </div>

          <div className="field">
            <div className="field-label">Time control</div>
            <select
              value={tcIndex}
              onChange={(e) =>
                update({ timeControl: TIME_CONTROLS[Number(e.target.value)] })
              }
            >
              {TIME_CONTROLS.map((t, i) => (
                <option key={t.label} value={i}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <div className="field-label">Opening (optional)</div>
            <OpeningPicker
              value={cfg.opening}
              onChange={(opening) => update({ opening })}
            />
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={cfg.showEval}
              onChange={(e) => update({ showEval: e.target.checked })}
            />
            Show evaluation bar
          </label>

          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={cfg.helped}
                onChange={(e) => update({ helped: e.target.checked })}
              />
              <span className="helped-label">Helped mode</span>
            </label>
            <div className="note">
              Warns you after a bad move{cfg.opening ? " or a move that leaves your opening" : ""},
              shows how it's punished, and lets you take it back for free. That counts as
              "helped" (green), not "assisted". The Hint button is always there and does count as assisted.
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              Variant <span className="soon">(coming soon)</span>
            </div>
            <select disabled value="standard">
              <option value="standard">Standard</option>
            </select>
          </div>
        </div>

        <div className="buttons">
          <button className="primary" onClick={() => onStart(cfg)}>
            Start game
          </button>
        </div>
      </div>
    </div>
  );
}
