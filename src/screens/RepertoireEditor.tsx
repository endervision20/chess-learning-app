import { useEffect, useRef, useState } from "react";

import { BackButton } from "../components/BackButton";
import type { MenuItem } from "../components/DotsMenu";
import { RepExportDialog } from "../components/RepExportDialog";
import {
  duplicateRepertoire,
  newId,
  playableLines,
  setLineFolder,
  stripFolder,
} from "../repertoireLogic";
import type { LineInfo } from "../repertoireLines";
import { deleteFlashGroup, replaceFlashGroup } from "../storage/flashcards";
import { deleteRepertoire, loadRepertoire, saveRepertoire } from "../storage/repertoires";
import type { Color, ForcedOpening, Repertoire } from "../types";
import { RepertoireBuilder } from "./RepertoireBuilder";
import { RepertoireHome } from "./RepertoireHome";
import { RepertoireStudy } from "./RepertoireStudy";

interface EditorProps {
  id: string;
  onBack: () => void;
  onOpen: (id: string) => void; // open another repertoire (after duplicating)
  onPractise: (opening: ForcedOpening, side: Color) => void;
}

/** Loads the repertoire, then hands it to the screens. */
export function RepertoireEditor(props: EditorProps) {
  const [rep, setRep] = useState<Repertoire | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRepertoire(props.id)
      .then(setRep)
      .catch((e) => {
        console.error("Couldn't open the repertoire:", e);
        setError("Couldn't open this repertoire (see console).");
      });
  }, [props.id]);

  if (error || !rep) {
    return (
      <div className="config">
        <BackButton onClick={props.onBack} />
        {error ? <p className="error-text">{error}</p> : <p className="note">Loading...</p>}
      </div>
    );
  }
  return <Body initial={rep} {...props} />;
}

type Page =
  | { kind: "home" }
  | { kind: "study"; line: LineInfo }
  | { kind: "build"; at: string[] };

