import { useEffect, useMemo, useState } from "react";
import { BackButton } from "../components/BackButton";
import { GameLog } from "../components/GameLog";
import {
  cachedIndex,
  isEmptyQuery,
  loadIndex,
  matchesQuery,
  needsIndex,
  parseQuery,
} from "../gameSearch";
import { listGames, listPractice, type GameListItem } from "../storage/games";

interface AllGamesProps {
  practice?: boolean; // the practice list instead of real games
  onBack: () => void;
  onOpenGame: (fileName: string) => void;
  onReviewGame: (fileName: string) => void;
}

const PAGE = 100;

export function AllGames({ practice = false, onBack, onOpenGame, onReviewGame }: AllGamesProps) {
  const [games, setGames] = useState<GameListItem[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [version, setVersion] = useState(0); // bumps as games get indexed
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reload = () =>
    (practice ? listPractice() : listGames())
      .then(setGames)
      .catch((e) => {
        console.error("Couldn't read the games:", e);
        setError("Couldn't read the games (see console).");
        setGames([]);
      });

  useEffect(() => {
    reload();
  }, []);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const wantsIndex = needsIndex(parsed);

  // Load the moves of every game the first time you search by moves or text
  useEffect(() => {
    if (!games || !wantsIndex) {
      setProgress(null);
      return;
    }
    const todo = games.filter((g) => !cachedIndex(g.fileName));
    if (todo.length === 0) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      for (let i = 0; i < todo.length; i++) {
        if (cancelled) return;
        await loadIndex(todo[i].fileName);
        if ((i + 1) % 15 === 0 || i === todo.length - 1) {
          setProgress({ done: i + 1, total: todo.length });
          setVersion((v) => v + 1);
          await new Promise((r) => setTimeout(r)); // let the screen update
        }
      }
      if (!cancelled) setProgress(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [games, wantsIndex]);

  useEffect(() => setVisible(PAGE), [query]);

  const results = useMemo(() => {
    if (!games) return [];
    if (isEmptyQuery(parsed)) return games;
    return games.filter((g) => matchesQuery(g, cachedIndex(g.fileName), parsed));
  }, [games, parsed, version]);

  const noun = practice ? "practice games" : "games";

  return (
    <div className="menu all-games">
      <BackButton onClick={onBack} />
      <div className="recent-head">
        <h1>{practice ? "All practice" : "All games"}</h1>
      </div>

      <input
        className="opening-search big"
        autoFocus
        placeholder="Search by date, time, white / black, win / loss, or moves"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="note search-help">
        Try: <code>win black</code> · <code>nov 3</code> · <code>15:30</code> · <code>1 d4</code> ·{" "}
        <code>2 ... e6</code> · <code>1 e4 e5 2 Nf3</code> · <code>19 ... Qxa4+</code> · <code>Qa4</code>{" "}
        (no move number: any move, and Qa4 also finds Qxa4)
      </div>

      {error && <p className="error-text">{error}</p>}
      {games === null && <p className="note">Loading...</p>}
      {progress && (
        <p className="note">
          Reading moves... {progress.done} of {progress.total} games
        </p>
      )}
      {games && (
        <p className="note">
          {results.length.toLocaleString()} {isEmptyQuery(parsed) ? noun : `matching ${noun}`}
          {games.length !== results.length && ` (of ${games.length.toLocaleString()})`}
        </p>
      )}

      <div className="recent">
        <GameLog
          games={results.slice(0, visible)}
          onOpen={onOpenGame}
          onReview={onReviewGame}
          onChanged={reload}
        />
        {results.length > visible && (
          <button className="show-more" onClick={() => setVisible((v) => v + PAGE)}>
            Show more ({(results.length - visible).toLocaleString()} left)
          </button>
        )}
        {games && results.length === 0 && !progress && <p className="note">No matches.</p>}
      </div>
    </div>
  );
}
