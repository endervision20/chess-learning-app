import { useEffect, useMemo, useRef, useState } from "react";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";

import { Board } from "../components/Board";
import { live } from "../settings";
import { EvalBar } from "../components/EvalBar";
import { EvalGraph } from "../components/EvalGraph";
import { MoveList, type MoveMark } from "../components/MoveList";
import { PlayerBar } from "../components/PlayerBar";
import { analysisEngine } from "../engine/stockfish";
import { ghostsByPly, legacyNotes } from "../takebacks";
import { assistMarks, joinMarks } from "../marks";
import { BackButton } from "../components/BackButton";
import { moveToUci } from "../lineTools";
import { noteMark, pathKey } from "../notes";
import {
  materialInfo,
  otherColor,
  parseUciMove,
  pvToSan,
  replay,
} from "../chessLogic";
import { engineAnalyser, reviewGame, REVIEW_CALIB } from "../review";
import { CLASS_META, CLASS_ORDER } from "../reviewMeta";
import { loadReview, saveReview } from "../storage/reviews";
import {
  MAX_ELO,
  type AnalysisInit,
  type Color,
  type GameReview,
  type MoveClass,
  type ReviewInit,
} from "../types";

const NO_DESTS = new Map<Key, Key[]>();

interface ReviewProps {
  init: ReviewInit;
  onHome: () => void;
  onAnalyse: (init: AnalysisInit) => void;
}

