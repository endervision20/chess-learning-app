import { useEffect, useMemo, useRef, useState } from "react";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import { chessgroundDests } from "chessops/compat";

import { live } from "../settings";
import { Board } from "../components/Board";
import { EvalBar } from "../components/EvalBar";
import { GameResultPopup } from "../components/GameResultPopup";
import { MoveList } from "../components/MoveList";
import { MoveStrip } from "../components/MoveStrip";
import { PlayerBar } from "../components/PlayerBar";
import { analysisEngine, botEngine, evalEngine } from "../engine/stockfish";
import { useEngineEval } from "../hooks/useEngineEval";
import { ghostsByPly } from "../takebacks";
import { assistMarks, joinMarks } from "../marks";
import { BackButton } from "../components/BackButton"
import {
  getOutcome,
  kingSquare,
  materialInfo,
  otherColor,
  parseUciMove,
  replay,
  type Outcome,
} from "../chessLogic";
import { checkMove, type HelpFinding } from "../helped";
import { moveToUci } from "../lineTools";
import { bookMove, bookMoves, bookStatus, openingAt } from "../openings";
import { abandonedGame } from "../pausedLogic";
import { engineAnalyser } from "../review";
import { saveGame } from "../storage/games";
import { deletePaused, pauseGame } from "../storage/paused";
import {
  MAX_ELO,
  NO_ASSISTS,
  NO_HELP,
  assistIcons,
  describeAssists,
  describeHelp,
  helpIcons,
  totalAssists,
  totalHelp,
  type AnalysisInit,
  type AssistCounts,
  type Color,
  type GameConfig,
  type GameResult,
  type HelpCounts,
  type PausedGame,
  type PlayedMove,
  type PromotionRole,
  type ReviewInit,
  type SavedGame,
  type TakebackRecord,
} from "../types";

/*// Eval bar tuning: nothing new is shown until MIN depth, then it refines up to
// TARGET depth (or MAX_MS, whichever comes first). Raise MIN_DEPTH for a calmer bar.
const EVAL_MIN_DEPTH = 16;
const EVAL_TARGET_DEPTH = 24;
const EVAL_MAX_MS = 8000;
const EVAL_GO = `depth ${EVAL_TARGET_DEPTH} movetime ${EVAL_MAX_MS}`;

// The Hint button searches this deep (or this long, whichever comes first)
const HINT_GO = "depth 16 movetime 2500";
// Helped mode checks each of your moves at this depth (lower = quicker)
const HELP_DEPTH = 12; */

interface GameProps {
  config: GameConfig;
  playerColor: Color;
  resume?: PausedGame; // set when this game was paused earlier
  maxPaused: number;
  onHome: () => void;
  onChangeSettings: () => void;
  onRematch: () => void;
  onAnalyse: (init: AnalysisInit) => void;
  onReview: (init: ReviewInit) => void;
}

