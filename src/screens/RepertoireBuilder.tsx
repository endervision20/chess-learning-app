import { useEffect, useMemo, useState } from "react";
import type { Key } from "chessground/types";

import { BackButton } from "../components/BackButton";
import { Board } from "../components/Board";
import { MoveList, type MoveMark } from "../components/MoveList";
import { destsFromFen, otherColor, pvToSan, replay } from "../chessLogic";
import { moveToUci, ucisToMoves } from "../lineTools";
import { openingAt } from "../openings";
import {
  addLinesFromText,
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
  onBack: () => void;
}

/** Where lines are made: play moves on the board, branch freely, write notes, or paste many lines at once. */
export function RepertoireBuilder({ rep, change, saveError, startLine, onBack }: BuilderProps) {
  // `line` is the line shown in the move list; `ply` is how far along it we are.
  const [line, setLine] = useState<string[]>(() => extendMain(rep.moves, startLine));
  const [ply, setPly] = useState(startLine.length);
  const [orientation, setOrientation] = useState<Color>(rep.side);
  const [resync, setResync] = useState(0);
  const [confirm, setConfirm] = useState<string[] | null>(null); // a move (path) waiting to be deleted
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string[]>([]);

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
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (confirm) return;
      if (e.key === "ArrowLeft") goTo(ply - 1);
      else if (e.key === "ArrowRight") goTo(ply + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") goTo(0);
      else if (e.key === "ArrowDown" || e.key === "End") goTo(line.length);
      else if (e.key.toLowerCase() === "f") flip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, line.length, confirm]);

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

  const addBulk = () => {
    try {
      const before = countMoves(rep.moves);
      const res = addLinesFromText(rep.moves, bulkText);
      if (res.addedLines > 0) {
        change((r) => ({ ...r, moves: res.moves }));
        setLine(extendMain(res.moves, curPath));
      }
      const newMoves = countMoves(res.moves) - before;
      setBulkMsg([
        res.addedLines > 0
          ? `Added ${res.addedLines} line${res.addedLines === 1 ? "" : "s"} (${newMoves} new move${newMoves === 1 ? "" : "s"}; moves you already had are shared).`
          : "Nothing was added.",
        ...res.errors,
      ]);
      if (res.errors.length === 0 && res.addedLines > 0) setBulkText("");
    } catch (e) {
      setBulkMsg([e instanceof Error ? e.message : "Couldn't read that."]);
    }
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

      <div className="side-panel wide">
        <div className="status">
          <span>Editing: {rep.name || "Untitled repertoire"}</span>
          <span className="badges">
            <span className="badge">{rep.side === "white" ? "White" : "Black"}</span>
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
              <>
                <input
                  className="opening-search"
                  value={rep.name}
                  placeholder="Repertoire name"
                  onChange={(e) => change((r) => ({ ...r, name: e.target.value }))}
                />
                <div className="field-label">Description of this repertoire</div>
                <textarea
                  className="paste-box"
                  rows={4}
                  placeholder="What is this repertoire about? Plans, ideas, who it suits..."
                  value={rep.description}
                  onChange={(e) => change((r) => ({ ...r, description: e.target.value }))}
                />
              </>
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
          onSelect={goTo}
          marks={marks}
          names={{
            white: rep.side === "white" ? "You" : "Opponent",
            black: rep.side === "black" ? "You" : "Opponent",
          }}
        />

        <div className="add-guide">
          <button onClick={() => setBulkOpen((v) => !v)}>
            {bulkOpen ? "Hide: add several lines at once" : "Add several lines at once"}
          </button>
          {bulkOpen && (
            <>
              <div className="note">
                Paste one line of moves per row, from the starting position (for example “1. e4 c5 2. Nf3 d6 3. d4
                cxd4”), or paste a PGN with variations. Every row becomes a line; moves you already have are
                shared.
              </div>
              <textarea
                className="paste-box"
                rows={7}
                placeholder={"1. e4 e5 2. Nf3 Nc6 3. Bb5 a6\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5\n1. d4 d5 2. c4 e6"}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <div className="buttons">
                <button className="primary" disabled={!bulkText.trim()} onClick={addBulk}>
                  Add lines
                </button>
              </div>
              {bulkMsg.map((m, i) => (
                <div key={i} className={i === 0 ? "note" : "error-text"}>
                  {m}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="buttons">
          <button onClick={flip}>Flip (F)</button>
          {ply > 0 && <button onClick={() => setConfirm(curPath)}>Delete this move</button>}
          <button className="primary" onClick={onBack}>
            Done
          </button>
        </div>
      </div>

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
