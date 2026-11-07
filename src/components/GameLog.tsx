import { useEffect, useRef, useState } from "react";
import { MiniBoard } from "./MiniBoard";
import { TimeIcon } from "./TimeIcon";
import { replay } from "../chessLogic";
import { forgetIndex } from "../gameSearch";
import { deleteGame, loadGame, type GameListItem } from "../storage/games";
import { loadReview } from "../storage/reviews";
import { PRACTICE_LABEL, type Color } from "../types";

const RESULT_LETTER = { win: "W", loss: "L", draw: "D" } as const;
const PREVIEW_DELAY_MS = 1000;

interface Accuracy {
  white: number;
  black: number;
}

interface Preview {
  fileName: string;
  fen: string;
  orientation: Color;
  moves: number;
}

// Small badges for what was used: amber for assists (↩ takebacks, 💡 hints),
// green for Helped mode (⚠ warnings, 📖 book notices, ↶ free takebacks)
function badgesFor(g: GameListItem) {
  const assisted = [
    { icon: "↩", count: g.assists.takebacks, label: "takeback" },
    { icon: "💡", count: g.assists.hintButton, label: "hint" },
  ].filter((i) => i.count > 0);
  const helps = [
    { icon: "⚠", count: g.help.warnings, label: "warning" },
    { icon: "📖", count: g.help.bookHints, label: "book notice" },
    { icon: "↶", count: g.help.freeTakebacks, label: "free takeback" },
  ].filter((i) => i.count > 0);

  const out = [];
  if (g.helped) {
    out.push(
      <span className="badge helped" key="helped" title="Helped mode was on">
        Helped
      </span>
    );
  }
  for (const i of helps) {
    out.push(
      <span className="badge helped" key={i.label} title={`${i.label} ×${i.count}`}>
        {i.icon} {i.count}
      </span>
    );
  }
  if (assisted.length === 0 && g.assisted) {
    out.push(
      <span className="badge" key="old" title="Assisted (details weren't recorded for this game)">
        ?
      </span>
    );
  }
  for (const i of assisted) {
    out.push(
      <span className="badge" key={i.label} title={`${i.label} ×${i.count}`}>
        {i.icon} {i.count}
      </span>
    );
  }
  return out;
}

interface GameLogProps {
  games: GameListItem[];
  onOpen: (fileName: string) => void;
  onReview: (fileName: string) => void;
  onChanged: () => void; // a game was deleted: reload the list
}

/** The rows of finished games (real games or practice), used by the menu, Practice and the full lists. */
export function GameLog({ games, onOpen, onReview, onChanged }: GameLogProps) {
  const [accuracy, setAccuracy] = useState<Record<string, Accuracy>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const previewCache = useRef(new Map<string, Preview>());
  const checked = useRef(new Set<string>());

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Which of these games have been reviewed? (A saved review has the accuracy of both sides.)
  useEffect(() => {
    const todo = games.filter((g) => !checked.current.has(g.fileName));
    if (todo.length === 0) return;
    let alive = true;
    Promise.all(
      todo.map(async (g) => [g.fileName, (await loadReview(g.fileName))?.accuracy] as const)
    ).then((pairs) => {
      if (!alive) return;
      const found: Record<string, Accuracy> = {};
      for (const [name, acc] of pairs) {
        checked.current.add(name);
        if (acc) found[name] = acc;
      }
      setAccuracy((a) => ({ ...a, ...found }));
    });
    return () => {
      alive = false;
    };
  }, [games]);

  const remove = async (fileName: string) => {
    setConfirmDelete(null);
    try {
      await deleteGame(fileName);
      forgetIndex(fileName);
    } catch (e) {
      console.error(e);
    }
    onChanged();
  };

  // Hover a game for a second to see how it ended
  const startPreview = (fileName: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const cached = previewCache.current.get(fileName);
      if (cached) {
        setPreview(cached);
        return;
      }
      try {
        const game = await loadGame(fileName);
        const { plies } = replay(game.moves, game.startFen);
        const p: Preview = {
          fileName,
          fen: plies[plies.length - 1].fen,
          orientation: game.playerColor,
          moves: game.moves.length,
        };
        previewCache.current.set(fileName, p);
        setPreview(p);
      } catch (e) {
        console.error("Couldn't load the game preview:", e);
      }
    }, PREVIEW_DELAY_MS);
  };
  const stopPreview = () => {
    window.clearTimeout(timer.current);
    setPreview(null);
  };

  return (
    <div className="game-log">
      {games.map((g) => {
        const acc = accuracy[g.fileName];
        const mine = acc ? (g.color === "white" ? acc.white : acc.black) : undefined;
        const bot = acc ? (g.color === "white" ? acc.black : acc.white) : undefined;
        return (
          <div
            className="log-row"
            key={g.fileName}
            onMouseEnter={() => startPreview(g.fileName)}
            onMouseLeave={stopPreview}
          >
            <button className="log-main" onClick={() => onOpen(g.fileName)}>
              <span className={`result-pill ${g.result}`}>{RESULT_LETTER[g.result]}</span>
              {g.practice ? (
                <span className="practice-chip">{PRACTICE_LABEL[g.practice]}</span>
              ) : (
                <TimeIcon baseSec={g.tc?.baseSec ?? null} incSec={g.tc?.incSec ?? 0} />
              )}
              <span className="log-meta">
                {g.color === "white" ? "White" : "Black"} · vs{" "}
                {g.elo === null ? "full strength" : g.elo} ·{" "}
                {g.date.toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {badgesFor(g)}
            </button>

            {acc ? (
              <button
                className="log-acc"
                title="Open the review (accuracy: you on top, Stockfish below)"
                onClick={() => onReview(g.fileName)}
              >
                <span className="acc-mine">{mine!.toFixed(1)}</span>
                <span className="acc-bot">{bot!.toFixed(1)}</span>
              </button>
            ) : (
              <button className="log-review" title="Review this game" onClick={() => onReview(g.fileName)}>
                Review
              </button>
            )}

            {confirmDelete === g.fileName ? (
              <button className="danger" onClick={() => remove(g.fileName)}>
                Delete?
              </button>
            ) : (
              <button className="log-delete" title="Delete game" onClick={() => setConfirmDelete(g.fileName)}>
                ✕
              </button>
            )}

            {preview?.fileName === g.fileName && (
              <div className="log-preview">
                <MiniBoard fen={preview.fen} orientation={preview.orientation} size={220} />
                <div className="note">Final position · {preview.moves} moves</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
