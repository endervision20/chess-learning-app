import { useEffect, useMemo, useRef, useState } from "react";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";

import { BackButton } from "../components/BackButton";
import { Board } from "../components/Board";
import { destsFromFen, parseUciMove, pvToSan, replay } from "../chessLogic";
import {
  afterAnswer,
  allCardsShuffled,
  buildCards,
  buildQueue,
  conflictWith,
  lineStats,
  linesStats,
  type Card,
} from "../flashLogic";
import { moveToUci, ucisToMoves } from "../lineTools";
import { openingAt } from "../openings";
import {
  deleteFlashGroup,
  deleteFlashLine,
  loadFlashLines,
  loadMemory,
  saveMemory,
} from "../storage/flashcards";
import type { CardMemory, FlashLine, PromotionRole } from "../types";

const NO_DESTS = new Map<Key, Key[]>();
const SEL_KEY = "flash-selected";

type Status = "ask" | "reply" | "right" | "wrong";

// ---------------------------------------------------------------------------
// One card
// ---------------------------------------------------------------------------
function CardView({
  card,
  index,
  total,
  onResult,
  onNext,
  onExit,
}: {
  card: Card;
  index: number;
  total: number;
  onResult: (correct: boolean) => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const built = useMemo(() => replay(ucisToMoves(card.ucis)), [card]);
  const fens = useMemo(() => built.plies.map((p) => p.fen), [built]);
  const need = Math.min(card.count, Math.ceil((card.ucis.length - card.startPly) / 2));

  const [ply, setPly] = useState(card.startPly);
  const [done, setDone] = useState(0);
  const [status, setStatus] = useState<Status>("ask");
  const [resync, setResync] = useState(0);
  const [viaAlt, setViaAlt] = useState(false);
  const reported = useRef(false);

  const here = built.plies[ply];
  const dests = useMemo(
    () => (status === "ask" ? destsFromFen(here.fen) : NO_DESTS),
    [here.fen, status]
  );
  const lastMove = useMemo(() => {
    if (ply === 0) return undefined;
    const m = parseUciMove(card.ucis[ply - 1]);
    return [m.from, m.to];
  }, [ply, card]);

  const finish = (correct: boolean) => {
    if (!reported.current) {
      reported.current = true;
      onResult(correct);
    }
    setStatus(correct ? "right" : "wrong");
  };

  const handleMove = (from: Key, to: Key, promotion?: PromotionRole) => {
    if (status !== "ask" || !dests.get(from)?.includes(to)) {
      setResync((n) => n + 1);
      return;
    }
    const uci = moveToUci({ from, to, promotion });
    if (uci !== card.ucis[ply] && ply === card.startPly && card.accept?.includes(uci)) {
      // another move from your repertoire at this position: also right
      setViaAlt(true);
      setResync((n) => n + 1);
      finish(true);
      return;
    }
    if (uci === card.ucis[ply]) {
      const nextPly = ply + 1;
      const nd = done + 1;
      setDone(nd);
      setPly(nextPly);
      if (nd >= need || nextPly >= card.ucis.length) finish(true);
      else setStatus("reply");
    } else {
      setResync((n) => n + 1);
      finish(false);
    }
  };

  // The opponent's reply, when the card asks for more than one move
  useEffect(() => {
    if (status !== "reply") return;
    const t = setTimeout(() => {
      const np = ply + 1;
      setPly(np);
      if (np >= card.ucis.length) finish(true);
      else setStatus("ask");
    }, 450);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (status === "right" || status === "wrong")) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, onNext]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (status !== "wrong") return [];
    const list = card.accept && ply === card.startPly ? card.accept : [card.ucis[ply]];
    return list.map((u) => {
      const m = parseUciMove(u);
      return { orig: m.from, dest: m.to, brush: "green" } as DrawShape;
    });
  }, [status, ply, card]);

  const opening = openingAt(fens, ply);
  const answerText =
    status !== "wrong"
      ? ""
      : card.accept && ply === card.startPly
      ? card.accept
          .map((u) => pvToSan(here.fen, [u], 1).replace(/^\d+\.(\.\.)?\s*/, ""))
          .join(" or ")
      : pvToSan(here.fen, card.ucis.slice(ply, ply + Math.max(1, 2 * need - 1)), 6);

  let prompt: string;
  if (need <= 1) prompt = "Play the next move of the line.";
  else prompt = `Play your next ${need} moves of the line (move ${Math.min(done + 1, need)} of ${need}).`;

  return (
    <div className="game-layout">
      <div className="board-col">
        <div className="bar-spacer" />
        <Board
          fen={here.fen}
          orientation={card.side}
          turnColor={here.turn}
          playerColor={card.side}
          interactive={status === "ask"}
          premove={false}
          dests={dests}
          lastMove={lastMove}
          check={here.check ? here.turn : false}
          resync={resync}
          shapes={shapes}
          onMove={handleMove}
        />
        <div className="bar-spacer" />
      </div>

      <div className="side-panel">
        <div className="status">
          <span>
            Card {Math.min(index + 1, total)} of {total}
          </span>
          <span className="note">{card.side === "white" ? "You are White" : "You are Black"}</span>
        </div>

        <div className="opening-label">
          <div className="opening-name">{card.lineName}</div>
          <div className="book-state">
            {opening ? (
              <>
                <span className="eco">{opening.eco}</span> {opening.name}
              </>
            ) : (
              "Starting position"
            )}
          </div>
        </div>

        <div className="flash-prompt">
          {status === "ask" || status === "reply" ? (
            <div>{prompt}</div>
          ) : status === "right" ? (
            <div className="flash-right">{viaAlt ? "Correct! (another move from your repertoire)" : "Correct!"}</div>
          ) : (
            <>
              <div className="flash-wrong">Not quite. The line goes:</div>
              <div className="flash-answer">{answerText}</div>
              <div className="note">
                This card is remembered and will come back first next time.
              </div>
            </>
          )}
        </div>

        <div className="buttons">
          {status === "ask" && (
            <button onClick={() => finish(false)}>Show answer</button>
          )}
          {(status === "right" || status === "wrong") && (
            <button className="primary" onClick={onNext}>
              Next (Enter)
            </button>
          )}
          <button onClick={onExit}>End session</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A session: goes through the queue, forgotten cards go to the back again
// ---------------------------------------------------------------------------
function FlashSession({
  initial,
  cram,
  memory,
  onMemory,
  onExit,
}: {
  initial: Card[];
  cram: boolean;
  memory: Record<string, CardMemory>;
  onMemory: (m: Record<string, CardMemory>) => void;
  onExit: () => void;
}) {
  const [queue, setQueue] = useState<Card[]>(initial);
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [firstTry, setFirstTry] = useState(0);
  const [forgot, setForgot] = useState<string[]>([]);
  const memRef = useRef(memory);

  const card = queue[pos];

  const onResult = (ok: boolean) => {
    const c = queue[pos];
    const wasFailed = failed.has(c.key);
    const next = afterAnswer(memRef.current[c.key], ok, new Date(), cram, wasFailed);
    if (next) {
      memRef.current = { ...memRef.current, [c.key]: next };
      onMemory(memRef.current);
    }
    if (ok) {
      if (!wasFailed) setFirstTry((n) => n + 1);
    } else {
      if (!wasFailed) {
        setFailed((f) => new Set(f).add(c.key));
        setForgot((f) => [...f, c.lineName]);
      }
      setQueue((q) => [...q, c]); // it comes round again later this session
    }
  };

  if (!card) {
    const lines = [...new Set(forgot)];
    return (
      <div className="config">
        <h1>Session finished</h1>
        <p>
          {firstTry} of {initial.length} card{initial.length === 1 ? "" : "s"} right first time.
        </p>
        {lines.length > 0 && (
          <div className="setup-card">
            <div className="field-label">Forgotten (they will come back first next time)</div>
            {lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        )}
        <div className="config-buttons">
          <button className="primary" onClick={onExit}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <CardView
      key={pos}
      card={card}
      index={pos}
      total={queue.length}
      onResult={onResult}
      onNext={() => setPos((p) => p + 1)}
      onExit={onExit}
    />
  );
}

// ---------------------------------------------------------------------------
// The screen: pick lines, then start
// ---------------------------------------------------------------------------
export function Flashcards({ onHome }: { onHome: () => void }) {
  const [lines, setLines] = useState<FlashLine[] | null>(null);
  const [memory, setMemory] = useState<Record<string, CardMemory>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perCard, setPerCard] = useState(1);
  const [newLimit, setNewLimit] = useState(10);
  const [session, setSession] = useState<{ queue: Card[]; cram: boolean; id: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [ls, mem] = await Promise.all([loadFlashLines(), loadMemory()]);
      let saved: string[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(SEL_KEY) ?? "[]");
      } catch {
        /* nothing saved */
      }
      // keep the saved choice, dropping anything that would now conflict
      const chosen: FlashLine[] = [];
      for (const l of ls) {
        if (saved.includes(l.id) && !conflictWith(l, chosen)) chosen.push(l);
      }
      setLines(ls);
      setMemory(mem);
      setSelected(new Set(chosen.map((l) => l.id)));
    })().catch((e) => {
      console.error("Couldn't load flashcards:", e);
      setLines([]);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SEL_KEY, JSON.stringify([...selected]));
    } catch {
      /* the choice just won't be remembered */
    }
  }, [selected]);

  const chosenLines = useMemo(
    () => (lines ?? []).filter((l) => selected.has(l.id)),
    [lines, selected]
  );
  const cards = useMemo(() => buildCards(chosenLines, perCard), [chosenLines, perCard]);
  const plan = useMemo(() => buildQueue(cards, memory, newLimit), [cards, memory, newLimit]);
  // lines that came from a repertoire are shown as one row per repertoire
  const groups = useMemo(() => {
    const m = new Map<string, FlashLine[]>();
    for (const l of lines ?? []) {
      if (!l.group) continue;
      const a = m.get(l.group);
      if (a) a.push(l);
      else m.set(l.group, [l]);
    }
    return m;
  }, [lines]);

  const toggle = (l: FlashLine) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(l.id)) n.delete(l.id);
      else if (!conflictWith(l, (lines ?? []).filter((x) => n.has(x.id)))) n.add(l.id);
      return n;
    });
  };

  const toggleGroup = (gid: string, gl: FlashLine[]) => {
    setSelected((s) => {
      const n = new Set(s);
      if (gl.every((l) => n.has(l.id))) {
        gl.forEach((l) => n.delete(l.id));
      } else {
        const others = (lines ?? []).filter((x) => n.has(x.id) && x.group !== gid);
        if (!gl.some((l) => conflictWith(l, others))) gl.forEach((l) => n.add(l.id));
      }
      return n;
    });
  };

  const removeGroup = async (gid: string) => {
    setConfirmDelete(null);
    try {
      setLines(await deleteFlashGroup(gid));
      setSelected((s) => {
        const n = new Set(s);
        (lines ?? []).filter((l) => l.group === gid).forEach((l) => n.delete(l.id));
        return n;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    try {
      setLines(await deleteFlashLine(id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const updateMemory = (m: Record<string, CardMemory>) => {
    setMemory(m);
    saveMemory(m).catch((e) => console.error("Couldn't save flashcard progress:", e));
  };

  if (session) {
    return (
      <FlashSession
        key={session.id}
        initial={session.queue}
        cram={session.cram}
        memory={memory}
        onMemory={updateMemory}
        onExit={() => setSession(null)}
      />
    );
  }

  return (
    <div className="guide-home">
      <BackButton onClick={onHome} />
      <div className="guide-head">
        <h1>Flashcards</h1>
      </div>

      <div className="note">
        Each card shows a position from one of your lines and you play the next move (or moves).
        Cards you get wrong are remembered and come back first. Add lines with the Flashcards
        button in the Openings guide. You can tick several lines at once, as long as they don't
        ask for different moves from you in the same position.
      </div>

      {lines === null && <p className="note">Loading...</p>}
      {lines?.length === 0 && (
        <p className="note">
          No lines yet. Open a line in the Openings guide and press Flashcards.
        </p>
      )}

      <div className="guide-list">
        {[...groups].map(([gid, gl]) => {
          const st = linesStats(gl, memory);
          const isOn = gl.every((l) => selected.has(l.id));
          const others = (lines ?? []).filter((x) => selected.has(x.id) && x.group !== gid);
          const clash = !isOn ? gl.map((l) => conflictWith(l, others)).find(Boolean) : undefined;
          return (
            <div className="guide-entry-row" key={`g-${gid}`}>
              <label className={`guide-entry flash-line ${clash ? "empty" : ""}`}>
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={!!clash}
                  onChange={() => toggleGroup(gid, gl)}
                />
                <span className="guide-entry-name">
                  {gl[0].name}
                  <span className="note"> Repertoire · {gl.length} lines</span>
                  {clash && (
                    <span className="note">
                      {" "}
                      Conflicts with "{clash.name}" (a different move from you in the same position)
                    </span>
                  )}
                </span>
                <span className="eco">{gl[0].side === "white" ? "White" : "Black"}</span>
                <span className="note">
                  {st.cards} cards · {st.due} due · {st.fresh} new
                </span>
                {st.weak > 0 && <span className="guide-badge mine">{st.weak} forgotten</span>}
              </label>
              {confirmDelete === `g:${gid}` ? (
                <button className="danger" onClick={() => removeGroup(gid)}>
                  Remove?
                </button>
              ) : (
                <button
                  className="log-delete"
                  title="Remove these cards (the repertoire stays)"
                  onClick={() => setConfirmDelete(`g:${gid}`)}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {lines?.filter((l) => !l.group).map((l) => {
          const st = lineStats(l, memory);
          const isOn = selected.has(l.id);
          const other = !isOn
            ? conflictWith(l, lines.filter((x) => selected.has(x.id)))
            : undefined;
          return (
            <div className="guide-entry-row" key={l.id}>
              <label className={`guide-entry flash-line ${other ? "empty" : ""}`}>
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={!!other}
                  onChange={() => toggle(l)}
                />
                <span className="guide-entry-name">
                  {l.name}
                  {other && (
                    <span className="note">
                      {" "}
                      Conflicts with "{other.name}" (a different move from you in the same position)
                    </span>
                  )}
                </span>
                <span className="eco">{l.side === "white" ? "White" : "Black"}</span>
                <span className="note">
                  {st.cards} cards · {st.due} due · {st.fresh} new
                </span>
                {st.weak > 0 && <span className="guide-badge mine">{st.weak} forgotten</span>}
              </label>
              {confirmDelete === l.id ? (
                <button className="danger" onClick={() => remove(l.id)}>
                  Remove?
                </button>
              ) : (
                <button className="log-delete" title="Remove line" onClick={() => setConfirmDelete(l.id)}>
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {lines && lines.length > 0 && (
        <div className="setup-card flash-options">
          <div className="guide-controls">
            <div>
              <div className="field-label">Moves per card</div>
              <div className="seg">
                {[1, 2, 3].map((n) => (
                  <button key={n} className={perCard === n ? "selected" : ""} onClick={() => setPerCard(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="field-label">New cards per session</div>
              <select value={newLimit} onChange={(e) => setNewLimit(Number(e.target.value))}>
                {[5, 10, 20, 50, 1000].map((n) => (
                  <option key={n} value={n}>
                    {n === 1000 ? "All" : n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="buttons">
            <button
              className="primary"
              disabled={plan.queue.length === 0}
              onClick={() => setSession({ queue: plan.queue, cram: false, id: Date.now() })}
            >
              Start ({plan.due} due, {plan.fresh} new)
            </button>
            <button
              disabled={cards.length === 0}
              title="Go through every card of the ticked lines, even ones that aren't due. Wrong answers are still remembered."
              onClick={() => setSession({ queue: allCardsShuffled(cards), cram: true, id: Date.now() })}
            >
              Practise all ({cards.length})
            </button>
          </div>
          {chosenLines.length === 0 && <div className="note">Tick at least one line.</div>}
          {chosenLines.length > 0 && plan.queue.length === 0 && (
            <div className="note">Nothing is due right now. You can still practise all cards.</div>
          )}
        </div>
      )}
    </div>
  );
}
