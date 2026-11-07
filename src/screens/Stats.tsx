import { useEffect, useMemo, useRef, useState } from "react";
import { BackButton } from "../components/BackButton";
import { LineChart } from "../components/LineChart";
import { RadarChart } from "../components/RadarChart";
import { analysisEngine } from "../engine/stockfish";
import { CLASS_META } from "../reviewMeta";
import {
  AXES,
  DEFAULT_FILTERS,
  GRADE_ORDER,
  OPP_LABEL,
  PERIODS,
  TC_LABEL,
  accuracySeries,
  aggregate,
  baseFilter,
  gradeShares,
  openingTable,
  summarize,
  windowed,
  winRate,
  type Filters,
  type GameFacts,
  type OppBand,
  type Period,
  type Tally,
  type TcCat,
} from "../stats";
import { loadFacts, reviewMissing } from "../statsData";
import { listGames, listPractice, type GameListItem } from "../storage/games";

import { live } from "../settings";

const FILTER_KEY = "stats-filters";
const CAP = 300; // the polygon looks at the newest 300 games at most

const startFilters = (): Filters => ({
  ...DEFAULT_FILTERS,
  period: live.statsPeriod as Filters["period"],
  practice: live.statsPractice,
});

function loadFilters(): Filters {
  try {
    return { ...startFilters(), ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? "{}") };
  } catch {
    return startFilters();
  }
}

const pct = (n: number) => `${Math.round(n)}%`;

function WLBar({ t }: { t: Tally }) {
  if (t.g === 0) return <div className="wl-bar empty" />;
  return (
    <div className="wl-bar" title={`${t.w} won, ${t.d} drawn, ${t.l} lost`}>
      <span className="wl-w" style={{ width: `${(100 * t.w) / t.g}%` }} />
      <span className="wl-d" style={{ width: `${(100 * t.d) / t.g}%` }} />
      <span className="wl-l" style={{ width: `${(100 * t.l) / t.g}%` }} />
    </div>
  );
}

function TallyRow({ label, t }: { label: string; t: Tally }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{t.g}</td>
      <td className="good">{t.w}</td>
      <td>{t.d}</td>
      <td className="bad">{t.l}</td>
      <td>{t.g ? pct(winRate(t)) : "-"}</td>
    </tr>
  );
}

function Delta({ now, before, unit = "%" }: { now: number; before: number | null; unit?: string }) {
  if (before === null) return null;
  const d = now - before;
  if (Math.abs(d) < 0.5) return <span className="delta flat">no change</span>;
  return (
    <span className={`delta ${d > 0 ? "up" : "down"}`}>
      {d > 0 ? "▲" : "▼"} {Math.abs(Math.round(d))}
      {unit} vs before
    </span>
  );
}

