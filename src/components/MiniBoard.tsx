import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Color } from "../types";

interface MiniBoardProps {
  fen: string;
  orientation?: Color;
  size?: number; // pixels (default: fills its CSS box)
}

/** A small read-only board, for previews and thumbnails. */
export function MiniBoard({ fen, orientation = "white", size }: MiniBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    cgRef.current = Chessground(ref.current, {
      fen,
      orientation,
      viewOnly: true,
      coordinates: false,
      animation: { enabled: false },
      drawable: { enabled: false, visible: false },
      highlight: { lastMove: false, check: false },
    });
    return () => {
      cgRef.current?.destroy();
      cgRef.current = null;
    };
  }, []);

  useEffect(() => {
    cgRef.current?.set({ fen, orientation });
  }, [fen, orientation]);

  return (
    <div className="mini-board" style={size ? { width: size, height: size } : undefined}>
      <div ref={ref} className="mini-board-inner" />
    </div>
  );
}