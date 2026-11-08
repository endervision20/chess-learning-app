import { useState, type ReactNode } from "react";
import { BackButton } from "../components/BackButton";
import { MiniBoard } from "../components/MiniBoard";
import { Slider } from "../components/Slider";
import { START_FEN } from "../chessLogic";
import { PERIODS } from "../stats";
import { deleteAllReviews, resetFlashcardMemory } from "../storage/maintenance";
import { ACCENTS, ANIMATIONS, BOARD_THEMES, DEFAULT_SETTINGS, SECTION_KEYS, resetKeys, type Settings } from "../settings";
import { MAX_ELO, MIN_ELO, TIME_CONTROLS } from "../types";

interface SettingsPageProps {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
}

type Tab = "appearance" | "board" | "playing" | "engine" | "review" | "data";

const TABS: { id: Tab; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "board", label: "Board" },
  { id: "playing", label: "Playing" },
  { id: "engine", label: "Engine" },
  { id: "review", label: "Review & stats" },
  { id: "data", label: "Data" },
];

function Section({ title, reset, children }: { title: string; reset?: () => void; children: ReactNode }) {
  return (
    <section className="set-section">
      <div className="set-head">
        <h2>{title}</h2>
        {reset && (
          <button className="link-btn" onClick={reset}>
            Reset this section
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ label, note, children }: { label: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">{label}</div>
      <div className="set-control">{children}</div>
      {note && <div className="note set-note">{note}</div>}
    </div>
  );
}

function Toggle({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="set-row">
      <label className="check">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {note && <div className="note set-note">{note}</div>}
    </div>
  );
}

function SliderRow({
  label,
  note,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  note?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={`${label}: ${format ? format(value) : value}`} note={note}>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
    </Row>
  );
}

function Danger({
  label,
  note,
  button,
  action,
}: {
  label: string;
  note: string;
  button: string;
  action: () => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "done" | "error">("idle");
  const run = async () => {
    setState("busy");
    try {
      await action();
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  };
  return (
    <Row label={label} note={note}>
      {state === "confirm" ? (
        <span className="set-inline">
          Are you sure?
          <button className="danger" onClick={run}>
            Yes, {button.toLowerCase()}
          </button>
          <button onClick={() => setState("idle")}>Cancel</button>
        </span>
      ) : (
        <span className="set-inline">
          <button onClick={() => setState("confirm")} disabled={state === "busy"}>
            {button}
          </button>
          {state === "done" && <span className="good">Done.</span>}
          {state === "error" && <span className="bad">That didn't work (see the console).</span>}
        </span>
      )}
    </Row>
  );
}

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)} s` : `${v} ms`);

export function SettingsPage({ settings: s, onChange, onBack }: SettingsPageProps) {
  const [tab, setTab] = useState<Tab>("appearance");
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...s, [key]: value });
  const resetSection = (name: keyof typeof SECTION_KEYS) => () => onChange(resetKeys(s, SECTION_KEYS[name]));

  const tcIndex = Math.max(0, TIME_CONTROLS.findIndex((t) => t.label === s.defaultTimeControl));

  return (
    <div className="settings-page">
      <BackButton onClick={onBack} />
      <h1>Settings</h1>

      <div className="set-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`set-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "appearance" && (
        <>
          <Section title="Size" reset={resetSection("appearance")}>
            <SliderRow
              label="Side panel size"
              min={70}
              max={120}
              step={5}
              value={Math.round(s.uiScale * 100)}
              format={(v) => `${v}%`}
              onChange={(v) => set("uiScale", v / 100)}
              note="Makes the text and buttons beside the board smaller or larger so more fits on the screen."
            />
            <SliderRow
              label="Board size"
              min={70}
              max={110}
              step={5}
              value={Math.round(s.boardScale * 100)}
              format={(v) => `${v}%`}
              onChange={(v) => set("boardScale", v / 100)}
              note="Scales the board on the Play, Analysis and Review screens."
            />
            <SliderRow
              label="Tiles per row"
              min={0}
              max={5}
              step={1}
              value={s.tileColumns}
              format={(v) => (v === 0 ? "Auto" : String(v))}
              onChange={(v) => set("tileColumns", v)}
              note="For the tile views of openings, repertoires and lines. Auto fits as many as the screen allows; 1 to 5 sets it exactly, so a higher number gives smaller tiles."
            />
          </Section>
          <Section title="Colour">
            <Row label="Accent colour" note="Used for the main buttons and sliders.">
              <div className="swatch-row">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    className={`accent-swatch ${s.accent === a.id ? "selected" : ""}`}
                    style={{ background: a.color }}
                    title={a.label}
                    aria-label={a.label}
                    onClick={() => set("accent", a.id)}
                  />
                ))}
              </div>
            </Row>
          </Section>
        </>
      )}

      {tab === "board" && (
        <div className="set-board">
          <div className="set-board-main">
            <Section title="Board colours" reset={resetSection("board")}>
              <Row label="Theme">
                <div className="theme-grid">
                  {BOARD_THEMES.map((t) => (
                    <button
                      key={t.id}
                      className={`theme-card ${s.boardTheme === t.id ? "selected" : ""}`}
                      onClick={() => set("boardTheme", t.id)}
                    >
                      <span
                        className="theme-chip"
                        style={{
                          background: `conic-gradient(${
                            t.id === "custom" ? s.boardLight : t.light
                          } 25%, ${t.id === "custom" ? s.boardDark : t.dark} 0 50%, ${
                            t.id === "custom" ? s.boardLight : t.light
                          } 0 75%, ${t.id === "custom" ? s.boardDark : t.dark} 0)`,
                        }}
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
              </Row>
              {s.boardTheme === "custom" && (
                <Row label="Custom colours">
                  <span className="set-inline">
                    <label className="color-field">
                      Light squares
                      <input type="color" value={s.boardLight} onChange={(e) => set("boardLight", e.target.value)} />
                    </label>
                    <label className="color-field">
                      Dark squares
                      <input type="color" value={s.boardDark} onChange={(e) => set("boardDark", e.target.value)} />
                    </label>
                  </span>
                </Row>
              )}
              <Row label="Last-move highlight colour">
                <input type="color" value={s.lastMoveColor} onChange={(e) => set("lastMoveColor", e.target.value)} />
              </Row>
            </Section>

            <Section title="What the board shows">
              <Toggle label="Coordinates (a–h, 1–8)" value={s.showCoordinates} onChange={(v) => set("showCoordinates", v)} />
              <Toggle label="Highlight the last move" value={s.showLastMove} onChange={(v) => set("showLastMove", v)} />
              <Toggle
                label="Show legal moves (dots)"
                note="Dots on the squares a selected piece can move to."
                value={s.showLegalMoves}
                onChange={(v) => set("showLegalMoves", v)}
              />
              <Toggle label="Highlight a king in check" value={s.showCheck} onChange={(v) => set("showCheck", v)} />
              <Row label="Piece animation">
                <select value={s.animation} onChange={(e) => set("animation", e.target.value as Settings["animation"])}>
                  {ANIMATIONS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Row>
            </Section>
          </div>
          <div className="set-preview">
            <div className="field-label">Preview</div>
            <MiniBoard fen={START_FEN} size={240} />
            <div className="note">The small preview hides coordinates; the real boards follow your choice.</div>
          </div>
        </div>
      )}

      {tab === "playing" && (
        <>
          <Section title="While playing" reset={resetSection("playing")}>
            <Toggle
              label="Premoves"
              note="Queue a move while it's the bot's turn."
              value={s.premove}
              onChange={(v) => set("premove", v)}
            />
            <Toggle
              label="Always promote to a queen"
              note="Skips the promotion picker."
              value={s.autoQueen}
              onChange={(v) => set("autoQueen", v)}
            />
            <Toggle
              label="Show a ghost piece while dragging"
              value={s.dragGhost}
              onChange={(v) => set("dragGhost", v)}
            />
            <Toggle
              label="Ask before resigning"
              value={s.confirmResign}
              onChange={(v) => set("confirmResign", v)}
            />
            <SliderRow
              label="Paused games to keep"
              min={1}
              max={10}
              value={s.maxPaused}
              onChange={(v) => set("maxPaused", v)}
              note="When you pause one more game than this, the oldest paused game that isn't pinned (📌) counts as a loss by abandonment."
            />
          </Section>
          <Section title="Bot speed">
            <SliderRow
              label="Thinking time (untimed games)"
              min={100}
              max={5000}
              step={100}
              value={s.botThinkMs}
              format={ms}
              onChange={(v) => set("botThinkMs", v)}
            />
            <SliderRow
              label="Clock use (timed games)"
              min={50}
              max={200}
              step={10}
              value={Math.round(s.botSpeed * 100)}
              format={(v) => `${v}%`}
              onChange={(v) => set("botSpeed", v / 100)}
              note="How much of its clock the bot spends compared with normal. Lower means it moves faster."
            />
          </Section>
          <Section title="New game defaults" reset={resetSection("newgame")}>
            <Row label="Bot strength" note="The starting values on the Play setup screen.">
              <div className="set-slider-wide">
                <div className="set-label">
                  {s.defaultElo >= MAX_ELO ? "Full strength" : `${s.defaultElo} Elo`}
                </div>
                <Slider
                  min={MIN_ELO}
                  max={MAX_ELO}
                  step={10}
                  value={s.defaultElo}
                  onChange={(v) => set("defaultElo", v)}
                />
              </div>
            </Row>
            <Row label="Your colour">
              <select value={s.defaultColor} onChange={(e) => set("defaultColor", e.target.value as Settings["defaultColor"])}>
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="random">Random</option>
              </select>
            </Row>
            <Row label="Time control">
              <select
                value={tcIndex}
                onChange={(e) => set("defaultTimeControl", TIME_CONTROLS[Number(e.target.value)].label)}
              >
                {TIME_CONTROLS.map((t, i) => (
                  <option key={t.label} value={i}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Row>
            <Toggle label="Show the eval bar" value={s.defaultShowEval} onChange={(v) => set("defaultShowEval", v)} />
            <Toggle label="Helped mode on" value={s.defaultHelped} onChange={(v) => set("defaultHelped", v)} />
          </Section>
        </>
      )}

      {tab === "engine" && (
        <>
          <Section title="Eval bar (while playing)" reset={resetSection("engine")}>
            <SliderRow
              label="Show nothing until depth"
              min={6}
              max={30}
              value={s.evalMinDepth}
              onChange={(v) => set("evalMinDepth", Math.min(v, s.evalTargetDepth))}
              note="Higher is calmer (the bar doesn't jump around) but takes a moment longer."
            />
            <SliderRow
              label="Target depth"
              min={10}
              max={36}
              value={s.evalTargetDepth}
              onChange={(v) => onChange({ ...s, evalTargetDepth: v, evalMinDepth: Math.min(s.evalMinDepth, v) })}
            />
            <SliderRow
              label="Longest think per position"
              min={1}
              max={30}
              value={s.evalMaxSec}
              format={(v) => `${v} s`}
              onChange={(v) => set("evalMaxSec", v)}
            />
          </Section>
          <Section title="Hints & Helped mode">
            <SliderRow label="Hint depth" min={8} max={26} value={s.hintDepth} onChange={(v) => set("hintDepth", v)} />
            <SliderRow
              label="Hint time limit"
              min={500}
              max={10000}
              step={500}
              value={s.hintMs}
              format={ms}
              onChange={(v) => set("hintMs", v)}
            />
            <SliderRow
              label="Helped-mode check depth"
              min={6}
              max={20}
              value={s.helpDepth}
              onChange={(v) => set("helpDepth", v)}
              note="How deeply each of your moves is checked. Lower is quicker, higher catches more."
            />
          </Section>
          <Section title="Analysis board">
            <SliderRow
              label="Target depth"
              min={10}
              max={40}
              value={s.analysisDepth}
              onChange={(v) => onChange({ ...s, analysisDepth: v, analysisMinDepth: Math.min(s.analysisMinDepth, v) })}
            />
            <SliderRow
              label="Show nothing until depth"
              min={6}
              max={30}
              value={s.analysisMinDepth}
              onChange={(v) => set("analysisMinDepth", Math.min(v, s.analysisDepth))}
            />
            <Row label="Lines shown by default">
              <select value={s.analysisLines} onChange={(e) => set("analysisLines", Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Row>
          </Section>
          <Section title="Performance (applied the next time the app starts)">
            <SliderRow
              label="Analysis threads"
              min={1}
              max={16}
              value={s.threads}
              onChange={(v) => set("threads", v)}
              note="More threads is faster on a multi-core computer. Leave a core or two free."
            />
            <SliderRow
              label="Analysis memory"
              min={16}
              max={2048}
              step={16}
              value={s.hashMb}
              format={(v) => `${v} MB`}
              onChange={(v) => set("hashMb", v)}
            />
          </Section>
        </>
      )}

      {tab === "review" && (
        <Section title="Review & stats" reset={resetSection("review")}>
          <SliderRow
            label="Game review depth"
            min={8}
            max={22}
            value={s.reviewDepth}
            onChange={(v) => set("reviewDepth", v)}
            note="Deeper reviews are more accurate but slower. Reviews you already have are kept; a deeper setting only re-reviews a game when you open it again."
          />
          <Row label="Stats page starts on">
            <select value={s.statsPeriod} onChange={(e) => set("statsPeriod", e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>
          <Toggle
            label="Include practice games in the stats by default"
            value={s.statsPractice}
            onChange={(v) => set("statsPractice", v)}
          />
          <div className="note">The Stats page remembers its filters between visits; these only apply the first time, or after resetting the filters.</div>
        </Section>
      )}

      {tab === "data" && (
        <Section title="Data">
          <Danger
            label="Saved game reviews"
            note="Deletes every saved review. Your games stay, and each review is made again when you open it."
            button="Delete all reviews"
            action={deleteAllReviews}
          />
          <Danger
            label="Flashcard progress"
            note="Forgets how well you know each card. The cards and your guide lines stay."
            button="Reset flashcard progress"
            action={resetFlashcardMemory}
          />
          <Row label="Everything" note="Puts every setting on this page back to its default.">
            <button className="danger" onClick={() => onChange(DEFAULT_SETTINGS)}>
              Reset all settings
            </button>
          </Row>
        </Section>
      )}
    </div>
  );
}
