import { useEffect, useRef } from "react";
import { formatClock, formatSpent } from "../chessLogic";
import type { Ghost } from "../takebacks";
import type { PlayedMove } from "../types";

export interface MoveMark {
  text: string;
  cls?: string;
  title?: string;
  more?: MoveMark[]; // further marks on the same move
}

interface MoveListProps {
  sans: string[];
  moves: PlayedMove[];
  viewIndex: number; // 0 = start position, N = after move N
  timed: boolean;
  onSelect: (index: number) => void;
  marks?: (MoveMark | undefined)[]; // small icons after each move (hints, helper, review grades)
  ghosts?: (Ghost[] | undefined)[]; // taken-back moves, per ply, shown struck out above the real move
  notes?: string[]; // extra lines under the list
  names?: { white: string; black: string }; // who plays each colour (default: "White" / "Black")
}

export function MoveList({
  sans,
  moves,
  viewIndex,
  timed,
  onSelect,
  marks,
  ghosts,
  notes,
  names,
}: MoveListProps) {
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Scroll only the move list itself. scrollIntoView() also scrolls the whole page, which dragged the
    // screen down to the move history after every move.
    const el = activeRef.current;
    const box = el?.closest(".move-list") as HTMLElement | null;
    if (!el || !box) return;
    const e = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (e.top < b.top) box.scrollTop -= b.top - e.top;
    else if (e.bottom > b.bottom) box.scrollTop += e.bottom - b.bottom;
  }, [viewIndex, sans.length]);

  const renderMarks = (mark?: MoveMark) =>
    mark
      ? [mark, ...(mark.more ?? [])].map((mk, k) => (
          <span key={k} className={`mark ${mk.cls ?? ""}`} title={mk.title}>
            {mk.text}
          </span>
        ))
      : null;

  const cell = (i: number) => {
    if (i >= sans.length) return <span className="move-cell empty" />;
    const m = moves[i];
    const active = viewIndex === i + 1;
    return (
      <span
        ref={active ? activeRef : undefined}
        className={`move-cell ${active ? "active" : ""}`}
        onClick={() => onSelect(i + 1)}
        title={
          timed && m.clockAfterMs != null
            ? `Clock after this move: ${formatClock(m.clockAfterMs)}`
            : undefined
        }
      >
        <span className="san">
          {sans[i]}
          {renderMarks(marks?.[i])}
        </span>
        {m.spentMs !== undefined && (
          <span className="spent">{formatSpent(m.spentMs)}</span>
        )}
      </span>
    );
  };

  const ghostCell = (g?: Ghost) => {
    if (!g) return <span className="move-cell empty" />;
    return (
      <span
        className={`move-cell ghost ${g.free ? "free" : ""}`}
        title={g.free ? "Taken back (free, from Helped mode)" : "Taken back (counts as assisted)"}
      >
        <span className="san">
          <s className="tb-removed">{g.san}</s>
          <span className="mark tbmark">{g.free ? "↶" : "↩"}</span>
        </span>
      </span>
    );
  };

  const headCell = (color: "white" | "black") => {
    const name = names?.[color] ?? (color === "white" ? "White" : "Black");
    return (
      <span className="move-cell head" title={`${name} plays ${color === "white" ? "White" : "Black"}`}>
        <span className={`side-dot ${color}`} />
        <span className="head-name">{name}</span>
      </span>
    );
  };

  const rowCount = Math.ceil(Math.max(sans.length, ghosts?.length ?? 0) / 2);
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const gw = ghosts?.[2 * i] ?? [];
    const gb = ghosts?.[2 * i + 1] ?? [];
    const depth = Math.max(gw.length, gb.length);
    for (let d = 0; d < depth; d++) {
      rows.push(
        <div className="move-row ghost-row" key={`g${i}-${d}`}>
          <span className="move-num" />
          {ghostCell(gw[d])}
          {ghostCell(gb[d])}
        </div>
      );
    }
    rows.push(
      <div className="move-row" key={i}>
        <span className="move-num">{i + 1}.</span>
        {cell(2 * i)}
        {cell(2 * i + 1)}
      </div>
    );
  }

  return (
    <div className="move-list-wrap">
      <div className="move-list">
        <div className="move-row move-head">
          <span className="move-num" />
          {headCell("white")}
          {headCell("black")}
        </div>
        {rows}
      </div>
      {notes && notes.length > 0 && (
        <div className="move-notes">
          {notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}
      <div className="nav-buttons">
        <button onClick={() => onSelect(0)} disabled={viewIndex === 0} title="Start">⏮</button>
        <button onClick={() => onSelect(viewIndex - 1)} disabled={viewIndex === 0} title="Back">◀</button>
        <button onClick={() => onSelect(viewIndex + 1)} disabled={viewIndex === sans.length} title="Forward">▶</button>
        <button onClick={() => onSelect(sans.length)} disabled={viewIndex === sans.length} title="End">⏭</button>
      </div>
    </div>
  );
}
