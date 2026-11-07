import { useEffect, useState } from "react";
import { BackButton } from "../components/BackButton";
import { GameLog } from "../components/GameLog";
import { listPractice, type GameListItem } from "../storage/games";

interface PracticeProps {
  onHome: () => void;
  onPlay: () => void; // go to the practice setup
  onOpenGame: (fileName: string) => void;
  onReviewGame: (fileName: string) => void;
  onViewAll: () => void;
}

const RECENT = 15;

/** The practice menu: a second main menu, like the one for playing. */
export function Practice({ onHome, onPlay, onOpenGame, onReviewGame, onViewAll }: PracticeProps) {
  const [games, setGames] = useState<GameListItem[] | null>(null);

  const reload = () =>
    listPractice()
      .then(setGames)
      .catch((e) => {
        console.error("Couldn't read practice games:", e);
        setGames([]);
      });

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="menu practice-screen">
      <BackButton onClick={onHome} />
      <h1>Practice</h1>
      <div className="menu-grid">
        <button className="menu-card primary" onClick={onPlay}>
          <span className="menu-title">Start practice</span>
          <span className="menu-sub">Choose what to practise, the bot's strength and helpers</span>
        </button>
      </div>
      <div className="note practice-intro">
        You're dropped into a position built for the skill you pick: endgames, converting an
        advantage, winning material, defending. Hints, takebacks and Helped mode work as usual,
        and every practice game can be reviewed.
      </div>

      <div className="recent">
        <div className="recent-head">
          <h2>Recent practice</h2>
          {games && games.length > 0 && (
            <button className="link-btn" onClick={onViewAll}>
              View all ({games.length})
            </button>
          )}
        </div>
        {games === null && <p className="note">Loading...</p>}
        {games?.length === 0 && (
          <p className="note">No practice yet. Finish a practice game and it will appear here.</p>
        )}
        {games && (
          <GameLog
            games={games.slice(0, RECENT)}
            onOpen={onOpenGame}
            onReview={onReviewGame}
            onChanged={reload}
          />
        )}
      </div>
    </div>
  );
}
