import { useEffect, useMemo, useState } from "react";
import type { Key } from "chessground/types";

import { BackButton } from "../components/BackButton";
import { Board } from "../components/Board";
import { DotsMenu } from "../components/DotsMenu";
import { MoveList, type MoveMark } from "../components/MoveList";
import { MoveStrip } from "../components/MoveStrip";
import { destsFromFen, otherColor, pvToSan, replay } from "../chessLogic";
import { moveToUci, ucisToMoves } from "../lineTools";
import { openingAt } from "../openings";
import {
  addMove,
  childrenAt,
  countLines,
  countMoves,
  extendMain,
  isPrefix,
  nodeAt,
  playableLines,
  removeAt,
  setName,
  setNote,
  shiftAt,
} from "../repertoireLogic";
import type { Color, PromotionRole, Repertoire } from "../types";

interface BuilderProps {
  rep: Repertoire;
  change: (fn: (r: Repertoire) => Repertoire) => void;
  saveError: boolean;
  startLine: string[]; // the position to open at (and the line shown from it)
  onEditDetails: () => void; // opens the name / description dialog
  onBack: () => void;
}

/** Where lines are made: play moves on the board, branch freely, write notes, or paste many lines at once. */
export function RepertoireBuilder({ rep, change, saveError, startLine, onEditDetails, onBack }: BuilderProps) {
  // `line` is the line shown in the move list; `ply` is how far along it we are.
  const [line, setLine] = useState<string[]>(() => extendMain(rep.moves, startLine));
  const [ply, setPly] = useState(startLine.length);
  const [orientation, setOrientation] = useState<Color>(rep.side);
  const [resync, setResync] = useState(0);
  const [confirm, setConfirm] = useState<string[] | null>(null); // a move (path) waiting to be deleted
  const [picking, setPicking] = useState(false); // the "which move?" pop-up

  const curPath = useMemo(() => line.slice(0, ply), [line, ply]);
  const moves = useMemo(() => ucisToMoves(line), [line]);
  const built = useMemo(() => replay(moves), [moves]);
  const here = built.plies[ply];
  const fens = useMemo(() => built.plies.map((p) => p.fen), [built]);
  const opening = useMemo(() => openingAt(fens, ply), [fens, ply]);
  const children = childrenAt(rep.moves, curPath) ?? [];
  const node = nodeAt(rep.moves, curPath);
  const dests = useMemo(() => destsFromFen(here.fen), [here.fen]);
  const lastMove = ply > 0 ? [moves[ply - 1].from, moves[ply - 1].to] : undefined;
  const myTurn = here.turn === rep.side;
  const lineCount = playableLines(rep.moves, rep.side).length;

  const marks = useMemo(() => {
    const out: (MoveMark | undefined)[] = [];
    let list = rep.moves;
    for (const u of line) {
      const n = list.find((x) => x.uci === u);
      if (!n) break;
      out.push(n.note.trim() ? { text: "📝", cls: "notemark", title: n.note } : undefined);
      list = n.children;
    }
    return out;
  }, [rep.moves, line]);

  const goTo = (i: number) => setPly(Math.max(0, Math.min(line.length, i)));
  const flip = () => setOrientation((o) => otherColor(o));

  const selectChild = (uci: string) => {
    if (line[ply] !== uci) setLine(extendMain(rep.moves, [...curPath, uci]));
    setPly(ply + 1);
    setPicking(false);
  };

  // Stepping forward where the repertoire branches asks which move to follow
  const forward = () => {
    if (children.length > 1) setPicking(true);
    else goTo(ply + 1);
  };
  const select = (i: number) => (i === ply + 1 ? forward() : goTo(i));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (confirm || picking) return;
      if (e.key === "ArrowLeft") goTo(ply - 1);
      else if (e.key === "ArrowRight") forward();
      else if (e.key === "ArrowUp" || e.key === "Home") goTo(0);
      else if (e.key === "ArrowDown" || e.key === "End") goTo(line.length);
      else if (e.key.toLowerCase() === "f") flip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, line.length, confirm, picking, children.length]);

  const handleMove = (from: Key, to: Key, promotion?: PromotionRole) => {
    if (!dests.get(from)?.includes(to)) {
      setResync((n) => n + 1);
      return;
    }
    const uci = moveToUci({ from, to, promotion });
    if (line[ply] === uci) {
      setPly(ply + 1);
      return;
    }
    const nextMoves = addMove(rep.moves, curPath, uci);
    if (nextMoves !== rep.moves) change((r) => ({ ...r, moves: nextMoves }));
    setLine(extendMain(nextMoves, [...curPath, uci]));
    setPly(ply + 1);
  };

  const deleteMove = (path: string[]) => {
    const nextMoves = removeAt(rep.moves, path);
    change((r) => ({ ...r, moves: nextMoves }));
    const keep = isPrefix(path, curPath) ? path.slice(0, -1) : curPath;
    setLine(extendMain(nextMoves, keep));
    setPly(keep.length);
    setConfirm(null);
  };

  const shift = (uci: string, dir: -1 | 1) => {
    const nextMoves = shiftAt(rep.moves, [...curPath, uci], dir);
    change((r) => ({ ...r, moves: nextMoves }));
    setLine(extendMain(nextMoves, curPath));
  };

  const nextSans = children.map((c) => pvToSan(here.fen, [c.uci], 1));
  const heading =
    children.length === 0
      ? ply === 0
        ? "No moves yet"
        : "End of this line"
      : myTurn
      ? "Your moves here"
      : "Opponent's replies";
  const isLeaf = ply > 0 && !!node && node.children.length === 0;

  return (
    <div className="game-layout">
      <BackButton onClick={onBack} label="Done" />
      <MoveStrip sans={built.sans} viewIndex={ply} onSelect={select} />
      <div className="board-col">
        <div className="bar-spacer" />
        <Board
          fen={here.fen}
          orientation={orientation}
          turnColor={here.turn}
          playerColor={here.turn}
          interactive
          premove={false}
          dests={dests}
          lastMove={lastMove}
          check={here.check ? here.turn : false}
          resync={resync}
          onMove={handleMove}
        />
        <div className="bar-spacer" />
      </div>

      <div className="side-panel wide game-panel">
        <div className="status">
          <span className="quiet">Editing: {rep.name || "Untitled repertoire"}</span>
          <span className="badges">
            <span className="badge">{rep.side === "white" ? "White" : "Black"}</span>
            <DotsMenu items={[{ label: "Edit name / description", onClick: onEditDetails }]} />
          </span>
        </div>
        <div className="header-note">
          {lineCount} line{lineCount === 1 ? "" : "s"} · {countMoves(rep.moves)} moves · {countLines(rep.moves)} branch
          ends. Changes are saved as you go.
          {saveError && <span className="error-text"> Couldn't save (see console).</span>}
        </div>

        <div className="opening-label">
          <div className="opening-name">
            {opening ? (
              <>
                <span className="eco">{opening.eco}</span> {opening.name}
              </>
            ) : (
              "Starting position"
            )}
          </div>
        </div>

        <div className="guide-notes">
          <div className="line-editor">
            {ply === 0 ? (
              <div className="note">
                Play a first move on the board to start a line. To rename this repertoire or write a description, use the ⋯ menu.
              </div>
            ) : (
              <>
                <div className="field-label">
                  Note on {Math.ceil(ply / 2)}
                  {ply % 2 === 1 ? "." : "..."} {built.sans[ply - 1]}
                </div>
                <textarea
                  className="paste-box"
                  rows={4}
                  placeholder="Write a note for this move..."
                  value={node?.note ?? ""}
                  onChange={(e) =>
                    change((r) => ({ ...r, moves: setNote(r.moves, curPath, e.target.value) }))
                  }
                />
                {isLeaf && (
                  <>
                    <div className="field-label">Name of the line that ends here (optional)</div>
                    <input
                      className="opening-search"
                      value={node?.name ?? ""}
                      placeholder="e.g. Najdorf, English Attack"
                      onChange={(e) =>
                        change((r) => ({ ...r, moves: setName(r.moves, curPath, e.target.value) }))
                      }
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="next-moves">
          <div className="guide-ideas-title">{heading}</div>
          {children.map((c, i) => (
            <div className="next-move-row" key={c.uci}>
              <button className="next-move-btn" onClick={() => selectChild(c.uci)}>
                <span className="next-san">{nextSans[i]}</span>
                {c.note.trim() && <span className="mark notemark">📝</span>}
                <span className="note">
                  {countLines([c])} branch{countLines([c]) === 1 ? "" : "es"}
                </span>
                {i === 0 && children.length > 1 && <span className="guide-badge">main</span>}
              </button>
              {i > 0 && (
                <button title="Move up (the first move is the main line)" onClick={() => shift(c.uci, -1)}>
                  ↑
                </button>
              )}
              {i < children.length - 1 && (
                <button title="Move down" onClick={() => shift(c.uci, 1)}>
                  ↓
                </button>
              )}
              <button
                className="log-delete"
                title="Delete this move and everything after it"
                onClick={() => setConfirm([...curPath, c.uci])}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="note">
            {myTurn ? "Play your move" : "Play the opponent's reply"} on the board to add it. Playing a
            different move from the same position starts a new branch (a new line).
          </div>
        </div>

        <MoveList
          sans={built.sans}
          moves={moves}
          viewIndex={ply}
          timed={false}
          onSelect={select}
          marks={marks}
          names={{
            white: rep.side === "white" ? "You" : "Opponent",
            black: rep.side === "black" ? "You" : "Opponent",
          }}
        />

        <div className="buttons">
          <button onClick={flip}>Flip (F)</button>
          {ply > 0 && <button onClick={() => setConfirm(curPath)}>Delete this move</button>}
          <button className="primary" onClick={onBack}>
            Done
          </button>
        </div>
      </div>

      {picking && (
        <div className="guide-overlay" onClick={() => setPicking(false)}>
          <div className="guide-overlay-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-text">Which move?</div>
            <div className="pick-list">
              {children.map((c, i) => (
                <button key={c.uci} onClick={() => selectChild(c.uci)}>
                  <span className="next-san">{nextSans[i]}</span>
                  {c.note.trim() && <span className="mark notemark">📝</span>}
                  <span className="note">
                    {countLines([c])} branch{countLines([c]) === 1 ? "" : "es"}
                  </span>
                  {i === 0 && <span className="guide-badge">main</span>}
                </button>
              ))}
            </div>
            <div className="confirm-buttons">
              <button onClick={() => setPicking(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="guide-overlay" onClick={() => setConfirm(null)}>
          <div className="guide-overlay-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-text">Delete this move and every line that follows it?</div>
            <div className="confirm-buttons">
              <button className="danger" onClick={() => deleteMove(confirm)}>
                Delete
              </button>
              <button onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
