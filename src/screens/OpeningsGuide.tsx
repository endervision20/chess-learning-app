import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Key } from "chessground/types";

import { BackButton } from "../components/BackButton";
import { Board } from "../components/Board";
import { MiniBoard } from "../components/MiniBoard";
import { MoveList, type MoveMark } from "../components/MoveList";
import { replay } from "../chessLogic";
import { LESSON_BY_OPENING, type Lesson } from "../data/lessons";
import { sanToUcis, ucisToMoves } from "../lineTools";
import { notesFromPly } from "../notes";
import {
  ROOTS,
  getOpening,
  openingAt,
  rootOf,
  searchWithin,
  variationsOf,
  type OpeningChoice,
} from "../openings";
import { loadFavourites, saveFavourites } from "../storage/favourites";
import { addFlashLine } from "../storage/flashcards";
import { deleteUserLine, loadUserLines, updateUserLine } from "../storage/guideLines";
import type { AnalysisInit, Color, ForcedOpening, UserLine } from "../types";

/** Where you are in the guide. The app keeps it, so coming back from Analysis lands on the same page. */
export interface GuideNav {
  selected: string | null; // the opening being studied
  section: string | null; // the main opening whose variations are listed
}

interface OpeningsGuideProps {
  nav: GuideNav;
  onNav: (nav: GuideNav) => void;
  onHome: () => void;
  onPractise: (opening: ForcedOpening) => void;
  onAnalyse: (init: AnalysisInit) => void;
}

const NO_DESTS = new Map<Key, Key[]>();
const NO_LINES: UserLine[] = [];
const LIST_PAGE = 300;
const TILE_PAGE = 48; // every tile draws a small board, so keep this modest

type View = "list" | "tiles";
type Sort = "az" | "favs";

const VIEW_KEY = "guide-view";
const loadView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "tiles" ? "tiles" : "list";
  } catch {
    return "list";
  }
};

interface StudyLine {
  key: string;
  label: string;
  source: "lesson" | "user" | "main";
  ucis: string[];
  intro?: string;
  notes?: Record<number, string>;
  ideas?: string[];
  user?: UserLine;
}

function buildStudyLines(
  opening: OpeningChoice,
  lesson: Lesson | undefined,
  mine: UserLine[]
): StudyLine[] {
  const out: StudyLine[] = [];
  if (!lesson) {
    out.push({ key: "main", label: "Main line", source: "main", ucis: opening.ucis });
  }
  if (lesson) {
    for (const l of lesson.lines) {
      out.push({
        key: `lesson:${l.name}`,
        label: l.name,
        source: "lesson",
        ucis: sanToUcis(l.moves),
        intro: l.intro,
        notes: l.notes,
        ideas: l.ideas,
      });
    }
  }
  for (const u of mine) {
    out.push({
      key: `user:${u.id}`,
      label: u.name,
      source: "user",
      ucis: u.ucis,
      intro: u.note || undefined,
      notes: u.notes,
      user: u,
    });
  }
  return out;
}

const guessSide = (name: string, lesson?: Lesson): Color =>
  lesson ? lesson.side : /defen[cs]e/i.test(name) ? "black" : "white";

// The position an opening ends in (for tile thumbnails)
const FEN_CACHE = new Map<string, string>();
function finalFen(o: OpeningChoice): string {
  let fen = FEN_CACHE.get(o.name);
  if (!fen) {
    const { plies } = replay(ucisToMoves(o.ucis));
    fen = plies[plies.length - 1].fen;
    FEN_CACHE.set(o.name, fen);
  }
  return fen;
}

const MAIN_HINT =
  "No lesson for this opening yet. Step through the moves, practise it against Stockfish, analyse it, or add your own line from the Analysis screen.";

