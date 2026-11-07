import { useEffect, useMemo, useState } from "react";
import type { Key } from "chessground/types";

import { BackButton } from "../components/BackButton";
import { Board } from "../components/Board";
import { MoveList, type MoveMark } from "../components/MoveList";
import { otherColor, pvToSan, replay } from "../chessLogic";
import { ucisToMoves } from "../lineTools";
import { openingAt } from "../openings";
import { childrenAt, nodeAt } from "../repertoireLogic";
import type { LineInfo } from "../repertoireLines";
import type { Color, Repertoire } from "../types";

const NO_DESTS = new Map<Key, Key[]>();

interface StudyProps {
  rep: Repertoire;
  line: LineInfo;
  onBack: () => void;
  onEdit: (ply: number) => void; // open this line in the builder at this move
  onPractise: (ucis: string[], name: string) => void;
}

/** Learn one line move by move (arrow keys or the buttons). */
export function RepertoireStudy({ rep, line, onBack, onEdit, onPractise }: StudyProps) {
  const ucis = line.ucis;
  const total = ucis.length;
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Color>(rep.side);

  const moves = useMemo(() => ucisToMoves(ucis), [ucis]);
  const built = useMemo(() => replay(moves), [moves]);
  const fens = useMemo(() => built.plies.map((p) => p.fen), [built]);
  const here = built.plies[ply];
  const last = ply > 0 ? moves[ply - 1] : undefined;
  const current = openingAt(fens, ply);

  const goTo = (i: number) => setPly(Math.max(0, Math.min(total, i)));
  const flip = () => setOrientation((o) => otherColor(o));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "ArrowLeft") goTo(ply - 1);
      else if (e.key === "ArrowRight") goTo(ply + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") goTo(0);
      else if (e.key === "ArrowDown" || e.key === "End") goTo(total);
      else if (e.key.toLowerCase() === "f") flip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, total]);

  const marks = useMemo<(MoveMark | undefined)[]>(
    () =>
      ucis.map((_, i) => {
        const text = nodeAt(rep.moves, ucis.slice(0, i + 1))?.note.trim();
        return text ? { text: "📝", cls: "notemark", title: text } : undefined;
      }),
    [rep.moves, ucis]
  );

  const note = ply > 0 ? nodeAt(rep.moves, ucis.slice(0, ply))?.note.trim() ?? "" : "";

  // other moves your repertoire has in the same position as the move just shown
  const others = useMemo(() => {
    if (ply === 0) return [];
    const siblings = childrenAt(rep.moves, ucis.slice(0, ply - 1)) ?? [];
    return siblings
      .filter((n) => n.uci !== ucis[ply - 1])
      .map((n) => pvToSan(built.plies[ply - 1].fen, [n.uci], 1));
  }, [rep.moves, ucis, ply, built]);

  const myMove = ply > 0 && (ply % 2 === 1 ? "white" : "black") === rep.side;

  return (
    <div className="game-layout">
      <BackButton onClick={onBack} />
      <div className="board-col">
        <div className="bar-spacer" />
        <Board
          fen={here.fen}
          orientation={orientation}
          turnColor={here.turn}
          playerColor="white"
          interactive={false}
          dests={NO_DESTS}
          lastMove={last ? [last.from, last.to] : undefined}
          check={here.check ? here.turn : false}
          resync={0}
          onMove={() => {}}
        />
        <div className="bar-spacer" />
      </div>

      <div className="side-panel wide">
        <div className="status">
          <span>{line.name}</span>
          <span className="badges">
            <span className="badge">{rep.side === "white" ? "White" : "Black"}</span>
          </span>
        </div>

        <div className="opening-label">
          <div className="opening-name">
            {current ? (
              <>
                <span className="eco">{current.eco}</span> {current.name}
              </>
            ) : (
              "Starting position"
            )}
          </div>
          <div className="book-state">{rep.name}</div>
        </div>

        <div className="guide-notes">
          {ply === 0 ? (
            <div className="guide-note">
              {rep.description.trim() ? (
                <span className="review-note-text">{rep.description}</span>
              ) : (
                <span className="note">Step through the line with ◀ ▶ or the arrow keys.</span>
              )}
            </div>
          ) : (
            <div className="guide-note">
              {ply > 0 && <div className="note">{myMove ? "Your move" : "Opponent's move"}</div>}
              {note ? (
                <span className="review-note-text">{note}</span>
              ) : (
                <span className="note">No note on this move.</span>
              )}
            </div>
          )}
          {others.length > 0 && (
            <div className="note">Also in this repertoire here: {others.join(", ")}</div>
          )}
        </div>

        <MoveList
          sans={built.sans}
          moves={moves}
          viewIndex={ply}
          timed={false}
          onSelect={goTo}
          marks={marks}
          names={{
            white: rep.side === "white" ? "You" : "Opponent",
            black: rep.side === "black" ? "You" : "Opponent",
          }}
        />

        <div className="buttons">
          <button className="primary" onClick={() => onPractise(ucis, line.name)}>
            Practise this line vs Stockfish
          </button>
          <button onClick={flip}>Flip (F)</button>
          <button onClick={() => onEdit(ply)} title="Open this line in the builder">
            Edit this line
          </button>
        </div>
      </div>
    </div>
  );
}
