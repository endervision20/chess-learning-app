import type { Color } from "../types";
import { live } from "../settings";

export interface EngineInfo {
  depth: number;
  multipv: number; // which engine line this is (1 = best)
  pv: string[]; // the line, as UCI moves
  cp?: number; // centipawns, from the side-to-move's view
  mate?: number; // moves to mate, from the side-to-move's view
}

export interface EvalState {
  pct: number; // White's share of the bar, 0-100
  label: string;
}

type LineListener = (line: string) => void;

function parseInfo(line: string): EngineInfo | null {
  if (/\b(lowerbound|upperbound)\b/.test(line)) return null;
  const depth = /\bdepth (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  if (!depth || !score) return null;
  const multipv = /\bmultipv (\d+)/.exec(line);
  const pvAt = line.indexOf(" pv ");
  const v = parseInt(score[2], 10);
  return {
    depth: parseInt(depth[1], 10),
    multipv: multipv ? parseInt(multipv[1], 10) : 1,
    pv: pvAt >= 0 ? line.slice(pvAt + 4).trim().split(/\s+/) : [],
    ...(score[1] === "cp" ? { cp: v } : { mate: v }),
  };
}

export function evalFromInfo(info: EngineInfo, turn: Color): EvalState {
  const sign = turn === "white" ? 1 : -1;
  if (info.mate !== undefined) {
    const whiteWins = info.mate === 0 ? turn === "black" : info.mate * sign > 0;
    const n = Math.abs(info.mate);
    return {
      pct: whiteWins ? 100 : 0,
      label: n === 0 ? (whiteWins ? "1-0" : "0-1") : `${whiteWins ? "+" : "-"}M${n}`,
    };
  }
  const cp = (info.cp ?? 0) * sign;
  const pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  return { pct, label: `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(1)}` };
}

// Single-threaded build on purpose: multi-threaded WASM needs SharedArrayBuffer, which needs
// cross-origin-isolation headers that the Android WebView doesn't give you.
// Change the file name to match whichever build you copied into public/stockfish/.
const ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners = new Set<LineListener>();
  private initPromise: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private gen = 0;

  constructor(private options: Record<string, string | number> = {}) {}

  /** Safe to call many times: only starts the engine once. */
  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.start();
    return this.initPromise;
  }

  private async start() {
    // Stockfish compiled to WebAssembly, running in a Web Worker (works on desktop and Android).
    // The files live in /public/stockfish/ - see ENGINE_URL below.
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (ev: MessageEvent) => {
      const text = typeof ev.data === "string" ? ev.data : String(ev.data);
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line) this.listeners.forEach((fn) => fn(line));
      }
    };
    this.worker.onerror = (e) => console.warn("[stockfish worker error]", e.message);

    await this.sendAndWait("uci", "uciok");
    for (const [name, value] of Object.entries(this.options)) {
      await this.write(`setoption name ${name} value ${value}`);
    }
    await this.sendAndWait("isready", "readyok");
  }

  private waitFor(prefix: string): Promise<string> {
    return new Promise((resolve) => {
      const fn: LineListener = (line) => {
        if (line.startsWith(prefix)) {
          this.listeners.delete(fn);
          resolve(line);
        }
      };
      this.listeners.add(fn);
    });
  }

  private waitForSearch(onInfo?: (i: EngineInfo) => void): Promise<string> {
    return new Promise((resolve) => {
      const fn: LineListener = (line) => {
        if (line.startsWith("info")) {
          if (onInfo) {
            const info = parseInfo(line);
            if (info) onInfo(info);
          }
        } else if (line.startsWith("bestmove")) {
          this.listeners.delete(fn);
          resolve(line.split(" ")[1] ?? "");
        }
      };
      this.listeners.add(fn);
    });
  }

  private async write(cmd: string) {
    this.worker!.postMessage(cmd);
  }

  private async sendAndWait(cmd: string, prefix: string) {
    const p = this.waitFor(prefix);
    await this.write(cmd);
    return p;
  }

  /**
   * Start a search. A new search cancels any older one.
   * `go` is the text after "go", e.g. "movetime 1000" or "depth 24".
   * `elo` limits strength; leave it undefined for full strength.
   * `multiPv` asks for several lines at once (analysis).
   * Resolves with the best move in UCI form (e.g. "e2e4"), or "" if cancelled.
   */
  search(
    fen: string,
    go: string,
    opts: { elo?: number; multiPv?: number; onInfo?: (i: EngineInfo) => void } = {}
  ): Promise<string> {
    const myGen = ++this.gen;
    this.stop();
    const run = async () => {
      if (myGen !== this.gen) return ""; // a newer search replaced this one
      await this.init();
      if (opts.elo !== undefined) {
        await this.write("setoption name UCI_LimitStrength value true");
        await this.write(`setoption name UCI_Elo value ${Math.round(opts.elo)}`);
      } else {
        await this.write("setoption name UCI_LimitStrength value false");
      }
      await this.write(`setoption name MultiPV value ${opts.multiPv ?? 1}`);
      await this.write(`position fen ${fen}`);
      const p = this.waitForSearch(opts.onInfo);
      await this.write(`go ${go}`);
      return p;
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => {});
    return result;
  }

  /** Interrupt a search that is in progress. */
  stop() {
    this.worker?.postMessage("stop");
  }
}

// One engine plays the bot, a second one drives the eval bar.
// Each gets 1 thread and Stockfish's default hash so they don't fight over the CPU.
export const botEngine = new StockfishEngine({ Hash: 16 });
export const evalEngine = new StockfishEngine({ Hash: 16 });
// On the Analysis screen nothing else is running, so this one can use more.

export const analysisEngine = new StockfishEngine({ Hash: live.hashMb });
