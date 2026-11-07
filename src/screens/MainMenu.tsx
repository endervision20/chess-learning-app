import { useEffect, useState } from "react";
import { TimeIcon } from "../components/TimeIcon";
import { GameLog } from "../components/GameLog";
import { listGames, saveGame, type GameListItem } from "../storage/games";
import { deletePaused, listPaused, setPinned } from "../storage/paused";
import { abandonedGame } from "../pausedLogic";
import { MAX_ELO, type PausedGame } from "../types";

interface MainMenuProps {
  onPlay: () => void;
  onAnalysis: () => void;
  onGuide: () => void;
  onFlashcards: () => void;
  onRepertoires: () => void;
  onPractice: () => void;
  onSettings: () => void;
  onStats: () => void;
  onOpenGame: (fileName: string) => void;
  onReviewGame: (fileName: string) => void;
  onResume: (game: PausedGame) => void;
  onViewAllGames: () => void;
}

const RECENT_COUNT = 15;

export function MainMenu({
  onPlay,
  onAnalysis,
  onGuide,
  onFlashcards,
  onRepertoires,
  onPractice,
  onSettings,
  onStats,
  onOpenGame,
  onReviewGame,
  onResume,
  onViewAllGames,
}: MainMenuProps) {
  const [games, setGames] = useState<GameListItem[] | null>(null);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState<PausedGame[]>([]);
  const [confirmAbandon, setConfirmAbandon] = useState<string | null>(null);

  const refresh = () =>
    listGames()
      .then(setGames)
      .catch((e) => {
        console.error("Couldn't read saved games:", e);
        setError("Couldn't read saved games (see console).");
        setGames([]);
      });

  const refreshPaused = () =>
    listPaused()
      .then(setPaused)
      .catch((e) => console.error("Couldn't read paused games:", e));

  useEffect(() => {
    refresh();
    refreshPaused();
  }, []);

  const togglePin = async (g: PausedGame) => {
    try {
      await setPinned(g.id, !g.pinned);
    } catch (e) {
      console.error(e);
    }
    refreshPaused();
  };

  // Giving up a paused game counts as a loss by abandonment
  const abandon = async (g: PausedGame) => {
    setConfirmAbandon(null);
    try {
      await saveGame(abandonedGame(g));
      await deletePaused(g.id);
    } catch (e) {
      console.error(e);
    }
    refreshPaused();
    refresh();
  };

  return (
    <div className="menu">
      <h1>Chess Learning App</h1>
      <div className="menu-grid">
        <button className="menu-card primary" onClick={onPlay}>
          <span className="menu-title">Play vs Stockfish</span>
          <span className="menu-sub">Choose strength, time control and options</span>
        </button>
        <button className="menu-card" onClick={onGuide}>
          <span className="menu-title">Openings guide</span>
          <span className="menu-sub">Learn lines, ideas and plans</span>
        </button>
        <button className="menu-card" onClick={onFlashcards}>
          <span className="menu-title">Flashcards</span>
          <span className="menu-sub">Drill your lines from memory</span>
        </button>
        <button className="menu-card" onClick={onRepertoires}>
          <span className="menu-title">Repertoire builder</span>
          <span className="menu-sub">Build full opening repertoires with notes</span>
        </button>
        <button className="menu-card" onClick={onPractice}>
          <span className="menu-title">Practice</span>
          <span className="menu-sub">Endgames, converting, winning material</span>
        </button>
        <button className="menu-card" onClick={onAnalysis}>
          <span className="menu-title">Analysis</span>
          <span className="menu-sub">Explore positions with the engine</span>
        </button>
        <button className="menu-card" onClick={onSettings}>
          <span className="menu-title">Settings</span>
          <span className="menu-sub">Interface size and more</span>
        </button>
        <button className="menu-card" onClick={onStats}>
          <span className="menu-title">Stats</span>
          <span className="menu-sub">Results, performance polygon, trends</span>
        </button>
      </div>

      {paused.length > 0 && (
        <div className="recent">
          <h2>Paused games</h2>
          <div className="game-log">
            {paused.map((g) => (
              <div className="log-row" key={g.id}>
                <div className="log-main static">
                  <span className="result-pill pause">⏸</span>
                  <TimeIcon baseSec={g.config.timeControl.baseSec} incSec={g.config.timeControl.incSec} />
                  <span className="log-meta">
                    {g.playerColor === "white" ? "White" : "Black"} · vs{" "}
                    {g.config.elo >= MAX_ELO ? "full strength" : g.config.elo} ·{" "}
                    {Math.ceil(g.moves.length / 2)} moves · paused{" "}
                    {new Date(g.savedAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="note">🔒 position hidden</span>
                </div>
                <button
                  className={`pin-btn ${g.pinned ? "on" : ""}`}
                  title={g.pinned ? "Pinned: it won't be pushed out" : "Pin so it isn't pushed out"}
                  onClick={() => togglePin(g)}
                >
                  📌
                </button>
                <button className="log-review" onClick={() => onResume(g)}>
                  Resume
                </button>
                {confirmAbandon === g.id ? (
                  <button className="danger" title="Counts as a loss" onClick={() => abandon(g)}>
                    Give up?
                  </button>
                ) : (
                  <button
                    className="log-delete"
                    title="Give up this game (counts as a loss)"
                    onClick={() => setConfirmAbandon(g.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="recent">
        <div className="recent-head">
          <h2>Recent games</h2>
          {games && games.length > 0 && (
            <button className="link-btn" onClick={onViewAllGames}>
              View all ({games.length})
            </button>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
        {games === null && <p className="note">Loading...</p>}
        {games?.length === 0 && !error && (
          <p className="note">No games yet. Finish a game and it will appear here.</p>
        )}
        {games && (
          <GameLog
            games={games.slice(0, RECENT_COUNT)}
            onOpen={onOpenGame}
            onReview={onReviewGame}
            onChanged={refresh}
          />
        )}
      </div>
    </div>
  );
}
