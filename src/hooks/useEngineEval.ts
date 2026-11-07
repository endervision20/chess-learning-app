import { useEffect, useRef, useState } from "react";
import {
  evalFromInfo,
  type EvalState,
  type StockfishEngine,
} from "../engine/stockfish";
import type { Color } from "../types";

export interface AnalysisLine {
  multipv: number;
  depth: number;
  ev: EvalState;
  pv: string[]; // UCI moves
}

export interface EngineEvalResult {
  evalState: EvalState | null; // last trustworthy evaluation
  depth: number; // depth the current search has reached
  lines: AnalysisLine[];
  linesFen: string | null; // the position `lines` belong to
  analysing: boolean;
  settled: boolean; // false = evalState is still the OLD position's value
}

const EMPTY: EngineEvalResult = {
  evalState: null,
  depth: 0,
  lines: [],
  linesFen: null,
  analysing: false,
  settled: false,
};

type Snapshot = Pick<EngineEvalResult, "evalState" | "depth" | "lines" | "linesFen">;

interface Options {
  engine: StockfishEngine;
  enabled: boolean;
  fen: string;
  turn: Color;
  go: string; // e.g. "depth 24 movetime 8000"
  minDepth: number; // nothing new is shown until this depth is reached
  multiPv?: number;
}

export function useEngineEval({
  engine,
  enabled,
  fen,
  turn,
  go,
  minDepth,
  multiPv = 1,
}: Options): EngineEvalResult {
  const cache = useRef(new Map<string, Snapshot>());
  const [res, setRes] = useState<EngineEvalResult>(EMPTY);

  useEffect(() => {
    if (!enabled) return;

    const key = `${fen}|${multiPv}|${go}`;
    const hit = cache.current.get(key);
    if (hit) {
      setRes({ ...hit, analysing: false, settled: true });
      return;
    }

    let cancelled = false;
    let settled = false;
    const latest: AnalysisLine[] = [];

    // Keep showing the previous evaluation while the new one warms up
    setRes((r) => ({
      ...r,
      depth: 0,
      lines: [],
      linesFen: null,
      analysing: true,
      settled: false,
    }));

    engine
      .search(fen, go, {
        multiPv,
        onInfo: (info) => {
          if (cancelled) return;
          latest[info.multipv - 1] = {
            multipv: info.multipv,
            depth: info.depth,
            ev: evalFromInfo(info, turn),
            pv: info.pv,
          };
          const first = latest[0];
          if (!first) return;

          if (
            !settled &&
            info.multipv === 1 &&
            (info.depth >= minDepth || info.mate !== undefined)
          ) {
            settled = true;
          }
          if (settled) {
            setRes({
              evalState: first.ev,
              depth: first.depth,
              lines: latest.filter(Boolean),
              linesFen: fen,
              analysing: true,
              settled: true,
            });
          } else if (info.multipv === 1) {
            setRes((r) => (r.depth === info.depth ? r : { ...r, depth: info.depth }));
          }
        },
      })
      .then(() => {
        if (cancelled) return;
        const first = latest[0];
        if (!first) {
          setRes((r) => ({ ...r, analysing: false }));
          return;
        }
        const snap: Snapshot = {
          evalState: first.ev,
          depth: first.depth,
          lines: latest.filter(Boolean),
          linesFen: fen,
        };
        cache.current.set(key, snap);
        setRes({ ...snap, analysing: false, settled: true });
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      engine.stop();
    };
  }, [engine, enabled, fen, turn, go, minDepth, multiPv]);

  return res;
}