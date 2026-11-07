import { useEffect, useMemo, useRef, useState } from "react";

import { BackButton } from "../components/BackButton";
import { Board } from "../components/Board";
import { EvalBar } from "../components/EvalBar";
import { MoveList } from "../components/MoveList";
import { PlayerBar } from "../components/PlayerBar";
import { analysisEngine } from "../engine/stockfish";
import { useEngineEval } from "../hooks/useEngineEval";
import {
  destsFromFen,
  getOutcome,
  materialInfo,
  otherColor,
  parseUciMove,
  pvToSan,
  replay,
  startPosition,
} from "../chessLogic";
import {
  MAX_ELO,
  type AnalysisInit,
  type Color,
  type PlayedMove,
  type PromotionRole,
} from "../types";
import type { Key } from "chessground/types";
import { live } from "../settings";
import { openingAt, openingsAlong } from "../openings";
import { AddToGuide } from "../components/AddToGuide";
import { importPgn, moveToUci } from "../lineTools";
import { assistMarks, joinMarks } from "../marks";
import { cleanNotes, noteMark, pathKey, type NoteMap } from "../notes";
import { saveGameNotes } from "../storage/games";
import { ghostsByPly, legacyNotes } from "../takebacks";

interface AnalysisProps {
  initial?: AnalysisInit;
  onHome: () => void; // goes back to wherever Analysis was opened from
}