export function Stats({ onHome }: { onHome: () => void }) {
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [compare, setCompare] = useState(false);
  const [showClean, setShowClean] = useState(true);
  const [showHelped, setShowHelped] = useState(true);
  const [all, setAll] = useState<GameListItem[] | null>(null);
  const [facts, setFacts] = useState<GameFacts[]>([]);
  const [prevFacts, setPrevFacts] = useState<GameFacts[]>([]);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [reviewing, setReviewing] = useState<{ done: number; total: number } | null>(null);
  const [tick, setTick] = useState(0); // bump to reload the facts (after reviewing)
  const [error, setError] = useState("");
  const cancel = useRef(false);
  const now = useMemo(() => Date.now(), []);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* the choices just won't be remembered */
    }
  }, [filters]);

  useEffect(() => {
    cancel.current = false;
    Promise.all([listGames(), listPractice()])
      .then(([a, b]) => setAll([...a, ...b]))
      .catch((e) => {
        console.error("Couldn't read the games:", e);
        setError("Couldn't read your games (see console).");
        setAll([]);
      });
    return () => {
      cancel.current = true;
      analysisEngine.stop();
    };
  }, []);

  // ---- which games are in view ----
  const summaryWin = useMemo(
    () => (all ? windowed(baseFilter(all, filters, false), filters.period, now) : null),
    [all, filters, now]
  );
  const scopeWin = useMemo(
    () => (all ? windowed(baseFilter(all, filters, true), filters.period, now) : null),
    [all, filters, now]
  );

  const summary = useMemo(() => summarize(summaryWin?.current ?? []), [summaryWin]);
  const prevSummary = useMemo(() => summarize(summaryWin?.previous ?? []), [summaryWin]);

  // ---- load what the polygon needs ----
  const currentItems = useMemo(() => (scopeWin?.current ?? []).slice(0, CAP), [scopeWin]);
  const previousItems = useMemo(
    () => (compare ? (scopeWin?.previous ?? []).slice(0, CAP) : []),
    [scopeWin, compare]
  );

  useEffect(() => {
    if (!scopeWin) return;
    let stale = false;
    setLoading({ done: 0, total: currentItems.length + previousItems.length });
    (async () => {
      const cur = await loadFacts(
        currentItems,
        (done) => !stale && setLoading({ done, total: currentItems.length + previousItems.length }),
        () => stale
      );
      if (stale) return;
      setFacts(cur);
      const prev = previousItems.length
        ? await loadFacts(
            previousItems,
            (done) =>
              !stale &&
              setLoading({
                done: currentItems.length + done,
                total: currentItems.length + previousItems.length,
              }),
            () => stale
          )
        : [];
      if (stale) return;
      setPrevFacts(prev);
      setLoading(null);
    })().catch((e) => {
      console.error("Stats failed:", e);
      if (!stale) setLoading(null);
    });
    return () => {
      stale = true;
    };
  }, [currentItems, previousItems, tick]);

  // ---- layers ----
  const cleanFacts = useMemo(() => facts.filter((f) => f.clean), [facts]);
  const helpedFacts = useMemo(() => facts.filter((f) => !f.clean), [facts]);
  const cleanAgg = useMemo(() => aggregate(cleanFacts), [cleanFacts]);
  const helpedAgg = useMemo(() => aggregate(helpedFacts), [helpedFacts]);
  const prevAgg = useMemo(() => aggregate(prevFacts.filter((f) => f.clean)), [prevFacts]);

  const layers = [
    ...(showHelped
      ? [
          {
            key: "helped",
            name: "With assists / help",
            values: helpedAgg.axes.map((a) => a.score),
            stroke: "#8a857d",
            fill: "rgba(138, 133, 125, 0.22)",
          },
        ]
      : []),
    ...(compare && prevFacts.length > 0
      ? [
          {
            key: "prev",
            name: "Previous period (unassisted)",
            values: prevAgg.axes.map((a) => a.score),
            stroke: "#e8e8e8",
            fill: "rgba(0, 0, 0, 0)",
            dashed: true,
          },
        ]
      : []),
    ...(showClean
      ? [
          {
            key: "clean",
            name: "Unassisted",
            values: cleanAgg.axes.map((a) => a.score),
            stroke: "#7bd35f",
            fill: "rgba(95, 163, 75, 0.35)",
          },
        ]
      : []),
  ];

  const series = useMemo(() => accuracySeries(facts), [facts]);
  const grades = useMemo(() => gradeShares(cleanFacts.length ? cleanFacts : facts), [cleanFacts, facts]);
  const openings = useMemo(() => openingTable(facts), [facts]);

  // ---- reviewing the games that haven't been reviewed ----
  const unreviewed = useMemo(() => {
    const names = new Set(facts.filter((f) => !f.reviewed).map((f) => f.fileName));
    return currentItems.filter((g) => names.has(g.fileName));
  }, [facts, currentItems]);

  const startReviews = async () => {
    cancel.current = false;
    setReviewing({ done: 0, total: unreviewed.length });
    try {
      await analysisEngine.init();
      await reviewMissing(
        unreviewed,
        (done, total) => setReviewing({ done, total }),
        () => cancel.current
      );
    } catch (e) {
      console.error("Reviewing failed:", e);
      setError("Reviewing stopped (is Stockfish available? see console).");
    }
    setReviewing(null);
    setTick((t) => t + 1);
  };
  const stopReviews = () => {
    cancel.current = true;
    analysisEngine.stop();
  };

  const total = summary.total;
  const streakText = summary.streak.kind
    ? `${summary.streak.len} ${summary.streak.kind === "win" ? "win" : summary.streak.kind === "loss" ? "loss" : "draw"}${
        summary.streak.len > 1 ? (summary.streak.kind === "loss" ? "es" : "s") : ""
      } in a row`
    : "-";
  const accClean = cleanAgg.axes.find((a) => a.id === "accuracy")?.score ?? null;
  const prevWin = compare && prevSummary.total.g > 0 ? winRate(prevSummary.total) : null;

  return (
    <div className="menu stats-screen">
      <BackButton onClick={onHome} />
      <h1>Stats</h1>
      {error && <p className="error-text">{error}</p>}

      {/* ---- filters ---- */}
      <div className="stats-filters">
        <label>
          <span className="field-label">Period</span>
          <select value={filters.period} onChange={(e) => set("period", e.target.value as Period)}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Time control</span>
          <select value={filters.tc} onChange={(e) => set("tc", e.target.value as TcCat | "all")}>
            <option value="all">All</option>
            {(Object.keys(TC_LABEL) as TcCat[]).map((k) => (
              <option key={k} value={k}>
                {TC_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Your colour</span>
          <select value={filters.color} onChange={(e) => set("color", e.target.value as Filters["color"])}>
            <option value="any">Both</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        <label>
          <span className="field-label">Opponent</span>
          <select value={filters.opp} onChange={(e) => set("opp", e.target.value as OppBand)}>
            {(Object.keys(OPP_LABEL) as OppBand[]).map((k) => (
              <option key={k} value={k}>
                {OPP_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Results count</span>
          <select value={filters.assist} onChange={(e) => set("assist", e.target.value as Filters["assist"])}>
            <option value="all">All games</option>
            <option value="clean">Unassisted only</option>
            <option value="helped">Assisted / helped only</option>
          </select>
        </label>
        <div className="stats-checks">
          <label className="check">
            <input
              type="checkbox"
              checked={filters.practice}
              onChange={(e) => set("practice", e.target.checked)}
            />
            Include practice games
          </label>
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            Compare with the period before
          </label>
        </div>
      </div>

      {all === null && <p className="note">Loading...</p>}
      {all && total.g === 0 && (
        <p className="note">No games match these filters yet. Play a game, or widen the filters.</p>
      )}

      {/* ---- win / loss ---- */}
      {total.g > 0 && (
        <section className="stats-section">
          <h2>Results</h2>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="stat-big">{pct(winRate(total))}</div>
              <div className="stat-label">Win rate</div>
              <Delta now={winRate(total)} before={prevWin} />
            </div>
            <div className="stat-card">
              <div className="stat-big">{total.g}</div>
              <div className="stat-label">Games</div>
              <div className="note">
                <span className="good">{total.w}W</span> · {total.d}D · <span className="bad">{total.l}L</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-big">{accClean === null ? "-" : `${accClean.toFixed(1)}`}</div>
              <div className="stat-label">Accuracy (unassisted)</div>
              <div className="note">needs reviewed games</div>
            </div>
            <div className="stat-card">
              <div className="stat-big">{summary.bestWinStreak}</div>
              <div className="stat-label">Best win streak</div>
              <div className="note">now: {streakText}</div>
            </div>
            <div className="stat-card">
              <div className="stat-big">{pct(summary.assistedShare)}</div>
              <div className="stat-label">Games with assists or help</div>
            </div>
          </div>
          <WLBar t={total} />
          <div className="wl-legend">
            <span className="good">■ won</span> <span>■ drawn</span> <span className="bad">■ lost</span>
          </div>

          <div className="stats-two">
            <table className="stats-table">
              <thead>
                <tr><th>Colour</th><th>Games</th><th>W</th><th>D</th><th>L</th><th>Win %</th></tr>
              </thead>
              <tbody>
                <TallyRow label="White" t={summary.white} />
                <TallyRow label="Black" t={summary.black} />
              </tbody>
            </table>
            <table className="stats-table">
              <thead>
                <tr><th>Time control</th><th>Games</th><th>W</th><th>D</th><th>L</th><th>Win %</th></tr>
              </thead>
              <tbody>
                {(Object.keys(TC_LABEL) as TcCat[])
                  .filter((k) => summary.byTc[k])
                  .map((k) => (
                    <TallyRow key={k} label={TC_LABEL[k]} t={summary.byTc[k]!} />
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- polygon ---- */}
      {all && (scopeWin?.current.length ?? 0) > 0 && (
        <section className="stats-section">
          <h2>Performance</h2>
          <div className="note">
            The middle is weak and the edge is strong. The bright layer is games played with no
            assists and no Helped mode. The grey layer underneath is games where you used them, so
            you can see how much they lift you. Most axes need reviewed games.
          </div>

          {loading && (
            <div className="note">
              Reading games... {loading.done} of {loading.total}
            </div>
          )}

          <div className="radar-row">
            <div className="radar-wrap">
              <RadarChart labels={AXES.map((a) => a.label)} layers={layers} />
              <div className="layer-legend">
                <label className="check">
                  <input type="checkbox" checked={showClean} onChange={(e) => setShowClean(e.target.checked)} />
                  <span className="swatch clean" /> Unassisted ({cleanAgg.games} games, {cleanAgg.reviewed} reviewed)
                </label>
                <label className="check">
                  <input type="checkbox" checked={showHelped} onChange={(e) => setShowHelped(e.target.checked)} />
                  <span className="swatch helped" /> With assists / help ({helpedAgg.games} games, {helpedAgg.reviewed} reviewed)
                </label>
                {compare && (
                  <div className="note">
                    <span className="swatch prev" /> Dashed outline: unassisted, the period before
                  </div>
                )}
              </div>
            </div>

            <table className="stats-table axis-table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Unassisted</th>
                  <th>Assisted</th>
                  {compare && <th>Before</th>}
                </tr>
              </thead>
              <tbody>
                {AXES.map((a, i) => (
                  <tr key={a.id} title={a.help}>
                    <td>{a.label}</td>
                    <td>{cleanAgg.axes[i].score === null ? "-" : Math.round(cleanAgg.axes[i].score!)}</td>
                    <td className="grey">
                      {helpedAgg.axes[i].score === null ? "-" : Math.round(helpedAgg.axes[i].score!)}
                    </td>
                    {compare && (
                      <td className="grey">
                        {prevAgg.axes[i].score === null ? "-" : Math.round(prevAgg.axes[i].score!)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="note">
            "-" means not enough games yet for that skill. Hover a row for what it measures.
          </div>

          {unreviewed.length > 0 && (
            <div className="setup-card review-banner">
              {reviewing ? (
                <>
                  <div>
                    Reviewing game {Math.min(reviewing.done + 1, reviewing.total)} of {reviewing.total}...
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${(100 * reviewing.done) / Math.max(1, reviewing.total)}%` }}
                    />
                  </div>
                  <button onClick={stopReviews}>Stop</button>
                </>
              ) : (
                <>
                  <div>
                    {unreviewed.length} of these {facts.length} games haven't been reviewed, so they
                    can't count towards most of the polygon.
                  </div>
                  <button className="primary" onClick={startReviews}>
                    Review {unreviewed.length} game{unreviewed.length === 1 ? "" : "s"} now
                  </button>
                  <div className="note">This can take a while (about a minute a game). Each review is saved.</div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---- trends ---- */}
      {total.g > 1 && (
        <section className="stats-section">
          <h2>Trends</h2>
          <div className="field-label">Win rate over the last 10 games</div>
          <LineChart
            emptyText="Play more games to see a trend."
            series={[{ key: "win", name: "Win rate", color: "#7bd35f", values: summary.rolling }]}
          />
          <div className="field-label">Accuracy per reviewed game</div>
          <LineChart
            emptyText="Review some games to see your accuracy over time."
            series={[
              { key: "helped", name: "With assists / help", color: "#8a857d", values: series.helped, dots: true },
              { key: "clean", name: "Unassisted", color: "#7bd35f", values: series.clean, dots: true },
            ]}
          />
        </section>
      )}

      {/* ---- move quality ---- */}
      {grades.total > 0 && (
        <section className="stats-section">
          <h2>Move quality</h2>
          <div className="note">
            Share of your moves at each grade{cleanFacts.some((f) => f.reviewed) ? " (unassisted games)" : ""}.
          </div>
          <div className="grade-list">
            {GRADE_ORDER.map((c) => (
              <div className="grade-row" key={c}>
                <span className={`grade-name ${CLASS_META[c].cls}`}>
                  {CLASS_META[c].symbol} {CLASS_META[c].label}
                </span>
                <span className="grade-track">
                  <span
                    className={`grade-bar ${CLASS_META[c].cls}`}
                    style={{ width: `${Math.min(100, grades.share[c] * 1.6)}%` }}
                  />
                </span>
                <span className="grade-pct">{grades.share[c].toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- openings ---- */}
      {openings.length > 0 && (
        <section className="stats-section">
          <h2>Your openings</h2>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Opening</th><th>Games</th><th>W</th><th>D</th><th>L</th><th>Win %</th><th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {openings.map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td>{o.tally.g}</td>
                  <td className="good">{o.tally.w}</td>
                  <td>{o.tally.d}</td>
                  <td className="bad">{o.tally.l}</td>
                  <td>{pct(winRate(o.tally))}</td>
                  <td>{o.accuracy === null ? "-" : o.accuracy.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
