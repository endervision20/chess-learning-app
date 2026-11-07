import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

interface DotsMenuProps {
  items: MenuItem[];
  title?: string;
}

/** The "⋯" button: opens a small menu of actions. Drawn on top of the page, so it is never clipped by a tile or row. */
export function DotsMenu({ items, title = "More" }: DotsMenuProps) {
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    const needed = items.length * 38 + 12;
    // open upwards when there isn't room below
    setPos(
      r.bottom + needed > window.innerHeight
        ? { bottom: window.innerHeight - r.top + 4, right }
        : { top: r.bottom + 4, right }
    );
  };

  return (
    <>
      <button
        ref={btn}
        data-nodrag
        className="dots-btn"
        title={title}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={toggle}
      >
        ⋯
      </button>
      {pos &&
        createPortal(
          <div
            className="menu-backdrop"
            onClick={(e) => {
              e.stopPropagation();
              setPos(null);
            }}
          >
            <div className="menu-pop" style={pos} role="menu" onClick={(e) => e.stopPropagation()}>
              {items.map((it) => (
                <button
                  key={it.label}
                  role="menuitem"
                  className={it.danger ? "menu-danger" : ""}
                  disabled={it.disabled}
                  title={it.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPos(null);
                    it.onClick();
                  }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