export function Analysis({ initial, onHome }: AnalysisProps) {
  const game = initial?.game;
  const fileName = initial?.fileName;
  const editLine = initial?.editLine;

  const [moves, setMoves] = useState<PlayedMove[]>(initial?.moves ?? []);
  const [startFen, setStartFen] = useState<string | undefined>(game?.startFen);
  const [viewPly, setViewPly] = useState<number | null>(
    initial?.ply !== undefined && initial.ply < initial.moves.length ? initial.ply : null
  );
  const [orientation, setOrientation] = useState<Color>(
    initial?.orientation ?? game?.playerColor ?? "white"
  );
  const [engineOn, setEngineOn] = useState(true);
  const [lineCount, setLineCount] = useState(live.analysisLines);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const [fenError, setFenError] = useState("");
  const [resync, setResync] = useState(0);
  const [notes, setNotes] = useState<NoteMap>(() => ({
    ...(initial?.notes ?? {}),
    ...(game?.notes ?? {}),
  }));

  // ---- Position ----
  const { pos, plies, sans, keys } = useMemo(() => replay(moves, startFen), [moves, startFen]);
  const viewIndex = viewPly ?? moves.length;
  const viewing = viewIndex !== moves.length;
  const viewData = plies[viewIndex];
  const dests = useMemo(() => destsFromFen(viewData.fen), [viewData.fen]);
  const lastMove = useMemo(
    () =>
      viewIndex > 0
        ? [moves[viewIndex - 1].from, moves[viewIndex - 1].to]
        : undefined,
    [moves, viewIndex]
  );
  const material = materialInfo(viewData.fen);
  const opening = useMemo(
    () => openingAt(plies.map((p) => p.fen), viewIndex),
    [plies, viewIndex]
  );
  const fensAll = useMemo(() => plies.map((p) => p.fen), [plies]);
  const lineUcis = useMemo(
    () => moves.slice(0, viewIndex).map(moveToUci),
    [moves, viewIndex]
  );
  const allUcis = useMemo(() => moves.map(moveToUci), [moves]);
  const candidates = useMemo(
    () => openingsAlong(fensAll, viewIndex),
    [fensAll, viewIndex]
  );
  const finalOutcome = useMemo(() => getOutcome(pos, keys), [pos, keys]);

  // ---- Engine ----
  useEffect(() => {
    let alive = true;
    analysisEngine
      .init()
      .then(() => alive && setEngineReady(true))
      .catch((e) => {
        console.error("Engine failed to start:", e);
        if (alive) setEngineError(true);
      });
    return () => {
      alive = false;
      analysisEngine.stop();
    };
  }, []);

  const ev = useEngineEval({
    engine: analysisEngine,
    enabled: engineOn && engineReady,
    fen: viewData.fen,
    turn: viewData.turn,
    go: `depth ${live.analysisDepth}`,
    minDepth: live.analysisMinDepth,
    multiPv: lineCount,
  });

  const lineTexts = useMemo(
    () => (ev.linesFen ? ev.lines.map((l) => pvToSan(ev.linesFen!, l.pv)) : []),
    [ev.lines, ev.linesFen]
  );

  // ---- Notes (saved into the game's file when this is a saved game) ----
  const noteKey = pathKey(lineUcis);
  const noteText = notes[noteKey] ?? "";
  const firstNotes = useRef(true);
  useEffect(() => {
    if (firstNotes.current) {
      firstNotes.current = false;
      return;
    }
    if (!fileName) return;
    const t = setTimeout(() => {
      saveGameNotes(fileName, cleanNotes(notes)).catch((e) =>
        console.error("Couldn't save the notes:", e)
      );
    }, 500);
    return () => clearTimeout(t);
  }, [notes]);

  const noteHint = fileName
    ? "Saved with this game. You'll see it here, in the game review and in the guide if you add the line."
    : editLine
    ? "Press “Save changes” below to keep notes on your line."
    : "Not saved yet. Notes stay while this analysis is open and are saved if you add the line to the guide.";

  const moveLabel =
    viewIndex === 0
      ? "the starting position"
      : `${Math.ceil(viewIndex / 2)}${viewIndex % 2 === 1 ? "." : "..."} ${sans[viewIndex - 1]}`;

  // ---- Moves ----
  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(moves.length, i));
    setViewPly(clamped === moves.length ? null : clamped);
  };

  const addMove = (from: Key, to: Key, promotion?: PromotionRole) => {
    // Playing the move that's already next in the line just steps forward
    const next = moves[viewIndex];
    if (next && next.from === from && next.to === to && next.promotion === promotion) {
      goTo(viewIndex + 1);
      return;
    }
    // Otherwise the line continues from here, replacing anything after it
    setMoves([...moves.slice(0, viewIndex), { from, to, promotion }]);
    setViewPly(null);
  };

  const handleMove = (from: Key, to: Key, promotion?: PromotionRole) => {
    if (!dests.get(from)?.includes(to)) {
      setResync((n) => n + 1);
      return;
    }
    addMove(from, to, promotion);
  };

  const playLine = (uci: string | undefined) => {
    if (!uci) return;
    const m = parseUciMove(uci);
    handleMove(m.from, m.to, m.promotion);
  };

  // ---- Position setup ----
  const applyFen = () => {
    const text = fenInput.trim();
    if (!text) return;
    const looksLikeFen = /^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+\s+[wb]\b/.test(text);
    if (looksLikeFen) {
      try {
        startPosition(text);
      } catch {
        setFenError("That doesn't look like a valid position.");
        return;
      }
      setFenError("");
      setStartFen(text);
      setMoves([]);
      setViewPly(null);
      return;
    }
    try {
      const imported = importPgn(text);
      setStartFen(imported.startFen);
      setMoves(imported.moves);
      setViewPly(null);
      setFenError("");
    } catch (e) {
      setFenError(e instanceof Error ? e.message : "Couldn't read that PGN.");
    }
  };
  const reset = () => {
    setStartFen(undefined);
    setMoves([]);
    setViewPly(null);
    setFenInput("");
    setFenError("");
  };

  const flip = () => setOrientation((o) => otherColor(o));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "ArrowLeft") goTo(viewIndex - 1);
      else if (e.key === "ArrowRight") goTo(viewIndex + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") goTo(0);
      else if (e.key === "ArrowDown" || e.key === "End") goTo(moves.length);
      else if (e.key.toLowerCase() === "f") flip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewIndex, moves.length]);

  // ---- Text ----
  const header = game
    ? `${game.result === "win" ? "Win" : game.result === "loss" ? "Loss" : "Draw"} (${game.reason}) · vs ${
        game.botElo >= MAX_ELO ? "full strength" : game.botElo
      } · ${
        game.timeControl.baseSec > 0
          ? `${game.timeControl.baseSec / 60}+${game.timeControl.incSec}`
          : "untimed"
      }`
    : editLine
    ? `Editing: ${editLine.name}`
    : "Analysis board";

  let note = `${viewData.turn === "white" ? "White" : "Black"} to move`;
  if (!viewing && finalOutcome) {
    note =
      finalOutcome.winner === null
        ? `Draw by ${finalOutcome.reason}`
        : `${finalOutcome.winner === "white" ? "White" : "Black"} wins by ${finalOutcome.reason}`;
  } else if (viewing) {
    note = `Viewing move ${viewIndex} of ${moves.length}`;
  }

  const shown = engineOn ? ev.evalState : null;

  const botName = `Stockfish (${game && game.botElo < MAX_ELO ? game.botElo : "full strength"})`;
  const names = game
    ? {
        white: game.playerColor === "white" ? "You" : botName,
        black: game.playerColor === "black" ? "You" : botName,
      }
    : undefined;

  const bar = (c: Color) => (
    <PlayerBar
      name={names ? names[c] : c === "white" ? "White" : "Black"}
      captured={material[c].captured}
      diff={material[c].diff}
      clockMs={0}
      timed={false}
      active={viewData.turn === c}
    />
  );

  const marks = moves.map((m, i) => {
    const list = assistMarks(m);
    const nm = noteMark(notes, allUcis, i);
    if (nm) list.push(nm);
    return joinMarks(list);
  });

  return (
    <div className="game-layout">
      <BackButton onClick={onHome} />
      <div className="board-row">
        <EvalBar
          pct={shown?.pct ?? 50}
          label={shown?.label ?? "0.0"}
          orientation={orientation}
          settling={!ev.settled}
        />
        <div className="board-col">
          {bar(otherColor(orientation))}
          <Board
            fen={viewData.fen}
            orientation={orientation}
            turnColor={viewData.turn}
            playerColor={viewData.turn}
            interactive
            premove={false}
            dests={dests}
            lastMove={lastMove}
            check={viewData.check ? viewData.turn : false}
            resync={resync}
            onMove={handleMove}
          />
          {bar(orientation)}
        </div>
      </div>

      <div className="side-panel wide">
        <div className="status">{header}</div>
        <div className="header-note">
          {engineError ? "Stockfish failed to start (see console)" : note}
        </div>
        <div className="analysis-controls">
          <label className="check">
            <input
              type="checkbox"
              checked={engineOn}
              onChange={(e) => setEngineOn(e.target.checked)}
            />
            Engine
          </label>
          <label>
            Lines{" "}
            <select value={lineCount} onChange={(e) => setLineCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="eval-depth">
          <span>{engineOn ? `Depth ${ev.depth}` : "Engine off"}</span>
          <span>
            {engineOn
              ? ev.analysing
                ? ev.settled
                  ? "refining..."
                  : "calculating..."
                : "done"
              : ""}
          </span>
        </div>
        <div className="engine-lines" style={{ height: lineCount * 52 + 12 }}>
          {Array.from({ length: lineCount }, (_, i) => {
            const l = engineOn ? ev.lines[i] : undefined;
            return l ? (
              <button
                key={i}
                className="engine-line"
                title="Play the first move of this line"
                onClick={() => playLine(l.pv[0])}
              >
                <span className="line-eval">{l.ev.label}</span>
                <span className="line-pv">{lineTexts[i]}</span>
              </button>
            ) : (
              <div key={i} className="engine-line placeholder">
                <span className="line-eval">...</span>
                <span className="line-pv">{engineOn ? "calculating..." : ""}</span>
              </div>
            );
          })}
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
        <MoveList
          sans={sans}
          moves={moves}
          viewIndex={viewIndex}
          timed={!!game && game.timeControl.baseSec > 0}
          onSelect={goTo}
          marks={marks}
          ghosts={ghostsByPly(moves, game?.takebacks, startFen)}
          notes={legacyNotes(game)}
          names={names}
        />

        <div className="pos-note-box">
          <div className="field-label">Note on {moveLabel}</div>
          <textarea
            className="paste-box"
            rows={3}
            placeholder="Write a note about this move or position..."
            value={noteText}
            onChange={(e) => setNotes((n) => ({ ...n, [noteKey]: e.target.value }))}
          />
          <div className="note">{noteHint}</div>
        </div>

        {!game && !editLine && (
          <>
            <div className="fen-row">
              <textarea
                className="paste-box"
                rows={3}
                placeholder="Paste a PGN (1. e4 c5 2. Nf3 ...) or a FEN"
                value={fenInput}
                onChange={(e) => setFenInput(e.target.value)}
              />
              <button onClick={applyFen}>Load</button>
            </div>
            {fenError && <div className="error-text">{fenError}</div>}
          </>
        )}

        <AddToGuide
          candidates={candidates}
          ucis={lineUcis}
          side={orientation}
          customStart={!!startFen}
          notes={notes}
          editLine={editLine}
          fullUcis={allUcis}
        />

        <div className="buttons">
          <button onClick={flip}>Flip (F)</button>
          {!game && !editLine && <button onClick={reset}>Reset board</button>}
        </div>
      </div>
    </div>
  );
}
