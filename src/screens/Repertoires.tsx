import { useEffect, useMemo, useRef, useState } from "react";
import { BackButton } from "../components/BackButton";
import { DotsMenu } from "../components/DotsMenu";
import { Fab } from "../components/Fab";
import { MiniBoard } from "../components/MiniBoard";
import { RepExportDialog } from "../components/RepExportDialog";
import {
  countMoves,
  duplicateRepertoire,
  newRepertoire,
  parseImport,
  playableLines,
} from "../repertoireLogic";
import { loadRepView, previewFen, saveRepView, type RepView } from "../repertoireLines";
import { deleteFlashGroup } from "../storage/flashcards";
import { deleteRepertoire, listRepertoires, saveRepertoire } from "../storage/repertoires";
import type { Color, Repertoire } from "../types";

interface RepertoiresProps {
  onBack: () => void;
  onOpen: (id: string) => void;
}

type Sort = "recent" | "name" | "white" | "black";
const SORT_LABEL: Record<Sort, string> = {
  recent: "Recently edited",
  name: "Name (A-Z)",
  white: "White repertoires first",
  black: "Black repertoires first",
};

type Dialog = null | "create" | "import";

const byName = (a: Repertoire, b: Repertoire) => a.name.localeCompare(b.name);

/** Favourites always come first; the chosen sort orders each group. */
function sortReps(list: Repertoire[], sort: Sort): Repertoire[] {
  const inner = (a: Repertoire, b: Repertoire) => {
    if (sort === "name") return byName(a, b);
    if (sort === "white" || sort === "black") {
      return Number(b.side === sort) - Number(a.side === sort) || byName(a, b);
    }
    return b.updated.localeCompare(a.updated);
  };
  return [...list].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || inner(a, b));
}

