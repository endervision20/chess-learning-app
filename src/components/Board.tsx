import { live, animationOption } from "../settings";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { playSound, type SoundKind } from "../sounds";
import type { Color, PromotionRole } from "../types";

function countPieces(fen: string): number {
  let n = 0;
  for (const ch of fen.split(" ")[0]) if (/[a-zA-Z]/.test(ch)) n++;
  return n;
}

/** Which sound goes with the move that turned `before` into `after`: mate, check, capture or a plain move. */
function soundFor(before: string, after: string): SoundKind {
  try {
    const pos = Chess.fromSetup(parseFen(after).unwrap()).unwrap();
    if (pos.isCheckmate()) return "mate";
    if (pos.isCheck()) return "check";
  } catch {
    // an unusual position: fall through to capture / move
  }
  return countPieces(after) < countPieces(before) ? "capture" : "move";
}

const GLYPH: Record<Color, Record<PromotionRole, string>> = {
  white: { queen: "♕", rook: "♖", bishop: "♗", knight: "♘" },
  black: { queen: "♛", rook: "♜", bishop: "♝", knight: "♞" },
};
const ROLES: PromotionRole[] = ["queen", "rook", "bishop", "knight"];

interface BoardProps {
  fen: string;
  orientation: Color;
  turnColor: Color;
  playerColor: Color;
  interactive: boolean;
  premove?: boolean;
  dests: Map<Key, Key[]>;
  lastMove?: Key[];
  check?: Color | boolean;
  resync: number;
  shapes?: DrawShape[];
  marks?: Map<Key, string>; // CSS classes to put on squares (e.g. a red king)
  overlay?: ReactNode; // drawn on top of the board (e.g. the result popup)
  onMove: (from: Key, to: Key, promotion?: PromotionRole) => void;
}

export function Board({
  fen,
  orientation,
  turnColor,
  playerColor,
  interactive,
  premove = live.premove,
  dests,
  lastMove,
  check,
  resync,
  shapes,
  marks,
  overlay,
  onMove,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [tints, setTints] = useState<Set<Key>>(new Set());
  const [promo, setPromo] = useState<{ from: Key; to: Key; color: Color } | null>(null);
  const [localResync, setLocalResync] = useState(0);

  // Create the board once
  useEffect(() => {
    if (!containerRef.current) return;
    const cg = Chessground(containerRef.current, {
      coordinates: true,
      movable: {
        free: false,
        showDests: true,
        events: {
          after: (orig, dest) => {
            const piece = cgRef.current?.state.pieces.get(dest);
            if (piece?.role === "pawn" && (dest[1] === "8" || dest[1] === "1") && !live.autoQueen) {
              setPromo({ from: orig, to: dest, color: piece.color });
            } else { const promo = piece?.role === "pawn" && (dest[1] === "8" || dest[1] === "1"); onMoveRef.current(orig, dest, promo ? "queen" : undefined); }
          },
        },
      },
      premovable: { enabled: live.premove },
      animation: animationOption(),
      draggable: { showGhost: live.dragGhost },
      highlight: { lastMove: true, check: true },
      drawable: {
        enabled: true,
        defaultSnapToValidMove: false,
        onChange: (drawn) => {
          // Right-click on a single square becomes a square tint
          const circles = drawn.filter((s) => !s.dest || s.dest === s.orig);
          if (circles.length === 0) return;
          setTints((prev) => {
            const next = new Set(prev);
            for (const c of circles) {
              if (next.has(c.orig)) next.delete(c.orig);
              else next.add(c.orig);
            }
            return next;
          });
          cgRef.current?.setShapes(
            drawn.filter((s) => s.dest && s.dest !== s.orig)
          );
        },
      },
    });
    cgRef.current = cg;
    return () => {
      cg.destroy();
      cgRef.current = null;
    };
  }, []);

  // Sounds: play one whenever the position changes by a move (yours, the bot's, or stepping through a game)
  const prevFen = useRef(fen);
  useEffect(() => {
    const before = prevFen.current;
    prevFen.current = fen;
    if (before === fen || !lastMove) return;
    playSound(soundFor(before, fen));
  }, [fen]);

  // Chessground works out which square you touched from a cached copy of the board's position, and only
  // clears that cache on scroll/resize. If anything above the board shifts (a bar appears, the status bar
  // hides), touches land on the wrong square. Clearing the cache at the start of every touch fixes that.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const refresh = () => document.dispatchEvent(new Event("scroll"));
    wrap.addEventListener("touchstart", refresh, { capture: true, passive: true });
    wrap.addEventListener("mousedown", refresh, { capture: true, passive: true });
    window.addEventListener("orientationchange", refresh);
    return () => {
      wrap.removeEventListener("touchstart", refresh, { capture: true });
      wrap.removeEventListener("mousedown", refresh, { capture: true });
      window.removeEventListener("orientationchange", refresh);
    };
  }, []);

  // Sync the board with the game state
  useEffect(() => {
    const cg = cgRef.current;
    if (!cg) return;
    cg.set({
      fen,
      turnColor,
      lastMove,
      check,
      movable: { color: interactive ? playerColor : undefined, dests },
      premovable: { enabled: interactive && premove },
    });
    if (interactive && premove && turnColor === playerColor) cg.playPremove();
  }, [
    fen,
    turnColor,
    playerColor,
    interactive,
    premove,
    dests,
    lastMove,
    check,
    resync,
    localResync,
  ]);

  useEffect(() => {
    cgRef.current?.set({ orientation });
  }, [orientation]);

  // Arrows and circles drawn by the app (hints, best moves)
  useEffect(() => {
    cgRef.current?.setAutoShapes(shapes ?? []);
  }, [shapes]);

  // Square tints and any open promotion picker clear when the position changes
  useEffect(() => {
    setTints(new Set());
    setPromo(null);
  }, [fen]);

  useEffect(() => {
    const custom = new Map<Key, string>(
      Array.from(tints, (k) => [k, "user-hl"] as [Key, string])
    );
    if (marks) for (const [k, cls] of marks) custom.set(k, cls);
    cgRef.current?.set({ highlight: { custom } });
  }, [tints, marks]);

  const choose = (role: PromotionRole) => {
    const p = promo;
    setPromo(null);
    if (p) onMoveRef.current(p.from, p.to, role);
  };
  const cancelPromo = () => {
    setPromo(null);
    setLocalResync((n) => n + 1); // put the pawn back
  };

  return (
    <div className="board-wrap" ref={wrapRef}>
      <div ref={containerRef} className="board-container" />
      {promo && (
        <div className="promo-overlay" onClick={cancelPromo}>
          <div className="promo-choices" onClick={(e) => e.stopPropagation()}>
            {ROLES.map((r) => (
              <button key={r} title={r} onClick={() => choose(r)}>
                {GLYPH[promo.color][r]}
              </button>
            ))}
          </div>
        </div>
      )}
      {overlay}
    </div>
  );
}