// ---------------------------------------------------------------------------
// Study view for one opening
// ---------------------------------------------------------------------------
function OpeningStudy({
  opening,
  userLines,
  favourite,
  onToggleFavourite,
  onBack,
  onPractise,
  onAnalyse,
  onChanged,
}: {
  opening: OpeningChoice;
  userLines: UserLine[];
  favourite: boolean;
  onToggleFavourite: () => void;
  onBack: () => void;
  onPractise: (o: ForcedOpening) => void;
  onAnalyse: (init: AnalysisInit) => void;
  onChanged: () => void;
}) {
  const lesson = LESSON_BY_OPENING.get(opening.name);
  const lines = useMemo(
    () => buildStudyLines(opening, lesson, userLines),
    [opening, lesson, userLines]
  );

  const [lineIndex, setLineIndex] = useState(0);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Color>(
    () => lines[0]?.user?.side ?? guessSide(opening.name, lesson)
  );
  const [confirming, setConfirming] = useState(false);
  const [flashMsg, setFlashMsg] = useState("");

  // Editing one of your own lines: a draft of its name, side and notes
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    side: Color;
    intro: string;
    notes: Record<number, string>;
  } | null>(null);
  const [saveError, setSaveError] = useState("");

  const line = lines[Math.min(lineIndex, lines.length - 1)];
  const moves = useMemo(() => ucisToMoves(line.ucis), [line]);
  const built = useMemo(() => replay(moves), [moves]);
  const fens = useMemo(() => built.plies.map((p) => p.fen), [built]);
  const total = moves.length;

  const goTo = (i: number) => setPly(Math.max(0, Math.min(total, i)));
  const flip = () => setOrientation((o) => (o === "white" ? "black" : "white"));
  const chooseLine = (i: number) => {
    setLineIndex(i);
    setPly(0);
    setConfirming(false);
    setEditing(false);
    setFlashMsg("");
    const u = lines[i].user;
    if (u) setOrientation(u.side);
  };

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

  const here = built.plies[ply];
  const last = ply > 0 ? moves[ply - 1] : undefined;
  const current = openingAt(fens, ply);

  const savedNote = ply === 0 ? line.intro : line.notes?.[ply];
  const note =
    savedNote ??
    (line.source === "main"
      ? MAIN_HINT
      : line.source === "user"
      ? ""
      : "Keep stepping through the line (arrow keys work too).");

  // a 📝 beside every move that has a note
  const marks = useMemo<(MoveMark | undefined)[]>(
    () =>
      moves.map((_, i) => {
        const text = line.notes?.[i + 1];
        return text ? { text: "📝", cls: "notemark", title: text } : undefined;
      }),
    [moves, line]
  );

  const lineName = line.source === "lesson" || line.source === "user"
    ? `${opening.name}: ${line.label}`
    : opening.name;

  const practise = () =>
    onPractise({
      name: lineName,
      eco: opening.eco,
      ucis: line.ucis,
      mode: line.source === "main" ? "variations" : "exact",
    });

  const analyse = (edit: boolean) =>
    onAnalyse({
      moves,
      ply: edit ? total : ply,
      orientation,
      ...(line.user
        ? {
            notes: notesFromPly(line.ucis, line.user.notes, line.user.note),
            editLine: edit ? line.user : undefined,
          }
        : {}),
    });

  // Flashcards are for the side the board is shown from
  const addFlash = async () => {
    try {
      const added = await addFlashLine({
        name: lineName,
        opening: opening.name,
        ucis: line.ucis,
        side: orientation,
      });
      setFlashMsg(
        added
          ? `Added to flashcards (as ${orientation}).`
          : `Already in your flashcards (as ${orientation}).`
      );
    } catch (e) {
      console.error("Couldn't add to flashcards:", e);
      setFlashMsg("Couldn't add it (see console).");
    }
  };

  const remove = async () => {
    if (!line.user) return;
    try {
      await deleteUserLine(line.user.id);
    } catch (e) {
      console.error("Couldn't delete the line:", e);
    }
    setConfirming(false);
    setLineIndex(0);
    setPly(0);
    onChanged();
  };

  // ---- editing your own line ----
  const startEdit = () => {
    if (!line.user) return;
    setDraft({
      name: line.user.name,
      side: line.user.side,
      intro: line.user.note ?? "",
      notes: { ...(line.user.notes ?? {}) },
    });
    setSaveError("");
    setEditing(true);
  };

  const draftNote = draft ? (ply === 0 ? draft.intro : draft.notes[ply] ?? "") : "";
  const setDraftNote = (text: string) =>
    setDraft((d) => {
      if (!d) return d;
      if (ply === 0) return { ...d, intro: text };
      return { ...d, notes: { ...d.notes, [ply]: text } };
    });

  const saveEdit = async () => {
    if (!line.user || !draft) return;
    const notes: Record<number, string> = {};
    for (const [p, t] of Object.entries(draft.notes)) if (t.trim()) notes[Number(p)] = t.trim();
    try {
      await updateUserLine(line.user.id, {
        name: draft.name.trim() || line.user.name,
        side: draft.side,
        note: draft.intro.trim(),
        notes,
      });
      setOrientation(draft.side);
      setEditing(false);
      onChanged();
    } catch (e) {
      console.error("Couldn't save the line:", e);
      setSaveError("Couldn't save (see console).");
    }
  };

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
          resync={0}
          onMove={() => {}}
        />
        <div className="bar-spacer" />
      </div>

      <div className="side-panel wide">
        <div className="status">
          <span>
            {opening.eco} · {opening.name}
          </span>
          <button
            className={`fav-btn ${favourite ? "on" : ""}`}
            title={favourite ? "Remove from favourites" : "Add to favourites"}
            onClick={onToggleFavourite}
          >
            ★
          </button>
        </div>

        {lines.length > 1 && (
          <div className="line-tabs">
            {lines.map((l, i) => (
              <button
                key={l.key}
                className={i === lineIndex ? "selected" : ""}
                onClick={() => chooseLine(i)}
              >
                {l.source === "user" ? "★ " : ""}
                {l.label}
              </button>
            ))}
          </div>
        )}

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
        </div>

        <div className="guide-notes">
          {editing && draft ? (
            <div className="line-editor">
              <input
                className="opening-search"
                value={draft.name}
                placeholder="Line name"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="seg">
                {(["white", "black"] as const).map((c) => (
                  <button
                    key={c}
                    className={draft.side === c ? "selected" : ""}
                    onClick={() => setDraft({ ...draft, side: c })}
                  >
                    {c === "white" ? "Shown as White" : "Shown as Black"}
                  </button>
                ))}
              </div>
              <div className="field-label">
                Note on {ply === 0 ? "the starting position" : `move ${ply}`}
              </div>
              <textarea
                className="paste-box"
                rows={3}
                placeholder="Step through the moves to write a note for each one"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
              />
              {saveError && <div className="error-text">{saveError}</div>}
              <div className="buttons">
                <button className="primary" onClick={saveEdit}>Save</button>
                <button onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="guide-note">
                {note || <span className="note">No note on this move.</span>}
              </div>
              {line.ideas && line.ideas.length > 0 && (
                <>
                  <div className="guide-ideas-title">Key ideas</div>
                  <ul>
                    {line.ideas.map((idea) => (
                      <li key={idea}>{idea}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        <MoveList
          sans={built.sans}
          moves={moves}
          viewIndex={ply}
          timed={false}
          onSelect={goTo}
          marks={marks}
        />

        <div className="buttons">
          <button className="primary" onClick={practise}>
            Practise vs Stockfish
          </button>
          <button onClick={() => analyse(false)} title="Open this line in the analysis board">
            Analyse
          </button>
          <button
            onClick={addFlash}
            title="Add this line to your flashcards (you play the side the board is shown from)"
          >
            Flashcards
          </button>
          <button onClick={flip}>Flip (F)</button>
          {line.user && !editing && (
            <>
              <button onClick={startEdit} title="Change its name, side and notes">
                Edit
              </button>
              <button
                onClick={() => analyse(true)}
                title="Open it in Analysis to change the moves, then save the changes"
              >
                Edit moves
              </button>
              <button onClick={() => setConfirming(true)}>Remove my line</button>
            </>
          )}
        </div>
        {flashMsg && <div className="note">{flashMsg}</div>}
      </div>

      {confirming && line.user && (
        <div className="guide-overlay" onClick={() => setConfirming(false)}>
          <div className="guide-overlay-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-text">Delete “{line.user.name}”?</div>
            <div className="note">This removes the line and its notes.</div>
            <div className="confirm-buttons">
              <button className="danger" onClick={remove}>
                Delete line
              </button>
              <button onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A searchable list / tiles of openings (used for the main list and for a section)
// ---------------------------------------------------------------------------
function Browser({
  title,
  onBack,
  headerExtra,
  items,
  labelOf,
  hasContent,
  badgesOf,
  onSelect,
  favSet,
  toggleFavourite,
  view,
  changeView,
  noun,
}: {
  title: string;
  onBack: () => void;
  headerExtra?: ReactNode;
  items: OpeningChoice[];
  labelOf: (o: OpeningChoice) => string;
  hasContent: (o: OpeningChoice) => boolean;
  badgesOf: (o: OpeningChoice) => ReactNode;
  onSelect: (o: OpeningChoice) => void;
  favSet: Set<string>;
  toggleFavourite: (name: string) => void;
  view: View;
  changeView: (v: View) => void;
  noun: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("az");
  const [favsOnly, setFavsOnly] = useState(false);
  const page = view === "tiles" ? TILE_PAGE : LIST_PAGE;
  const [visible, setVisible] = useState(page);

  useEffect(() => {
    setVisible(page);
  }, [query, view, sort, favsOnly, page]);

  const results = useMemo(() => {
    let all = searchWithin(items, query);
    if (favsOnly) all = all.filter((o) => favSet.has(o.name));
    const groups: OpeningChoice[][] =
      sort === "favs"
        ? [
            all.filter((o) => favSet.has(o.name)),
            all.filter((o) => !favSet.has(o.name) && hasContent(o)),
            all.filter((o) => !favSet.has(o.name) && !hasContent(o)),
          ]
        : [all.filter(hasContent), all.filter((o) => !hasContent(o))];
    return groups.flat();
  }, [items, query, favsOnly, sort, favSet, hasContent]);

  const star = (o: OpeningChoice) => (
    <button
      className={`fav-btn ${favSet.has(o.name) ? "on" : ""}`}
      title={favSet.has(o.name) ? "Remove from favourites" : "Add to favourites"}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavourite(o.name);
      }}
    >
      ★
    </button>
  );

  return (
    <div className="guide-home">
      <BackButton onClick={onBack} />
      <div className="guide-head">
        <h1>{title}</h1>
      </div>
      {headerExtra}

      <input
        className="opening-search big"
        autoFocus
        placeholder={`Search ${noun}...`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="guide-controls">
        <div className="seg">
          <button className={view === "list" ? "selected" : ""} onClick={() => changeView("list")}>
            ☰ List
          </button>
          <button className={view === "tiles" ? "selected" : ""} onClick={() => changeView("tiles")}>
            ▦ Tiles
          </button>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="az">A-Z (ones with lessons and your lines first)</option>
          <option value="favs">Favourites first</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={favsOnly}
            onChange={(e) => setFavsOnly(e.target.checked)}
          />
          ★ Favourites only
        </label>
      </div>

      <div className="note">
        {results.length.toLocaleString()} {query || favsOnly ? `matching ${noun}` : noun}. Greyed-out ones
        have no lesson or line of yours yet, but you can still open them to see the position.
      </div>

      <div className={view === "tiles" ? "guide-tiles" : "guide-list"}>
        {results.slice(0, visible).map((o) =>
          view === "tiles" ? (
            <div
              key={o.name}
              className={`guide-tile ${hasContent(o) ? "" : "empty"}`}
              onClick={() => onSelect(o)}
            >
              <MiniBoard
                fen={finalFen(o)}
                orientation={guessSide(o.name, LESSON_BY_OPENING.get(o.name))}
              />
              <div className="tile-body">
                <div className="tile-name">{labelOf(o)}</div>
                <div className="tile-meta">
                  <span className="eco">{o.eco}</span>
                  {badgesOf(o)}
                </div>
              </div>
              {star(o)}
            </div>
          ) : (
            <div key={o.name} className="guide-entry-row">
              <button
                className={`guide-entry ${hasContent(o) ? "" : "empty"}`}
                onClick={() => onSelect(o)}
              >
                <span className="eco">{o.eco}</span>
                <span className="guide-entry-name">{labelOf(o)}</span>
                {badgesOf(o)}
              </button>
              {star(o)}
            </div>
          )
        )}
        {results.length > visible && (
          <button className="show-more" onClick={() => setVisible((v) => v + page)}>
            Show more ({(results.length - visible).toLocaleString()} left)
          </button>
        )}
        {results.length === 0 && <div className="note">No matches.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The guide: main openings -> (click one) its variations -> (click one) study
// ---------------------------------------------------------------------------
export function OpeningsGuide({ nav, onNav, onHome, onPractise, onAnalyse }: OpeningsGuideProps) {
  const { selected, section } = nav;
  const [userLines, setUserLines] = useState<UserLine[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [view, setView] = useState<View>(loadView);

  const reload = () => {
    loadUserLines().then(setUserLines).catch(console.error);
  };
  useEffect(() => {
    reload();
    loadFavourites().then(setFavs).catch(console.error);
  }, []);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* the choice just won't be remembered */
    }
  };

  const favSet = useMemo(() => new Set(favs), [favs]);
  const toggleFavourite = (name: string) => {
    const next = favSet.has(name) ? favs.filter((n) => n !== name) : [...favs, name];
    setFavs(next);
    saveFavourites(next).catch((e) => console.error("Couldn't save favourites:", e));
  };

  const mine = useMemo(() => {
    const m = new Map<string, UserLine[]>();
    for (const u of userLines) {
      const arr = m.get(u.opening);
      if (arr) arr.push(u);
      else m.set(u.opening, [u]);
    }
    return m;
  }, [userLines]);

  const ownContent = (name: string) => LESSON_BY_OPENING.has(name) || mine.has(name);

  // Main openings that have a lesson or a line of yours anywhere inside them
  const contentRoots = useMemo(() => {
    const s = new Set<string>();
    for (const n of LESSON_BY_OPENING.keys()) s.add(rootOf(n));
    for (const n of mine.keys()) s.add(rootOf(n));
    return s;
  }, [mine]);

  const ownBadges = (o: OpeningChoice) => {
    const mineCount = mine.get(o.name)?.length ?? 0;
    return (
      <>
        {LESSON_BY_OPENING.has(o.name) && <span className="guide-badge">Lesson</span>}
        {mineCount > 0 && <span className="guide-badge mine">{mineCount} of yours</span>}
      </>
    );
  };

  // ---- Study view ----
  const opening = selected ? getOpening(selected) : undefined;
  if (opening) {
    return (
      <OpeningStudy
        key={opening.name}
        opening={opening}
        userLines={mine.get(opening.name) ?? NO_LINES}
        favourite={favSet.has(opening.name)}
        onToggleFavourite={() => toggleFavourite(opening.name)}
        onBack={() => onNav({ ...nav, selected: null })}
        onPractise={onPractise}
        onAnalyse={onAnalyse}
        onChanged={reload}
      />
    );
  }

  // ---- One main opening: all of its variations ----
  const rootOpening = section ? getOpening(section) : undefined;
  if (rootOpening) {
    const items = variationsOf(rootOpening.name);
    const prefixLen = rootOpening.name.length + 2;
    return (
      <Browser
        key={rootOpening.name}
        title={rootOpening.name}
        onBack={() => onNav({ selected: null, section: null })}
        headerExtra={
          <div className="guide-section-head">
            <button
              className="primary"
              onClick={() => onNav({ ...nav, selected: rootOpening.name })}
            >
              Study {rootOpening.name}
            </button>
            {ownBadges(rootOpening)}
            <span className="note">{items.length.toLocaleString()} variations below</span>
          </div>
        }
        items={items}
        labelOf={(o) => o.name.slice(prefixLen)}
        hasContent={(o) => ownContent(o.name)}
        badgesOf={ownBadges}
        onSelect={(o) => onNav({ ...nav, selected: o.name })}
        favSet={favSet}
        toggleFavourite={toggleFavourite}
        view={view}
        changeView={changeView}
        noun="variations"
      />
    );
  }

  // ---- The main list: only the major openings ----
  return (
    <Browser
      key="home"
      title="Openings guide"
      onBack={onHome}
      items={ROOTS}
      labelOf={(o) => o.name}
      hasContent={(o) => contentRoots.has(o.name)}
      badgesOf={(o) => {
        const n = variationsOf(o.name).length;
        return (
          <>
            {ownBadges(o)}
            {contentRoots.has(o.name) && !ownContent(o.name) && (
              <span className="guide-badge">Has content</span>
            )}
            {n > 0 && <span className="guide-badge count">{n} variations</span>}
          </>
        );
      }}
      onSelect={(o) => {
        if (variationsOf(o.name).length > 0) onNav({ selected: null, section: o.name });
        else onNav({ selected: o.name, section: null });
      }}
      favSet={favSet}
      toggleFavourite={toggleFavourite}
      view={view}
      changeView={changeView}
      noun="openings"
    />
  );
}
