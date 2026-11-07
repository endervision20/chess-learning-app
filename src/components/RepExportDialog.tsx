import { useMemo, useState } from "react";
import { exportJson, toPgn } from "../repertoireLogic";
import type { Repertoire } from "../types";

const slug = (s: string) =>
  s.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "repertoire";
const isAndroid = /Android/i.test(navigator.userAgent);
function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The export window: JSON (re-importable here, keeps everything) or PGN (other chess apps). */
export function RepExportDialog({ rep, onClose }: { rep: Repertoire; onClose: () => void }) {
  const [fmt, setFmt] = useState<"json" | "pgn">("json");
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    try {
      return fmt === "json" ? exportJson(rep) : toPgn(rep);
    } catch (e) {
      console.error("Export failed:", e);
      return "Couldn't build the export (see console).";
    }
  }, [fmt, rep]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the text is selectable, so it can be copied by hand */
    }
  };

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-overlay-box rep-export" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-text">Export “{rep.name}”</div>
        <div className="seg">
          <button className={fmt === "json" ? "selected" : ""} onClick={() => setFmt("json")}>
            JSON (re-import here)
          </button>
          <button className={fmt === "pgn" ? "selected" : ""} onClick={() => setFmt("pgn")}>
            PGN (other chess apps)
          </button>
        </div>
        <div className="note">
          {fmt === "json"
            ? "Keeps everything, including your folders. Import it again from the Repertoire builder screen."
            : "Standard PGN with variations and comments (folders aren't part of PGN). It can also be imported here."}
        </div>
        <textarea
          className="paste-box"
          rows={12}
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="confirm-buttons">
          <button className="primary" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </button>
          {!isAndroid && (
          <button onClick={() => downloadText(`${slug(rep.name)}.${fmt}`, text)}>Save as file</button>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