/** The repertoire builder's main screen: all your repertoires. New ones are made from the button at the bottom right. */
export function Repertoires({ onBack, onOpen }: RepertoiresProps) {
  const [reps, setReps] = useState<Repertoire[] | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<RepView>(loadRepView);
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState<Repertoire | null>(null);
  const [deleting, setDeleting] = useState<Repertoire | null>(null);

  // the "new" window
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [side, setSide] = useState<Color>("white");
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importSide, setImportSide] = useState<Color | "auto">("auto");
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () =>
    listRepertoires()
      .then(setReps)
      .catch((e) => {
        console.error("Couldn't read the repertoires:", e);
        setError("Couldn't read your repertoires (see console).");
        setReps([]);
      });

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDialog(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  const changeView = (v: RepView) => {
    setView(v);
    saveRepView(v);
  };

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = (reps ?? []).filter((r) => {
      const hay = `${r.name} ${r.description}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return sortReps(filtered, sort);
  }, [reps, sort, query]);

  const create = async () => {
    const rep = newRepertoire(name.trim() || "New repertoire", side);
    rep.description = description.trim();
    try {
      await saveRepertoire(rep);
      setDialog(null);
      setName("");
      setDescription("");
      onOpen(rep.id);
    } catch (e) {
      console.error("Couldn't create the repertoire:", e);
      setError("Couldn't create it (see console).");
      setDialog(null);
    }
  };

  const toggleFavourite = async (r: Repertoire) => {
    const next = { ...r, favorite: !r.favorite };
    setReps((list) => (list ?? []).map((x) => (x.id === r.id ? next : x))); // show it straight away
    try {
      await saveRepertoire(next);
    } catch (e) {
      console.error("Couldn't save the favourite:", e);
      reload();
    }
  };

  const duplicate = async (r: Repertoire) => {
    try {
      await saveRepertoire(duplicateRepertoire(r));
    } catch (e) {
      console.error(e);
    }
    reload();
  };

  const remove = async (r: Repertoire) => {
    setDeleting(null);
    await deleteRepertoire(r.id);
    deleteFlashGroup(r.id).catch(() => {});
    reload();
  };

  const doImport = async () => {
    try {
      const { rep, dropped, format } = parseImport(importText);
      if (importName.trim()) rep.name = importName.trim();
      if (importSide !== "auto") rep.side = importSide;
      await saveRepertoire(rep);
      setImportMsg(
        `Imported “${rep.name}” from ${format.toUpperCase()}: ${playableLines(rep.moves, rep.side).length} lines` +
          (dropped ? ` (${dropped} illegal or unreadable moves were left out)` : "") +
          "."
      );
      setImportText("");
      setImportName("");
      reload();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Couldn't read that.");
    }
  };

  const sideLabel = (r: Repertoire) => (r.side === "white" ? "White" : "Black");
  const lineCount = (r: Repertoire) => playableLines(r.moves, r.side).length;

  const star = (r: Repertoire) => (
    <button
      className={`fav-btn ${r.favorite ? "on" : ""}`}
      title={r.favorite ? "Remove from favourites" : "Add to favourites"}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavourite(r);
      }}
    >
      ★
    </button>
  );

  const menu = (r: Repertoire) => (
    <DotsMenu
      items={[
        { label: "Duplicate", onClick: () => duplicate(r) },
        { label: "Export…", onClick: () => setExporting(r) },
        { label: "Delete", danger: true, onClick: () => setDeleting(r) },
      ]}
    />
  );

  return (
    <div className="menu rep-page">
      <BackButton onClick={onBack} />
      <h1>Repertoire builder</h1>
      <div className="note">
        Build full opening repertoires with as many lines as you like, add notes to every move, then
        study them, drill them as flashcards or play them out against Stockfish.
      </div>

      {error && <p className="error-text">{error}</p>}
      {reps === null && <p className="note">Loading...</p>}

      {reps && reps.length > 0 && (
        <div className="recent">
          <input
            className="opening-search"
            placeholder="Search repertoires (name or description)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="guide-controls rep-controls">
            <div className="seg">
              <button className={view === "list" ? "selected" : ""} onClick={() => changeView("list")}>
                ☰ List
              </button>
              <button className={view === "tiles" ? "selected" : ""} onClick={() => changeView("tiles")}>
                ▦ Tiles
              </button>
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          {view === "tiles" ? (
            <div className="guide-tiles rep-tiles">
              {shown.map((r) => (
                <div className="guide-tile" key={r.id} onClick={() => onOpen(r.id)}>
                  <MiniBoard fen={previewFen(r)} orientation={r.side} />
                  <div className="tile-body">
                    <div className="tile-name">{r.name}</div>
                    {r.description.trim() && <div className="rep-desc-tile">{r.description}</div>}
                    <div className="tile-meta">
                      <span className="eco">{sideLabel(r)}</span>
                      <span className="note">{lineCount(r)} lines</span>
                    </div>
                  </div>
                  {star(r)}
                  <div className="tile-actions">{menu(r)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="game-log">
              {shown.map((r) => (
                <div className="guide-entry-row" key={r.id}>
                  {star(r)}
                  <button className="guide-entry" onClick={() => onOpen(r.id)}>
                    <span className="eco">{sideLabel(r)}</span>
                    <span className="guide-entry-name">
                      {r.name}
                      {r.description.trim() && <span className="rep-desc-list">{r.description}</span>}
                    </span>
                    <span className="note">
                      {lineCount(r)} lines · {countMoves(r.moves)} moves
                    </span>
                  </button>
                  {menu(r)}
                </div>
              ))}
            </div>
          )}
          {shown.length === 0 && <p className="note">No matches.</p>}
        </div>
      )}
      {reps && reps.length === 0 && !error && (
        <p className="note">No repertoires yet. Press “+ New” at the bottom right to create or import one.</p>
      )}

      <Fab
        label="+ New"
        title="Create or import a repertoire"
        onClick={() => {
          setImportMsg("");
          setDialog("create");
        }}
      />

      {exporting && <RepExportDialog rep={exporting} onClose={() => setExporting(null)} />}

      {deleting && (
        <div className="guide-overlay" onClick={() => setDeleting(null)}>
          <div className="guide-overlay-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-text">Delete “{deleting.name}”?</div>
            <div className="note">This removes the repertoire and its flashcards. Export it first to keep a copy.</div>
            <div className="confirm-buttons">
              <button className="danger" onClick={() => remove(deleting)}>
                Delete repertoire
              </button>
              <button onClick={() => setDeleting(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <div className="guide-overlay" onClick={() => setDialog(null)}>
          <div className="guide-overlay-box rep-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="seg">
              <button className={dialog === "create" ? "selected" : ""} onClick={() => setDialog("create")}>
                New repertoire
              </button>
              <button className={dialog === "import" ? "selected" : ""} onClick={() => setDialog("import")}>
                Import
              </button>
            </div>

            {dialog === "create" ? (
              <>
                <input
                  className="opening-search"
                  autoFocus
                  placeholder="Name (e.g. Sicilian Najdorf, London System)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                />
                <textarea
                  className="paste-box"
                  rows={3}
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="seg">
                  {(["white", "black"] as const).map((c) => (
                    <button key={c} className={side === c ? "selected" : ""} onClick={() => setSide(c)}>
                      {c === "white" ? "For White" : "For Black"}
                    </button>
                  ))}
                </div>
                <div className="confirm-buttons">
                  <button className="primary" onClick={create}>
                    Create
                  </button>
                  <button onClick={() => setDialog(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="note">
                  Choose a file, or paste text, from this app's JSON export or a PGN with variations (for
                  example a Lichess study).
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.pgn,.txt,application/json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) f.text().then(setImportText).catch(console.error);
                    e.target.value = "";
                  }}
                />
                <textarea
                  className="paste-box"
                  rows={6}
                  placeholder="…or paste the export here"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <input
                  className="opening-search"
                  placeholder="Name (optional, otherwise taken from the file)"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
                <select value={importSide} onChange={(e) => setImportSide(e.target.value as Color | "auto")}>
                  <option value="auto">Side: from the file (White if it doesn't say)</option>
                  <option value="white">Side: White</option>
                  <option value="black">Side: Black</option>
                </select>
                {importMsg && <div className="note">{importMsg}</div>}
                <div className="confirm-buttons">
                  <button className="primary" disabled={!importText.trim()} onClick={doImport}>
                    Import
                  </button>
                  <button onClick={() => setDialog(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