function Body({ initial, onBack, onOpen, onPractise }: EditorProps & { initial: Repertoire }) {
  const [rep, setRep] = useState<Repertoire>(initial);
  const [page, setPage] = useState<Page>({ kind: "home" });
  const [first, setFirst] = useState<string | null>(null); // Black: the White first move being looked at
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [msg, setMsg] = useState("");
  const [saveError, setSaveError] = useState(false);

  // ---- Saving: every change is saved shortly afterwards, and when you leave ----
  const latest = useRef(initial);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const r = latest.current;
    saveRepertoire({ ...r, name: r.name.trim() || "Untitled repertoire" })
      .then(() => setSaveError(false))
      .catch((e) => {
        console.error("Couldn't save the repertoire:", e);
        setSaveError(true);
      });
  };
  useEffect(() => () => flush(), []);

  const change = (fn: (r: Repertoire) => Repertoire) => {
    const next = { ...fn(latest.current), updated: new Date().toISOString() };
    latest.current = next;
    setRep(next);
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 500);
  };

  // ---- Folders ----
  const createFolder = (name: string, firstMove: string | null) =>
    change((r) => ({
      ...r,
      folders: [...(r.folders ?? []), { id: newId(), name: name.trim(), ...(firstMove ? { first: firstMove } : {}) }],
    }));

  const renameFolder = (id: string, name: string) =>
    change((r) => ({ ...r, folders: (r.folders ?? []).map((f) => (f.id === id ? { ...f, name: name.trim() } : f)) }));

  const deleteFolder = (id: string) =>
    change((r) => ({
      ...r,
      folders: (r.folders ?? []).filter((f) => f.id !== id),
      moves: stripFolder(r.moves, id),
    }));

  const moveLine = (line: LineInfo, folderId: string | null) =>
    change((r) => ({ ...r, moves: setLineFolder(r.moves, line.ucis, folderId) }));

  // ---- Using the repertoire ----
  const practiseLines = (lines: string[][], label: string) => {
    flush();
    onPractise({ name: `Repertoire: ${label}`, eco: "", ucis: [], mode: "variations", lines }, rep.side);
  };

  const practiseAll = () => {
    const lines = playableLines(rep.moves, rep.side);
    if (lines.length === 0) {
      setMsg("Add some lines first.");
      return;
    }
    practiseLines(lines, rep.name);
  };

  const addFlash = async () => {
    const lines = playableLines(rep.moves, rep.side);
    if (lines.length === 0) {
      setMsg("Add some lines first.");
      return;
    }
    try {
      await replaceFlashGroup(
        rep.id,
        lines.map((ucis) => ({ name: rep.name, opening: rep.name, ucis, side: rep.side }))
      );
      setMsg(
        `${lines.length} lines are in your flashcards (you play ${rep.side}). Press this again after editing to update them; your progress is kept.`
      );
    } catch (e) {
      console.error("Couldn't add to flashcards:", e);
      setMsg("Couldn't add it to flashcards (see console).");
    }
  };

  const duplicate = async () => {
    flush();
    try {
      const copy = duplicateRepertoire(latest.current);
      await saveRepertoire(copy);
      onOpen(copy.id);
    } catch (e) {
      console.error("Couldn't duplicate:", e);
      setMsg("Couldn't duplicate it (see console).");
    }
  };

  const removeRep = async () => {
    dirty.current = false;
    window.clearTimeout(timer.current);
    await deleteRepertoire(rep.id);
    deleteFlashGroup(rep.id).catch(() => {});
    onBack();
  };

  const toolbar = (
    <div className="rep-toolbar">
      <div className="buttons">
        <button className="primary" onClick={practiseAll}>
          Practise vs Stockfish
        </button>
        <button
          onClick={addFlash}
          title="Put every line of this repertoire into your flashcards (any of your repertoire moves counts as right)"
        >
          Flashcards
        </button>
      </div>
    </div>
  );

  const menuItems: MenuItem[] = [
    { label: "Edit name / description", onClick: () => setEditingDetails(true) },
    { label: "Duplicate", onClick: duplicate },
    { label: "Export…", onClick: () => setExporting(true) },
    { label: "Delete repertoire", danger: true, onClick: () => setConfirmDelete(true) },
  ];

  let content;
  if (page.kind === "study") {
    content = (
      <RepertoireStudy
        key={page.line.key}
        rep={rep}
        line={page.line}
        onBack={() => setPage({ kind: "home" })}
        onEdit={(ply) => setPage({ kind: "build", at: page.line.ucis.slice(0, ply) })}
        onPractise={(ucis, name) => practiseLines([ucis], name)}
      />
    );
  } else if (page.kind === "build") {
    content = (
      <RepertoireBuilder
        key="build"
        rep={rep}
        change={change}
        saveError={saveError}
        startLine={page.at}
        onEditDetails={() => setEditingDetails(true)}
        onBack={() => {
          flush();
          setPage({ kind: "home" });
        }}
      />
    );
  } else {
    content = (
      <RepertoireHome
        rep={rep}
        first={first}
        onFirst={setFirst}
        onOpenLine={(line) => setPage({ kind: "study", line })}
        onAddLines={(at) => setPage({ kind: "build", at })}
        onBack={onBack}
        toolbar={toolbar}
        menuItems={menuItems}
        msg={msg}
        saveError={saveError}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveLine={moveLine}
      />
    );
  }

  return (
    <>
      {content}

      {confirmDelete && page.kind === "home" && (
        <div className="guide-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="guide-overlay-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-text">Delete “{rep.name}”?</div>
            <div className="note">
              This removes the repertoire and its flashcards. Export it first to keep a copy.
            </div>
            <div className="confirm-buttons">
              <button className="danger" onClick={removeRep}>
                Delete repertoire
              </button>
              <button onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingDetails && (
        <div className="guide-overlay" onClick={() => setEditingDetails(false)}>
          <div
            className="guide-overlay-box"
            style={{ width: "min(520px, 92vw)" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="field-label">Name</div>
            <input
              className="opening-search"
              value={rep.name}
              placeholder="Repertoire name"
              onChange={(ev) => change((r) => ({ ...r, name: ev.target.value }))}
            />
            <div className="field-label">Description</div>
            <textarea
              className="paste-box"
              rows={5}
              placeholder="What is this repertoire about? Plans, ideas, who it suits..."
              value={rep.description}
              onChange={(ev) => change((r) => ({ ...r, description: ev.target.value }))}
            />
            <div className="confirm-buttons">
              <button className="primary" onClick={() => setEditingDetails(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {exporting && page.kind === "home" && <RepExportDialog rep={rep} onClose={() => setExporting(false)} />}
    </>
  );
}
