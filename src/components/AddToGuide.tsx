import { useEffect, useState } from "react";
import { pvToSan, START_FEN } from "../chessLogic";
import { notesToPly, type NoteMap } from "../notes";
import type { OpeningLine } from "../openings";
import { addUserLine, updateUserLine } from "../storage/guideLines";
import type { Color, UserLine } from "../types";

interface AddToGuideProps {
  candidates: OpeningLine[]; // named openings along the line, deepest first
  ucis: string[];
  side: Color;
  customStart: boolean;
  notes?: NoteMap; // notes written in Analysis: the ones along this line are saved with it
  editLine?: UserLine; // set when this analysis was opened to edit one of your lines
  fullUcis?: string[]; // the whole line on the board (used when saving changes to your line)
}

export function AddToGuide({
  candidates,
  ucis,
  side,
  customStart,
  notes,
  editLine,
  fullUcis,
}: AddToGuideProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "updated" | "error">("idle");

  const firstName = candidates[0]?.name ?? "";
  useEffect(() => {
    setTarget(firstName);
  }, [firstName]);
  useEffect(() => {
    setStatus("idle");
  }, [ucis.length]);

  const saveChanges = async () => {
    if (!editLine) return;
    try {
      const full = fullUcis ?? ucis;
      const { intro, byPly } = notesToPly(full, notes);
      await updateUserLine(editLine.id, {
        ucis: full,
        side,
        note: intro || editLine.note,
        notes: byPly,
      });
      setStatus("updated");
    } catch (e) {
      console.error("Couldn't update the line:", e);
      setStatus("error");
    }
  };

  const reason = customStart
    ? "Lines can only be added from the standard starting position."
    : ucis.length === 0
    ? "Play or load some moves first."
    : candidates.length === 0
    ? "This line doesn't match any known opening yet."
    : "";

  const updateBox = editLine && !customStart && (fullUcis ?? ucis).length > 0 && (
    <div className="add-guide">
      <button className="primary" onClick={saveChanges}>
        Save changes to “{editLine.name}”
      </button>
      <div className="note">
        Replaces that line's moves, side and notes with what is on the board now.
      </div>
      {status === "updated" && <div className="note">Saved. Go back to see it in the guide.</div>}
    </div>
  );

  if (reason) {
    return (
      <>
        {updateBox}
        <div className="add-guide">
          <button disabled>Add this line to the opening guide</button>
          <div className="note">{reason}</div>
        </div>
      </>
    );
  }

  const save = async () => {
    try {
      const { intro, byPly } = notesToPly(ucis, notes);
      await addUserLine({
        opening: target,
        name: name.trim() || "My line",
        note: note.trim() || intro,
        notes: byPly,
        ucis,
        side,
      });
      setStatus("saved");
      setOpen(false);
      setName("");
      setNote("");
    } catch (e) {
      console.error("Couldn't save the line:", e);
      setStatus("error");
    }
  };

  if (!open) {
    return (
      <>
        {updateBox}
        <div className="add-guide">
          <button
            onClick={() => {
              setNote(notesToPly(ucis, notes).intro);
              setOpen(true);
            }}
          >
            {editLine ? "Add as a new line in the guide" : "Add this line to the opening guide"}
          </button>
          {status === "saved" && (
            <div className="note">Added. You'll find it in the Openings guide.</div>
          )}
          {status === "error" && (
            <div className="error-text">Couldn't save the line (see console).</div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="add-guide">
      <div>
        <div className="field-label">Add to opening</div>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {candidates.map((c) => (
            <option key={c.name} value={c.name}>
              {c.eco} · {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="note">{pvToSan(START_FEN, ucis, 60)}</div>
      <input
        className="opening-search"
        placeholder="Line name (e.g. My anti-English-Attack idea)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="paste-box"
        rows={2}
        placeholder="Notes on the starting position (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {Object.keys(notesToPly(ucis, notes).byPly).length > 0 && (
        <div className="note">Your notes on the moves along this line are saved with it.</div>
      )}
      <div className="buttons">
        <button className="primary" onClick={save}>Save line</button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
