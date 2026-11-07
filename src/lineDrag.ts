import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const HOLD_MS = 350; // touch screens: press and hold this long to pick an item up (a quick swipe scrolls instead)
const MOVE_TOLERANCE = 8; // touch: moving further than this before the hold is over means "scroll", not "drag"

export interface DragInfo {
  key: string;
  label: string;
}

function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * Press on an item and move the pointer off it: the whole item (tile or row) comes with the pointer. Drag it over an
 * element marked `data-drop="<target>"` and let go to drop it. (On a touch screen, press and hold first.)
 * Mark anything inside an item that must stay clickable (menus, buttons) with `data-nodrag`.
 * Returns the item being dragged (so you can stop drawing it, which closes the gap), the target it is over,
 * and `start`, which goes on the item's onPointerDown.
 */
export function useHoldDrag(onDrop: (key: string, target: string) => void) {
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const start = (e: ReactPointerEvent<HTMLElement>, key: string, label: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
    cleanup.current?.();

    const el = e.currentTarget;
    const sx = e.clientX;
    const sy = e.clientY;
    const startRect = el.getBoundingClientRect();
    const grabX = sx - startRect.left; // where on the item it was grabbed, so it stays under the pointer the same way
    const grabY = sy - startRect.top;
    const scroller = scrollParent(el);
    const isMouse = e.pointerType === "mouse";
    let x = sx;
    let y = sy;
    let dragging = false;
    let lastHover: string | null = null;
    let clone: HTMLElement | null = null;
    let timer = 0;
    let raf = 0;

    const place = () => {
      if (clone) clone.style.transform = `translate(${x - grabX}px, ${y - grabY}px) scale(1.03)`;
    };
    const hit = () =>
      document.elementFromPoint(x, y)?.closest("[data-drop]")?.getAttribute("data-drop") ?? null;
    const updateHover = () => {
      const h = hit();
      if (h !== lastHover) {
        lastHover = h;
        setHover(h);
      }
    };

    // near the top or bottom edge of the window, the page scrolls so far-away folders can be reached
    const scrollLoop = () => {
      const edge = 80;
      const speed =
        y < edge ? -((edge - y) / edge) * 18 : y > window.innerHeight - edge ? ((y - (window.innerHeight - edge)) / edge) * 18 : 0;
      if (speed) {
        scroller.scrollTop += speed;
        updateHover();
      }
      raf = requestAnimationFrame(scrollLoop);
    };

    const swallowClick = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const noDefault = (ev: Event) => {
      if (dragging || ev.type === "contextmenu") ev.preventDefault();
    };

    const stop = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", noDefault);
      window.removeEventListener("contextmenu", noDefault);
      document.body.classList.remove("line-dragging");
      clone?.remove();
      clone = null;
      cleanup.current = null;
      setDrag(null);
      setHover(null);
    };

    // The item itself leaves the list (the caller stops drawing it); a copy of it follows the pointer.
    const begin = () => {
      if (dragging) return;
      dragging = true;
      const parent = el.parentElement;
      if (parent) {
        // inside the same parent, so the copy gets exactly the same styling as the original
        clone = el.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-key");
        clone.removeAttribute("data-drop");
        clone.classList.add("drag-clone");
        Object.assign(clone.style, {
          position: "fixed",
          left: "0",
          top: "0",
          margin: "0",
          width: `${startRect.width}px`,
          height: `${startRect.height}px`,
          boxSizing: "border-box",
          zIndex: "200",
          pointerEvents: "none",
        });
        parent.appendChild(clone);
        place();
      }
      document.body.classList.add("line-dragging");
      setDrag({ key, label });
      updateHover();
      raf = requestAnimationFrame(scrollLoop);
    };

    function onMove(ev: PointerEvent) {
      x = ev.clientX;
      y = ev.clientY;
      if (!dragging) {
        if (isMouse) {
          // pressed on the item, and now the pointer has left it
          const r = el.getBoundingClientRect();
          if (x < r.left || x > r.right || y < r.top || y > r.bottom) begin();
        } else if (Math.hypot(x - sx, y - sy) > MOVE_TOLERANCE) {
          stop(); // a swipe: let the page scroll
        }
        return;
      }
      place();
      updateHover();
    }
    function onUp() {
      const wasDragging = dragging;
      const target = lastHover;
      stop();
      if (!wasDragging) return; // an ordinary click: leave it alone
      // the click that follows letting go must not open anything
      window.addEventListener("click", swallowClick, true);
      window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 60);
      if (target) onDropRef.current(key, target);
    }
    function onCancel() {
      stop();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", noDefault, { passive: false });
    window.addEventListener("contextmenu", noDefault);
    cleanup.current = stop;

    if (!isMouse) timer = window.setTimeout(begin, HOLD_MS);
  };

  return { drag, hover, start };
}

/**
 * Smoothly slides items to their new place whenever the layout changes (an item picked up, dropped, filtered...).
 * Items must carry `data-key`; `signature` should change whenever what is shown changes.
 */
export function useFlip(container: RefObject<HTMLElement | null>, signature: string) {
  const previous = useRef<Map<string, { x: number; y: number }>>(new Map());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) {
      previous.current = new Map();
      return;
    }
    const base = root.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    const moved: [HTMLElement, number, number][] = [];
    root.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      const key = el.dataset.key!;
      const r = el.getBoundingClientRect();
      const p = { x: r.left - base.left, y: r.top - base.top };
      next.set(key, p);
      const o = previous.current.get(key);
      if (o && (Math.abs(o.x - p.x) > 1 || Math.abs(o.y - p.y) > 1)) moved.push([el, o.x - p.x, o.y - p.y]);
    });
    previous.current = next;
    if (moved.length > 80) return; // a big reshuffle (like a search) isn't worth animating
    for (const [el, dx, dy] of moved) {
      el.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 180,
        easing: "ease-out",
      });
    }
  }, [signature]);
}
