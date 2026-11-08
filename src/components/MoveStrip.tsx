import { useEffect, useRef } from "react";

interface MoveStripProps {
  sans: string[];
  viewIndex: number; // 0 = start position, N = after move N
  onSelect: (index: number) => void;
}

/** The move list as one sideways-scrolling line: 1. e4 e5 2. Nf3 Nc6 ... It follows the latest move. */
export function MoveStrip({ sans, viewIndex, onSelect }: MoveStripProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the current move in view by scrolling the strip itself (never the page)
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const el = activeRef.current;
    if (!el) {
      box.scrollTo({ left: 0 });
      return;
    }
    const right = el.offsetLeft + el.offsetWidth - box.clientWidth + 16;
    if (right > box.scrollLeft) box.scrollTo({ left: right, behavior: "smooth" });
    else if (el.offsetLeft - 16 < box.scrollLeft) box.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: "smooth" });
  }, [viewIndex, sans.length]);

  return (
    <div className="move-strip" ref={boxRef}>
      {sans.length === 0 && <span className="ms-empty">Moves appear here</span>}
      {sans.map((san, i) => (
        <span key={i} className="ms-item">
          {i % 2 === 0 && <span className="ms-num">{i / 2 + 1}.</span>}
          <button
            className={`ms-move ${viewIndex === i + 1 ? "active" : ""}`}
            ref={viewIndex === i + 1 ? activeRef : undefined}
            onClick={() => onSelect(i + 1)}
          >
            {san}
          </button>
        </span>
      ))}
    </div>
  );
}