export function Game({
  config,
  playerColor,
  resume,
  maxPaused,
  onHome,
  onChangeSettings,
  onRematch,
  onAnalyse,
  onReview,
}: GameProps) {
  const tc = config.timeControl;
  const timed = tc.baseSec > 0;
  const baseMs = tc.baseSec * 1000;

  const [moves, setMoves] = useState<PlayedMove[]>(resume?.moves ?? []);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<Color>(playerColor);
  const [clocks, setClocks] = useState(resume?.clocks ?? { white: baseMs, black: baseMs });
  const [flagged, setFlagged] = useState<Color | null>(null);
  const [resigned, setResigned] = useState<Color | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(false);
  const [resync, setResync] = useState(0);
  const [assists, setAssists] = useState<AssistCounts>(resume?.assists ?? NO_ASSISTS);
  const [help, setHelp] = useState<HelpCounts>(resume?.help ?? NO_HELP);
  const [takebackLog, setTakebackLog] = useState<TakebackRecord[]>(resume?.takebacks ?? []);
  const [confirm, setConfirm] = useState<"resign" | "home" | null>(null);
  const [pauseError, setPauseError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [popupClosed, setPopupClosed] = useState(false);

  // Hint button: 0 = nothing shown, 1 = the piece is highlighted, 2 = the move is shown
  const [hintUses, setHintUses] = useState(0);
  const [hintUci, setHintUci] = useState<string | null>(null);
  const [hintBusy, setHintBusy] = useState(false);

  // Helped mode: checking your last move, and a warning waiting for your decision
  const [checking, setChecking] = useState(false);
  const [warning, setWarning] = useState<HelpFinding | null>(null);
  const checkToken = useRef(0);
  const helpAnalyser = useMemo(() => engineAnalyser(analysisEngine, live.helpDepth), []);

  const clocksRef = useRef(clocks);
  clocksRef.current = clocks;
  const turnStart = useRef(Date.now());
  const lastTick = useRef(Date.now());
  const startedAt = useRef(resume?.startedAt ?? new Date().toISOString());
  const savedRef = useRef(false);
  const movesLenRef = useRef(0);
  movesLenRef.current = moves.length;

  // ---- Derived game state ----
  const { pos, plies, sans, keys } = useMemo(() => replay(moves, config.startFen), [moves, config.startFen]);
  const boardOutcome = useMemo(() => getOutcome(pos, keys), [pos, keys]);
  const outcome: Outcome | null = flagged
    ? { winner: otherColor(flagged), reason: "timeout" }
    : resigned
    ? { winner: otherColor(resigned), reason: "resignation" }
    : boardOutcome;
  const gameOver = outcome !== null;
  const myResult: GameResult | null = outcome
    ? outcome.winner === null
      ? "draw"
      : outcome.winner === playerColor
      ? "win"
      : "loss"
    : null;

  const viewIndex = viewPly ?? moves.length;
  const viewing = viewIndex !== moves.length;
  const viewData = plies[viewIndex];
  const helpBusy = checking || warning !== null;
  const botTurn = !gameOver && pos.turn !== playerColor;
  const interactive = !gameOver && !viewing;

  const turnRef = useRef(pos.turn);
  turnRef.current = pos.turn;

  const dests = useMemo(
    () => (gameOver ? (new Map() as Map<Key, Key[]>) : chessgroundDests(pos)),
    [pos, gameOver]
  );
  const lastMove = useMemo(
    () =>
      viewIndex > 0
        ? [moves[viewIndex - 1].from, moves[viewIndex - 1].to]
        : undefined,
    [moves, viewIndex]
  );
  const material = materialInfo(viewData.fen);

  // ---- Opening name and book ----
  const playedUci = useMemo(() => moves.map((m) => moveToUci(m)), [moves]);
  const fens = useMemo(() => plies.map((p) => p.fen), [plies]);
  const opening = useMemo(() => (config.practice ? null : openingAt(fens, viewIndex)), [fens, viewIndex]);
  const book = useMemo(
    () => (config.opening ? bookStatus(config.opening, playedUci) : null),
    [playedUci]
  );

  // ---- Assists (amber) and help (green) ----
  const assistTotal = totalAssists(assists);
  const assistText = describeAssists(assists);
  const helpTotal = totalHelp(help);
  const helpText = describeHelp(help);

  // ---- Eval bar ----
  const ev = useEngineEval({
    engine: evalEngine,
    enabled: config.showEval && engineReady,
    fen: viewData.fen,
    turn: viewData.turn,
    go: `depth ${live.evalTargetDepth} movetime ${live.evalMaxSec * 1000}`,
    minDepth: live.evalMinDepth,
  });

  // ---- Start both engines ----
  useEffect(() => {
    let alive = true;
    Promise.all([
      botEngine.init(),
      config.showEval ? evalEngine.init() : Promise.resolve(),
    ])
      .then(() => {
        if (!alive) return;
        turnStart.current = Date.now();
        lastTick.current = Date.now();
        setEngineReady(true);
      })
      .catch((e) => {
        console.error("Engine failed to start:", e);
        if (alive) setEngineError(true);
      });
    return () => {
      alive = false;
      botEngine.stop();
      evalEngine.stop();
      analysisEngine.stop();
    };
  }, []);

  // ---- Making moves ----
  const addMove = (from: Key, to: Key, promotion?: PromotionRole, hints = 0) => {
    const now = Date.now();
    const spent = now - turnStart.current;
    turnStart.current = now;
    const mover = pos.turn;

    let clockAfter: number | null = null;
    if (timed) {
      const ticking = moves.length >= 2;
      const left = ticking
        ? Math.max(0, clocksRef.current[mover] - (now - lastTick.current))
        : clocksRef.current[mover];
      const value = left + (ticking ? tc.incSec * 1000 : 0);
      clockAfter = value;
      setClocks((c) => ({ ...c, [mover]: value }));
    }
    lastTick.current = now;
    setMoves((m) => [
      ...m,
      {
        from,
        to,
        promotion,
        spentMs: spent,
        clockAfterMs: clockAfter,
        hints: hints || undefined,
      },
    ]);
  };

  // Helped mode: look at the move you just made before the bot replies
  const runHelpCheck = async (fenBefore: string, playedBefore: string[], uci: string) => {
    const token = ++checkToken.current;
    setChecking(true);
    setWarning(null);
    try {
      const finding = await checkMove({
        analyse: helpAnalyser,
        fenBefore,
        uci,
        mover: playerColor,
        book: config.opening ? { forced: config.opening, played: playedBefore } : undefined,
      });
      if (token !== checkToken.current) return;
      if (finding) {
        const idx = playedBefore.length; // the move that was just checked
        setMoves((ms) =>
          ms.map((m, i) =>
            i === idx
              ? { ...m, warned: finding.bad || undefined, bookNotice: finding.book || undefined }
              : m
          )
        );
        setWarning(finding);
        setHelp((h) => ({
          ...h,
          warnings: h.warnings + (finding.bad ? 1 : 0),
          bookHints: h.bookHints + (finding.book ? 1 : 0),
        }));
      }
    } catch (e) {
      console.error("Helped-mode check failed:", e);
    } finally {
      if (token === checkToken.current) setChecking(false);
    }
  };

  // A move from the board (also validates premoves)
  const handleMove = (from: Key, to: Key, promotion?: PromotionRole) => {
    if (!interactive || !dests.get(from)?.includes(to)) {
      setResync((n) => n + 1);
      return;
    }
    const fenBefore = plies[plies.length - 1].fen;
    const playedBefore = playedUci;
    addMove(from, to, promotion, hintUses);
    if (config.helped && engineReady) {
      runHelpCheck(fenBefore, playedBefore, moveToUci({ from, to, promotion }));
    }
  };

  // ---- Hint button (counts as assisted) ----
  useEffect(() => {
    setHintUses(0);
    setHintUci(null);
  }, [moves.length]);

  const canHint = interactive && !botTurn && engineReady && !hintBusy && hintUses < 2;

  const pressHint = async () => {
    if (!canHint) return;
    let uci = hintUci;
    if (!uci) {
      // With an opening chosen, hints follow that line while it lasts
      const bookOptions =
        config.opening && book === "in" ? bookMoves(config.opening, playedUci) : [];
      if (bookOptions.length > 0) {
        uci = bookOptions[0].uci;
      } else {
        const atLength = moves.length;
        setHintBusy(true);
        try {
          uci = await   analysisEngine.search(
            plies[plies.length - 1].fen,
            `depth ${live.hintDepth} movetime ${live.hintMs}`
            );
        } catch (e) {
          console.error("Hint failed:", e);
          uci = "";
        } finally {
          setHintBusy(false);
        }
        if (!uci || movesLenRef.current !== atLength) return; // cancelled, or you already moved
      }
      setHintUci(uci);
    }
    setHintUses((n) => n + 1);
    setAssists((a) => ({ ...a, hintButton: a.hintButton + 1 }));
  };

  // Arrows on the board: a warning's arrows, otherwise the hint
  const hintShapes = useMemo<DrawShape[]>(() => {
    if (!hintUci || hintUses === 0 || !interactive) return [];
    const m = parseUciMove(hintUci);
    const out: DrawShape[] = [{ orig: m.from, brush: "yellow" }];
    if (hintUses >= 2) out.push({ orig: m.from, dest: m.to, brush: "green" });
    return out;
  }, [hintUci, hintUses, interactive]);
  const shapes = warning ? warning.shapes : hintShapes;

  // ---- Bot ----
  useEffect(() => {
    if (!botTurn || !engineReady || helpBusy) return;
    // Forced opening: play the book move if we're still in the line
    if (config.opening) {
      const uci = bookMove(config.opening, playedUci);
      if (uci) {
        const t = setTimeout(() => {
          const m = parseUciMove(uci);
          addMove(m.from, m.to, m.promotion);
        }, 350 + Math.random() * 650);
        return () => clearTimeout(t);
      }
    }
    let cancelled = false;
    // Untimed: quick fixed think. Timed: spend roughly 1/30 of the remaining
    // clock plus most of the increment, with some variation, so the bot uses
    // its time like a person (capped so it never flags itself or drags on).
    let thinkMs = live.botThinkMs;
    
    if (timed) {
      const botMs = clocksRef.current[otherColor(playerColor)];
      const base = botMs / 30 + tc.incSec * 1000 * 0.75;
      const jitter = 0.6 + Math.random() * 0.8;
      thinkMs = Math.min(Math.max(base * jitter * live.botSpeed, 600 * live.botSpeed), botMs * 0.2, 15000);
      thinkMs = Math.max(100, Math.round(thinkMs));
    }
    const elo = config.elo >= MAX_ELO ? undefined : config.elo;
    botEngine
      .search(plies[plies.length - 1].fen, `movetime ${thinkMs}`, { elo })
      .then((uci) => {
        if (cancelled || !uci || uci === "(none)") return;
        const m = parseUciMove(uci);
        addMove(m.from, m.to, m.promotion);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
      botEngine.stop();
    };
  }, [botTurn, plies.length, engineReady, helpBusy]);

  // ---- Clocks ----
  const ticking = timed && engineReady && !gameOver && moves.length >= 2;
  useEffect(() => {
    if (!ticking) return;
    lastTick.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - lastTick.current;
      lastTick.current = now;
      setClocks((c) => {
        const side = turnRef.current;
        return { ...c, [side]: Math.max(0, c[side] - dt) };
      });
    }, 100);
    return () => clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    if (ticking && clocks[pos.turn] <= 0) setFlagged(pos.turn);
  }, [clocks, ticking, pos.turn]);

  // ---- Saving ----
  const buildSaved = (): SavedGame | null => {
    if (!outcome || !myResult || moves.length === 0) return null;
    return {
      version: 1,
      date: startedAt.current,
      playerColor,
      botElo: config.elo,
      timeControl: tc,
      moves,
      result: myResult,
      winner: outcome.winner,
      reason: outcome.reason,
      assisted: assistTotal > 0,
      assists,
      helped: config.helped,
      startFen: config.startFen,
      practice: config.practice,
      help,
      takebacks: takebackLog,
    };
  };

  useEffect(() => {
    if (!gameOver || savedRef.current) return;
    const game = buildSaved();
    if (!game) return;
    savedRef.current = true;
    saveGame(game)
      .then((name) => {
        setSavedName(name);
        setSaveState("saved");
        if (resume) deletePaused(resume.id); // it isn't paused any more
      })
      .catch((e) => {
        console.error("Saving the game failed:", e);
        setSaveState("error");
      });
  }, [gameOver]);

  // ---- Navigation ----
  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(moves.length, i));
    setViewPly(clamped === moves.length ? null : clamped);
  };
  const flip = () => setOrientation((o) => otherColor(o));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowLeft") goTo(viewIndex - 1);
      else if (e.key === "ArrowRight") goTo(viewIndex + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") goTo(0);
      else if (e.key === "ArrowDown" || e.key === "End") goTo(moves.length);
      else if (e.key.toLowerCase() === "f") flip();
      else if (e.key === "Escape") setConfirm(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewIndex, moves.length]);

  // ---- Takebacks ----
  const rewindTo = (next: PlayedMove[]) => {
    const restored = { white: baseMs, black: baseMs };
    next.forEach((m, i) => {
      if (m.clockAfterMs != null) restored[i % 2 === 0 ? "white" : "black"] = m.clockAfterMs;
    });
    setMoves(next);
    setClocks(restored);
    setViewPly(null);
    turnStart.current = Date.now();
    lastTick.current = Date.now();
  };

  const clearHelpState = () => {
    checkToken.current++; // any check still running is ignored
    setChecking(false);
    setWarning(null);
  };

  // The Takeback button: counts as assisted
  const takeback = () => {
    const remove = pos.turn === playerColor ? 2 : 1;
    const next = moves.slice(0, Math.max(0, moves.length - remove));
    setTakebackLog((log) => [
      ...log,
      { prefix: next.map(moveToUci), removed: moves.slice(next.length).map(moveToUci) },
    ]);
    rewindTo(next);
    setAssists((a) => ({ ...a, takebacks: a.takebacks + 1 }));
    clearHelpState();
  };

  // Taking back a flagged move in Helped mode: free, counts as helped
  const freeTakeback = () => {
    if (moves.length === 0) return;
    const next = moves.slice(0, moves.length - 1);
    setTakebackLog((log) => [
      ...log,
      {
        prefix: next.map(moveToUci),
        removed: moves.slice(next.length).map(moveToUci),
        free: true,
      },
    ]);
    rewindTo(next);
    setHelp((h) => ({ ...h, freeTakebacks: h.freeTakebacks + 1 }));
    clearHelpState();
  };

  const resign = () => setResigned(playerColor);

  // ---- Pausing ----
  const pauseAndLeave = async () => {
    const paused: PausedGame = {
      version: 1,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      savedAt: new Date().toISOString(),
      pinned: false,
      config,
      playerColor,
      startedAt: startedAt.current,
      moves,
      clocks: clocksRef.current,
      assists,
      help,
      takebacks: takebackLog,
    };
    try {
      const res = await pauseGame(paused, maxPaused, resume?.id);
      if (!res.ok) {
        setPauseError(
          "All your paused-game slots are pinned (📌). Unpin one on the main menu, or resign this game."
        );
        return;
      }
      // Games pushed out to make room count as losses by abandonment
      for (const gone of res.evicted) {
        await saveGame(abandonedGame(gone)).catch((e) =>
          console.error("Couldn't save an abandoned game:", e)
        );
      }
      onHome();
    } catch (e) {
      console.error("Couldn't pause the game:", e);
      setPauseError("Couldn't pause the game (see console).");
    }
  };

  const runConfirmed = () => {
    if (confirm === "resign") {
      setConfirm(null);
      resign();
    } else if (confirm === "home") {
      if (config.practice) onHome();
      else pauseAndLeave();
    }
  };

  // ---- Icons beside moves (hint lightbulbs amber, helper green) and taken-back moves ----
  const marks = useMemo(() => moves.map((m) => joinMarks(assistMarks(m))), [moves]);
  const ghosts = useMemo(() => ghostsByPly(moves, takebackLog, config.startFen), [moves, takebackLog]);

  // ---- The kings turn red / green / grey when the game ends ----
  const winnerKey = outcome ? (outcome.winner ?? "draw") : null;
  const squareMarks = useMemo(() => {
    const m = new Map<Key, string>();
    if (!winnerKey || viewing) return m;
    const fen = plies[plies.length - 1].fen;
    const style = (c: Color) =>
      winnerKey === "draw" ? "king-draw" : winnerKey === c ? "king-win" : "king-lose";
    const wk = kingSquare(fen, "white");
    const bk = kingSquare(fen, "black");
    if (wk) m.set(wk, style("white"));
    if (bk) m.set(bk, style("black"));
    return m;
  }, [winnerKey, viewing, plies]);

  const showPopup = gameOver && myResult !== null && !popupClosed && !viewing;
  const openReview = () => {
    const g = buildSaved();
    if (g) onReview({ game: g, fileName: savedName ?? undefined });
  };

  // ---- Text ----
  let status: string;
  if (engineError) status = "Stockfish failed to start (see console)";
  else if (!engineReady) status = "Starting Stockfish...";
  else if (outcome) status = "Game over";
  else if (viewing) status = `Viewing move ${viewIndex} of ${moves.length}`;
  else if (warning) status = "Take it back, or keep playing?";
  else if (checking) status = "Checking your move...";
  else if (botTurn) status = "Stockfish is thinking...";
  else status = "Your move";

  const resultText = outcome
    ? outcome.winner === null
      ? `Draw by ${outcome.reason}`
      : `${outcome.winner === playerColor ? "You won" : "Stockfish won"} by ${outcome.reason}`
    : "";

  const botName = `Stockfish (${config.elo >= MAX_ELO ? "full strength" : config.elo})`;
  const nameOf = (c: Color) => (c === playerColor ? "You" : botName);

  const bar = (c: Color) => (
    <PlayerBar
      name={nameOf(c)}
      captured={material[c].captured}
      diff={material[c].diff}
      clockMs={clocks[c]}
      timed={timed}
      active={!gameOver && pos.turn === c}
    />
  );

  const hintLabel =
    hintBusy ? "Thinking..." : hintUses === 0 ? "Hint" : hintUses === 1 ? "Hint: show move" : "Hint used";

  // On a phone the status line is hidden unless it has something worth saying
  const statusQuiet = engineReady && !engineError && !warning && !checking;

  return (
    <div className="game-layout">
      <BackButton
        onClick={() => {
          setPauseError("");
          if (moves.length === 0 || outcome) onHome();
          else setConfirm("home");
        }}
      />
      <MoveStrip sans={sans} viewIndex={viewIndex} onSelect={goTo} />
      <div className="board-row">
        {config.showEval && (
          <EvalBar
            pct={ev.evalState?.pct ?? 50}
            label={ev.evalState?.label ?? "0.0"}
            orientation={orientation}
            settling={!ev.settled}
          />
        )}
        <div className="board-col">
          {bar(otherColor(orientation))}
          <Board
            fen={viewData.fen}
            orientation={orientation}
            turnColor={viewData.turn}
            playerColor={playerColor}
            interactive={interactive}
            dests={dests}
            lastMove={lastMove}
            check={viewData.check ? viewData.turn : false}
            resync={resync}
            shapes={shapes}
            marks={squareMarks}
            overlay={
              showPopup && myResult ? (
                <GameResultPopup
                  result={myResult}
                  reason={outcome!.reason}
                  onRematch={onRematch}
                  onChangeSettings={onChangeSettings}
                  onReview={openReview}
                  onAnalyse={() => onAnalyse({ moves, game: buildSaved() ?? undefined, fileName: savedName ?? undefined })}
                  onHome={onHome}
                  onClose={() => setPopupClosed(true)}
                />
              ) : undefined
            }
            onMove={handleMove}
          />
          {bar(orientation)}
        </div>
      </div>

      <div className="side-panel game-panel">
        <div className={`status ${statusQuiet && !config.helped && assistTotal === 0 ? "quiet" : ""}`}>
          <span className={statusQuiet ? "quiet" : ""}>{status}</span>
          <span className="badges">
            {config.helped && (
              <span className="badge helped" title={helpText ? `Helped: ${helpText}` : "Helped mode is on"}>
                Helped{helpTotal > 0 ? ` ${helpIcons(help)}` : ""}
              </span>
            )}
            {assistTotal > 0 && (
              <span className="badge" title={`Assisted: ${assistText}`}>
                {assistIcons(assists)}
              </span>
            )}
          </span>
        </div>

        {config.showEval && (
          <div className="eval-depth">
            <span>
              {live.evalTargetDepth}
            </span>
            <span>
              {ev.analysing ? (ev.settled ? "refining..." : "calculating...") : "done"}
            </span>
          </div>
        )}

        <div className="opening-label">
          <div className="opening-name">
            {opening ? (
              <>
                <span className="eco">{opening.eco}</span> {opening.name}
              </>
            ) : (
              config.practice ? config.practice.label : "Starting position"
            )}
          </div>
          {config.opening && (
            <div className={`book-state ${book}`}>
              {book === "in"
                ? `Book: ${config.opening.name}`
                : book === "done"
                ? "Book line finished - Stockfish is free"
                : "Left the book - Stockfish is free"}
            </div>
          )}
        </div>

        <MoveList
          sans={sans}
          moves={moves}
          viewIndex={viewIndex}
          timed={timed}
          onSelect={goTo}
          marks={marks}
          ghosts={ghosts}
          names={{ white: nameOf("white"), black: nameOf("black") }}
        />

        {outcome ? (
          <div className="result">
            <div className="result-text">{resultText}</div>
            {saveState === "saved" && <div className="note">Game saved.</div>}
            {saveState === "error" && (
              <div className="error-text">Couldn't save this game (see console).</div>
            )}
            <div className="buttons">
              <button className="primary" onClick={onRematch}>Rematch</button>
              <button onClick={onChangeSettings}>Change settings</button>
            </div>
            <div className="buttons">
              <button disabled={moves.length === 0} onClick={openReview}>
                Game review
              </button>
              <button
                onClick={() => onAnalyse({ moves, game: buildSaved() ?? undefined, fileName: savedName ?? undefined })}
              >
                Analyse
              </button>
              <button onClick={onHome}>Home</button>
            </div>
          </div>
        ) : (
          <div className="action-area">
            <div className="buttons grid3">
              <button onClick={flip}>Flip (F)</button>
              <button onClick={takeback} disabled={moves.length === 0 || !engineReady}>
                Takeback
              </button>
              <button
                onClick={pressHint}
                disabled={!canHint}
                title="Highlights the piece to move; press again to show the move. Follows your chosen opening while it lasts. Counts as an assist."
              >
                {hintLabel}
              </button>
              <button onClick={() => (live.confirmResign ? setConfirm("resign") : resign())} disabled={!engineReady}>
                Resign
              </button>
            </div>

            {warning && !confirm && (
              <div className="help-overlay">
                {warning.lines.map((line, i) => (
                  <div className="help-line" key={i}>
                    {line}
                  </div>
                ))}
                <div className="confirm-buttons">
                  <button className="primary" onClick={freeTakeback}>
                    Take back (free)
                  </button>
                  <button onClick={() => setWarning(null)}>Keep playing</button>
                </div>
              </div>
            )}

            {confirm && (
              <div className="confirm-overlay">
                <div className="confirm-text">
                  {confirm === "resign"
                    ? "Resign this game?"
                    : pauseError || (config.practice ? "Leave this practice position? It won't be saved." : "") ||
                      `Pause this game and leave? Resume it from the main menu. Past ${maxPaused} paused games, the oldest unpinned one counts as a loss.`}
                </div>
                <div className="confirm-buttons">
                  {!(confirm === "home" && pauseError.startsWith("All")) && (
                    <button className="danger" onClick={runConfirmed}>
                      {confirm === "resign" ? "Resign" : config.practice ? "Leave" : "Pause & leave"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setConfirm(null);
                      setPauseError("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
