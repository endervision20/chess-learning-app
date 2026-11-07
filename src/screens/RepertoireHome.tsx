import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackButton } from "../components/BackButton";
import { DotsMenu, type MenuItem } from "../components/DotsMenu";
import { Fab } from "../components/Fab";
import { MiniBoard } from "../components/MiniBoard";
import { useFlip, useHoldDrag } from "../lineDrag";
import {
  buildLineInfos,
  firstMoves,
  loadRepView,
  saveRepView,
  type LineInfo,
  type RepView,
} from "../repertoireLines";
import type { LineFolder, Repertoire } from "../types";

interface HomeProps {
  rep: Repertoire;
  first: string | null; // Black repertoires: the White first move being looked at
  onFirst: (first: string | null) => void;
  onOpenLine: (line: LineInfo) => void;
  onAddLines: (startLine: string[]) => void;
  onBack: () => void;
  toolbar: ReactNode; // practise / flashcards
  menuItems: MenuItem[]; // the repertoire's own "⋯" menu (duplicate, export, delete)
  msg: string;
  saveError: boolean;
  onCreateFolder: (name: string, first: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveLine: (line: LineInfo, folderId: string | null) => void;
}

type Dialog = null | { kind: "new" } | { kind: "rename"; id: string } | { kind: "delete"; id: string };

const LIST_PAGE = 300;
const TILE_PAGE = 48; // every tile draws a small board

/**
 * Inside a repertoire.
 * White: every line you've made, each separate.
 * Black: first the 20 White first moves (greyed out if you have nothing against them), then the lines against one.
 * Lines can be kept in folders: press and hold a line, drag it onto a folder.
 */
export function RepertoireHome({
  rep,
  first,
  onFirst,
  onOpenLine,
  onAddLines,
  onBack,
  toolbar,
  menuItems,
  msg,
  saveError,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveLine,
}: HomeProps) {
  const [view, setView] = useState<RepView>(loadRepView);
  const [query, setQuery] = useState("");
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [folderName, setFolderName] = useState("");
  const showFirst = rep.side === "black" && first === null;
  const page = view === "tiles" ? TILE_PAGE : LIST_PAGE;
  const [visible, setVisible] = useState(page);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(page);
  }, [query, view, first, page, openFolder]);

  useEffect(() => {
    setOpenFolder(null);
  }, [first]);

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

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;

  const infos = useMemo(
    () => (showFirst ? [] : buildLineInfos(rep, first)),
    [rep.moves, rep.side, first, showFirst]
  );
  const firsts = useMemo(() => (showFirst ? firstMoves(rep) : []), [rep.moves, rep.side, showFirst]);
  const firstLabel = useMemo(() => {
    if (!first) return "";
    return firstMoves(rep).find((f) => f.uci === first)?.san ?? "";
  }, [first, rep.moves]);

  // ---- Folders (only the ones that belong to what's on screen: for Black, to this first move) ----
  const scopeFolders = useMemo(
    () => (rep.folders ?? []).filter((f) => (f.first ?? null) === first),
    [rep.folders, first]
  );
  const scopeIds = useMemo(() => new Set(scopeFolders.map((f) => f.id)), [scopeFolders]);
  const open = openFolder && scopeIds.has(openFolder) ? openFolder : null;
  const openFolderObj = scopeFolders.find((f) => f.id === open);
  const lineFolder = (l: LineInfo) => (l.folder && scopeIds.has(l.folder) ? l.folder : null);
  const countIn = (id: string) => infos.filter((l) => lineFolder(l) === id).length;
  const countText = (id: string) => {
    const n = countIn(id);
    return `${n} line${n === 1 ? "" : "s"}`;
  };

  // ---- Dragging a line onto a folder ----
  const { drag, hover, start } = useHoldDrag((key, target) => {
    const line = infos.find((l) => l.key === key);
    if (!line) return;
    const dest = target === "root" ? null : target;
    if (dest !== null && !scopeIds.has(dest)) return;
    if (dest === lineFolder(line)) return;
    onMoveLine(line, dest);
  });

  // ---- What is shown ----
  const firstList = firsts.filter((f) =>
    words.every((w) => `${f.san} ${f.opening} ${f.eco}`.toLowerCase().includes(w))
  );
  const shownFolders = open
    ? []
    : scopeFolders.filter((f) => words.every((w) => f.name.toLowerCase().includes(w)));
  const lines = infos.filter((l) => {
    const match = words.every((w) => l.search.includes(w));
    if (open) return lineFolder(l) === open && match;
    if (searching) return match; // searching looks inside folders too
    return lineFolder(l) === null; // otherwise the loose lines (the rest are inside folders)
  });
  // the line being dragged isn't drawn, so the others close the gap
  const visibleLines = lines.filter((l) => l.key !== drag?.key).slice(0, visible);
  const total = showFirst ? firstList.length : lines.length;
  const totalLines = firsts.reduce((s, f) => s + f.lines, 0);
  const orientation = rep.side;

  useFlip(
    listRef,
    [view, open, ...shownFolders.map((f) => f.id), "|", ...visibleLines.map((l) => l.key), "|", drag?.key].join(" ")
  );

  // ---- Folder actions ----
  const folderMenu = (f: LineFolder): MenuItem[] => [
    {
      label: "Rename",
      onClick: () => {
        setFolderName(f.name);
        setDialog({ kind: "rename", id: f.id });
      },
    },
    { label: "Delete folder", danger: true, onClick: () => setDialog({ kind: "delete", id: f.id }) },
  ];

  const fabItems: MenuItem[] = [
    { label: "Edit / add lines", onClick: () => onAddLines(first ? [first] : []) },
    {
      label: "New folder",
      disabled: showFirst,
      title: showFirst ? "Open a first move first: folders group the lines against one first move" : undefined,
      onClick: () => {
        setFolderName("");
        setDialog({ kind: "new" });
      },
    },
  ];

  const submitFolder = () => {
    if (!folderName.trim() || !dialog) return;
    if (dialog.kind === "new") onCreateFolder(folderName, first);
    else if (dialog.kind === "rename") onRenameFolder(dialog.id, folderName);
    setDialog(null);
  };
  const dialogFolder = dialog && dialog.kind !== "new" ? scopeFolders.find((f) => f.id === dialog.id) : undefined;

  const goBack = () => {
    if (open) setOpenFolder(null);
    else if (rep.side === "black" && first !== null) onFirst(null);
    else onBack();
  };

  return (
    <div className="guide-home rep-home">
      <BackButton onClick={goBack} />
      <div className="guide-head">
        <h1>
          {rep.name || "Untitled repertoire"}
          {first !== null && <span className="soon"> · 1. {firstLabel}</span>}
        </h1>
        <span className="eco">{rep.side === "white" ? "White" : "Black"}</span>
        <DotsMenu items={menuItems} title="Repertoire options" />
      </div>

      {first === null && !open && rep.description.trim() && (
        <div className="guide-notes rep-desc">
          <span className="review-note-text">{rep.description}</span>
        </div>
      )}

      {first === null && !open && toolbar}
      {first === null && msg && <div className="note">{msg}</div>}
      {saveError && <div className="error-text">Couldn't save your changes (see console).</div>}

      {openFolderObj && (
        <div className="folder-head">
          <h2>📁 {openFolderObj.name}</h2>
          <DotsMenu items={folderMenu(openFolderObj)} title="Folder options" />
        </div>
      )}

      <input
        className="opening-search big"
        placeholder={
          showFirst ? "Search first moves..." : open ? "Search this folder..." : "Search lines (name, moves, ECO)..."
        }
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
      </div>

      <div className="note">
        {showFirst
          ? `${totalLines} line${totalLines === 1 ? "" : "s"} across ${firsts.filter((f) => f.lines > 0).length} first moves. Greyed-out moves have no lines of yours yet.`
          : `${total.toLocaleString()} line${total === 1 ? "" : "s"}. Click one to learn it move by move.` +
            (scopeFolders.length > 0 ? " Press on a line and drag it off its tile onto a folder." : "")}
      </div>

      {open && (
        <div className={`drop-root ${hover === "root" ? "drop-hover" : ""}`} data-drop="root">
          {drag ? "Drop here to take the line out of this folder" : "Loose lines are on the main list. Drag a line here to move it out."}
        </div>
      )}

      <div ref={listRef} className={view === "tiles" ? "guide-tiles" : "guide-list"}>
        {showFirst &&
          firstList.slice(0, visible).map((f) =>
            view === "tiles" ? (
              <div
                key={f.uci}
                className={`guide-tile ${f.lines > 0 ? "" : "empty"}`}
                onClick={() => onFirst(f.uci)}
              >
                <MiniBoard fen={f.fen} orientation="black" />
                <div className="tile-body">
                  <div className="tile-name">1. {f.san}</div>
                  <div className="tile-meta">
                    {f.eco && <span className="eco">{f.eco}</span>}
                    <span className="guide-badge count">{f.lines} lines</span>
                  </div>
                  {f.opening && <div className="note">{f.opening}</div>}
                </div>
              </div>
            ) : (
              <div key={f.uci} className="guide-entry-row">
                <button
                  className={`guide-entry ${f.lines > 0 ? "" : "empty"}`}
                  onClick={() => onFirst(f.uci)}
                >
                  {f.eco ? <span className="eco">{f.eco}</span> : null}
                  <span className="guide-entry-name">
                    1. {f.san}
                    {f.opening && <span className="note line-text">{f.opening}</span>}
                  </span>
                  <span className="guide-badge count">{f.lines} lines</span>
                </button>
              </div>
            )
          )}

        {!showFirst &&
          shownFolders.map((f) =>
            view === "tiles" ? (
              <div
                key={`f:${f.id}`}
                data-key={`f:${f.id}`}
                data-drop={f.id}
                className={`guide-tile folder-tile ${hover === f.id ? "drop-hover" : ""}`}
                onClick={() => setOpenFolder(f.id)}
              >
                <div className="folder-icon">📁</div>
                <div className="tile-body">
                  <div className="tile-name">{f.name}</div>
                  <div className="tile-meta">
                    <span className="note">{countText(f.id)}</span>
                  </div>
                </div>
                <div className="tile-actions">
                  <DotsMenu items={folderMenu(f)} title="Folder options" />
                </div>
              </div>
            ) : (
              <div
                key={`f:${f.id}`}
                data-key={`f:${f.id}`}
                data-drop={f.id}
                className={`guide-entry-row folder-row ${hover === f.id ? "drop-hover" : ""}`}
              >
                <button className="guide-entry" onClick={() => setOpenFolder(f.id)}>
                  <span className="folder-glyph">📁</span>
                  <span className="guide-entry-name">{f.name}</span>
                  <span className="note">{countText(f.id)}</span>
                </button>
                <DotsMenu items={folderMenu(f)} title="Folder options" />
              </div>
            )
          )}

        {!showFirst &&
          visibleLines.map((l) =>
            view === "tiles" ? (
              <div
                key={l.key}
                data-key={l.key}
                className="guide-tile drag-item"
                onPointerDown={(e) => start(e, l.key, l.name)}
                onClick={() => onOpenLine(l)}
              >
                <MiniBoard fen={l.fen} orientation={orientation} />
                <div className="tile-body">
                  <div className="tile-name">{l.name}</div>
                  <div className="tile-meta">
                    {l.eco && <span className="eco">{l.eco}</span>}
                    <span className="note">{l.ucis.length} moves</span>
                  </div>
                  <div className="note line-text">{l.text}</div>
                </div>
              </div>
            ) : (
              <div
                key={l.key}
                data-key={l.key}
                className="guide-entry-row drag-item"
                onPointerDown={(e) => start(e, l.key, l.name)}
              >
                <button className="guide-entry" onClick={() => onOpenLine(l)}>
                  {l.eco ? <span className="eco">{l.eco}</span> : null}
                  <span className="guide-entry-name">
                    {l.name}
                    <span className="note line-text">{l.text}</span>
                  </span>
                  <span className="note">{l.ucis.length} moves</span>
                </button>
              </div>
            )
          )}

        {total > visible && (
          <button className="show-more" onClick={() => setVisible((v) => v + page)}>
            Show more ({(total - visible).toLocaleString()} left)
          </button>
        )}
      </div>

      {!showFirst && infos.length === 0 && (
        <div className="setup-card gen-box">
          <div className="note">
            {first !== null ? `No lines against 1. ${firstLabel} yet.` : "No lines yet."} Use “+ New” at the bottom
            right to add some.
          </div>
        </div>
      )}
      {!showFirst && open && lines.length === 0 && !searching && (
        <div className="note">
          This folder is empty. Go back, then drag a line onto this folder.
        </div>
      )}
      {!showFirst && total === 0 && shownFolders.length === 0 && infos.length > 0 && searching && (
        <div className="note">No matches.</div>
      )}

      <Fab label="+ New" title="Add lines or make a folder" items={fabItems} />

      {dialog && (dialog.kind === "new" || dialog.kind === "rename") && (
        <div className="guide-overlay" onClick={() => setDialog(null)}>
          <div className="guide-overlay-box rep-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-text">{dialog.kind === "new" ? "New folder" : "Rename folder"}</div>
            {dialog.kind === "new" && (
              <div className="note">
                Folders keep this repertoire's lines organised
                {rep.side === "black" ? ` (this one is for the lines against 1. ${firstLabel})` : ""}, for example
                “Closed Sicilian”, “Alapin” or “Adams Attack”. Then drag a line from the list onto a folder.
              </div>
            )}
            <input
              className="opening-search"
              autoFocus
              placeholder="Folder name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFolder()}
            />
            <div className="confirm-buttons">
              <button className="primary" disabled={!folderName.trim()} onClick={submitFolder}>
                {dialog.kind === "new" ? "Create folder" : "Save"}
              </button>
              <button onClick={() => setDialog(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {dialog && dialog.kind === "delete" && dialogFolder && (
        <div className="guide-overlay" onClick={() => setDialog(null)}>
          <div className="guide-overlay-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-text">Delete the folder “{dialogFolder.name}”?</div>
            <div className="note">Its lines are not deleted. They go back to the main list.</div>
            <div className="confirm-buttons">
              <button
                className="danger"
                onClick={() => {
                  onDeleteFolder(dialogFolder.id);
                  setDialog(null);
                }}
              >
                Delete folder
              </button>
              <button onClick={() => setDialog(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