export function Review({ init, onHome, onAnalyse }: ReviewProps) {
  const { game, fileName } = init;
  const [review, setReview] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: game.moves.length + 1 });
  const [error, setError] = useState("");
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Color>(game.playerColor);
  const cancelled = useRef(false);

  const { plies, sans } = useMemo(() => replay(game.moves, game.startFen), [game.moves, game.startFen]);
  const total = game.moves.length;

  // Load a saved review, or run the analysis
  useEffect(() => {
    cancelled.current = false;
    (async () => {
      try {
        if (fileName) {
          const cached = await loadReview(fileName);
          if (cached && cached.depth >= live.reviewDepth && cached.calib === REVIEW_CALIB && cached.moves.length === total) {
            if (!cancelled.current) setReview(cached);
            return;
          }
        }
        const result = await reviewGame(
          game.moves,
          engineAnalyser(analysisEngine),
          (done, all) => setProgress({ done, total: all }),
          () => cancelled.current,
          game.startFen
        );
        if (!result || cancelled.current) return;
        setReview(result);
        if (fileName) {
          saveReview(fileName, result).catch((e) =>
            console.error("Couldn't save the review:", e)
          );
        }
      } catch (e) {
        console.error("Review failed:", e);
        if (!cancelled.current) {
          setError("The review couldn't run. Is Stockfish available? (see console)");
        }
      }
    })();
    return () => {
      cancelled.current = true;
      analysisEngine.stop();
    };
  }, []);

  const goTo = (i: number) => setPly(Math.max(0, Math.min(total, i)));
  const flip = () => setOrientation((o) => otherColor(o));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  
  const allUcis = useMemo(() => game.moves.map(moveToUci), [game.moves]);
  const here = plies[ply];
  const noteText = game.notes?.[pathKey(allUcis.slice(0, ply))];
  const reviewed = review && ply > 0 ? review.moves[ply - 1] : undefined;
  const lastMove = ply > 0 ? [game.moves[ply - 1].from, game.moves[ply - 1].to] : undefined;
  const material = materialInfo(here.fen);

  // Arrow showing the move that should have been played
  const shapes = useMemo<DrawShape[]>(() => {
    if (!reviewed?.best) return [];
    if (!["inaccuracy", "miss", "mistake", "blunder"].includes(reviewed.cls)) return [];
    const b = parseUciMove(reviewed.best);
    return [{ orig: b.from, dest: b.to, brush: "green" }];
  }, [reviewed]);
  
  // Review grade (and any hint lightbulbs) beside each move
  const marks = useMemo<(MoveMark | undefined)[]>(
    () =>
      game.moves.map((m, i) => {
        const r = review?.moves[i];
        const meta = r ? CLASS_META[r.cls] : undefined;
        const list: MoveMark[] = [];
        if (meta) list.push({ text: meta.symbol, cls: meta.cls, title: meta.label });
        list.push(...assistMarks(m));
        const nm = noteMark(game.notes, allUcis, i);
        if (nm) list.push(nm);
        return joinMarks(list);
      }),
    [game.moves, game.notes, allUcis, review]
  );

  const counts = useMemo(() => {
    const c = {
      white: {} as Record<MoveClass, number>,
      black: {} as Record<MoveClass, number>,
    };
    for (const k of CLASS_ORDER) {
      c.white[k] = 0;
      c.black[k] = 0;
    }
    review?.moves.forEach((m, i) => {
      c[i % 2 === 0 ? "white" : "black"][m.cls] += 1;
    });
    return c;
  }, [review]);

  const botName = `Stockfish (${game.botElo >= MAX_ELO ? "full strength" : game.botElo})`;
  const nameOf = (c: Color) => (c === game.playerColor ? "You" : botName);
  const bar = (c: Color) => (
    <PlayerBar
      name={nameOf(c)}
      captured={material[c].captured}
      diff={material[c].diff}
      clockMs={0}
      timed={false}
      active={false}
    />
  );

  const resultText =
    game.winner === null
      ? `Draw by ${game.reason}`
      : `${game.winner === game.playerColor ? "You won" : "Stockfish won"} by ${game.reason}`;

  let moveInfo = "";
  if (reviewed && ply > 0) {
    const meta = CLASS_META[reviewed.cls];
    moveInfo = `${sans[ply - 1]}  ${meta.symbol}  ${meta.label}`;
    if (reviewed.loss >= 5) moveInfo += ` (-${reviewed.loss.toFixed(0)}% win chance)`;
  }
  const bestText =
    reviewed?.best && shapes.length > 0
      ? `Better: ${pvToSan(plies[ply - 1].fen, [reviewed.best], 1)}`
      : "";

  const evalPoint = review?.evals[ply];

  return (
    <div className="game-layout">
      <BackButton onClick={onHome} />
      <div className="board-row">
        <EvalBar
          pct={evalPoint?.pct ?? 50}
          label={evalPoint?.label ?? "0.0"}
          orientation={orientation}
          settling={!review}
        />
        <div className="board-col">
          {bar(otherColor(orientation))}
          <Board
            fen={here.fen}
            orientation={orientation}
            turnColor={here.turn}
            playerColor="white"
            interactive={false}
            dests={NO_DESTS}
            lastMove={lastMove}
            check={here.check ? here.turn : false}
            resync={0}
            shapes={shapes}
            onMove={() => {}}
          />
          {bar(orientation)}
        </div>
      </div>

      <div className="side-panel wide">
        <div className="status">
          <span>Game review</span>
          <span className="note">{resultText}</span>
        </div>

        {!review && !error && (
          <div className="review-progress">
            <div>
              Analysing position {Math.min(progress.done + 1, progress.total)} of {progress.total}
              ...
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <div className="note">
              {live.reviewDepth}. The result is saved, so reopening this review is instant.
            </div>
          </div>
        )}
        {error && <div className="error-text">{error}</div>}

        {review && (
          <>
            <div className="review-summary">
              <div className="rs-row rs-head">
                <span />
                <span>{nameOf("white")} (W)</span>
                <span>{nameOf("black")} (B)</span>
              </div>
              <div className="rs-row rs-acc">
                <span>Accuracy</span>
                <span>{review.accuracy.white.toFixed(1)}%</span>
                <span>{review.accuracy.black.toFixed(1)}%</span>
              </div>
              {CLASS_ORDER.map((k) => (
                <div className="rs-row" key={k}>
                  <span className={`rs-label ${CLASS_META[k].cls}`}>
                    {CLASS_META[k].symbol} {CLASS_META[k].label}
                  </span>
                  <span className={counts.white[k] ? "" : "zero"}>{counts.white[k]}</span>
                  <span className={counts.black[k] ? "" : "zero"}>{counts.black[k]}</span>
                </div>
              ))}
            </div>

            <EvalGraph
              values={review.evals.map((e) => e.pct)}
              current={ply}
              onSelect={goTo}
            />
          </>
        )}

        <div className="review-move">
          <div className={`review-move-main ${reviewed ? CLASS_META[reviewed.cls].cls : ""}`}>
            {moveInfo || (review ? "Pick a move to see its grade." : "")}
          </div>
          {bestText && <div className="note">{bestText}</div>}
        </div>
        {noteText && <div className="review-note">📝 {noteText}</div>}
        <MoveList
          sans={sans}
          moves={game.moves}
          viewIndex={ply}
          timed={game.timeControl.baseSec > 0}
          onSelect={goTo}
          marks={marks}
          ghosts={ghostsByPly(game.moves, game.takebacks, game.startFen)}
          notes={legacyNotes(game)}
          names={{ white: nameOf("white"), black: nameOf("black") }}
        />

        <div className="buttons">
          <button onClick={flip}>Flip (F)</button>
          <button onClick={() => onAnalyse({ moves: game.moves, game })}>Analyse</button>
        </div>
      </div>
    </div>
  );
}