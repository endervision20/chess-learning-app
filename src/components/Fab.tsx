import { useEffect, useState } from "react";
import type { MenuItem } from "./DotsMenu";

interface FabProps {
  label: string;
  title?: string;
  onClick?: () => void; // a plain button...
  items?: MenuItem[]; // ...or a button that opens a small menu above itself
}

/** The round button at the bottom right of a screen. */
export function Fab({ label, title, onClick, items }: FabProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && items && (
        <>
          <div className="fab-backdrop" onClick={() => setOpen(false)} />
          <div className="fab-menu" role="menu">
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                title={it.title}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
      <button className="fab" title={title} onClick={() => (items ? setOpen((o) => !o) : onClick?.())}>
        {label}
      </button>
    </>
  );
}
