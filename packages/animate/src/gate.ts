// TokenGate: throttles token delivery to a downstream emitter.
//
// Sits between the LLM stream and the inkset pipeline. Callers push arriving
// tokens via `push()`; the gate buffers them and releases chunks at a target
// cadence so visual reveal feels uniform regardless of network bursts.
//
// Two chunking modes: "word" waits for whitespace before emitting (matches the
// AI SDK smoothStream default and streamdown's `sep: "word"`), "char" emits
// one codepoint per tick. End-of-stream via `flush()` always drains the
// remainder, even mid-word.

import type { ChunkingMode, TokenEmitter, ThrottleOptions } from "./types";

const DEFAULT_DELAY_MS = 30;
const DEFAULT_MAX_LAG_MS = 600;
const DEFAULT_CHUNKING: ChunkingMode = "word";

export interface TokenGate {
  /** Accept an arriving token. May buffer or emit immediately. */
  push(token: string): void;
  /** Drain any buffered tokens synchronously, regardless of cadence. */
  flush(): Promise<void>;
  /** Abort pending emissions and clear the buffer. */
  reset(): void;
}

export interface CreateTokenGateOptions extends ThrottleOptions {
  onEmit: TokenEmitter;
  /** Injectable scheduler, primarily for tests. Defaults to setTimeout. */
  scheduler?: {
    schedule: (cb: () => void, delayMs: number) => unknown;
    cancel: (handle: unknown) => void;
  };
}

const defaultScheduler = {
  schedule: (cb: () => void, delayMs: number) => setTimeout(cb, delayMs),
  cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const createTokenGate = (options: CreateTokenGateOptions): TokenGate => {
  const delayMs = options.delayInMs ?? DEFAULT_DELAY_MS;
  const chunking = options.chunking ?? DEFAULT_CHUNKING;
  const maxLagMs = options.maxLagMs ?? DEFAULT_MAX_LAG_MS;
  const { onEmit } = options;
  const scheduler = options.scheduler ?? defaultScheduler;

  let buffer = "";
  let pendingHandle: unknown = null;
  // Tracks Promises returned by async onEmit callbacks so flush() can await
  // the consumer's state before resolving. Sync onEmits don't populate this.
  let inflight: Promise<unknown>[] = [];

  const hasWordBoundary = (s: string): boolean => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) return true;
    }
    return false;
  };

  const sliceWordBoundary = (): string | null => {
    // Emit one word per tick — the prefix up to and including the first run
    // of trailing whitespace. This paces output the way smoothStream does:
    // each delayInMs yields one visible unit, not all available units.
    let i = 0;
    while (i < buffer.length && !isWhitespaceChar(buffer.charCodeAt(i))) i += 1;
    if (i === buffer.length) return null; // no boundary yet
    while (i < buffer.length && isWhitespaceChar(buffer.charCodeAt(i))) i += 1;
    const chunk = buffer.slice(0, i);
    buffer = buffer.slice(i);
    return chunk;
  };

  const isWhitespaceChar = (code: number): boolean =>
    code === 32 || code === 9 || code === 10 || code === 13;

  const sliceCharBoundary = (): string | null => {
    if (buffer.length === 0) return null;
    // Respect surrogate pairs so we don't split an emoji.
    const codePoint = buffer.codePointAt(0) ?? 0;
    const width = codePoint > 0xffff ? 2 : 1;
    const chunk = buffer.slice(0, width);
    buffer = buffer.slice(width);
    return chunk;
  };

  const takeChunk = (): string | null =>
    chunking === "word" ? sliceWordBoundary() : sliceCharBoundary();

  const countUnits = (): number => {
    if (chunking === "char") return buffer.length;
    let units = 0;
    for (let i = 1; i < buffer.length; i++) {
      if (isWhitespaceChar(buffer.charCodeAt(i)) && !isWhitespaceChar(buffer.charCodeAt(i - 1))) {
        units += 1;
      }
    }
    return units;
  };

  let scheduledAt = 0;
  const schedule = (cb: () => void): void => {
    scheduledAt = Date.now();
    pendingHandle = scheduler.schedule(cb, delayMs);
  };
  // One unit per tick while the backlog fits in the lag budget; otherwise a
  // share sized to drain it over the budget, so a fast stream holds steady at
  // about `maxLagMs` behind. A tick that fires late (a clamped background-tab
  // timer) also owes the ticks it missed.
  const unitsDue = (): number => {
    const firedFor = scheduledAt;
    scheduledAt = 0;
    // Zero delay emits synchronously, so nothing can fall behind.
    if (delayMs <= 0 || !Number.isFinite(maxLagMs)) return 1;
    const ticksElapsed = firedFor > 0 ? Math.floor((Date.now() - firedFor) / delayMs) : 1;
    const budgetTicks = Math.max(1, Math.floor(maxLagMs / delayMs));
    return Math.max(1, ticksElapsed, Math.ceil(countUnits() / budgetTicks));
  };

  const takeChunks = (count: number): string | null => {
    let out: string | null = null;
    for (let i = 0; i < count; i++) {
      const chunk = takeChunk();
      if (chunk === null) break;
      out = (out ?? "") + chunk;
    }
    return out;
  };

  const emit = (chunk: string): void => {
    // Call synchronously so sync consumers see state update in the same tick.
    const result = onEmit(chunk);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      inflight.push(result as Promise<unknown>);
    }
  };

  const tick = (): void => {
    pendingHandle = null;
    const chunk = takeChunks(unitsDue());
    if (chunk !== null && chunk.length > 0) {
      emit(chunk);
    }
    if (buffer.length === 0) return;
    if (chunking === "char") {
      scheduleNext();
      return;
    }
    // Word mode: only reschedule if there's still a word boundary to release.
    if (hasWordBoundary(buffer)) scheduleNext();
  };

  const scheduleNext = (): void => {
    if (pendingHandle !== null) return;
    // Word mode suppresses scheduling when nothing is releasable yet, so
    // push() of an unterminated fragment doesn't leave dangling timers.
    if (chunking === "word" && !hasWordBoundary(buffer)) return;
    if (delayMs <= 0) {
      tick();
      return;
    }
    schedule(tick);
  };

  return {
    push(token: string): void {
      if (token.length === 0) return;
      buffer += token;
      scheduleNext();
    },

    async flush(): Promise<void> {
      // Drain the buffer at the configured cadence — one chunk per tick —
      // rather than emitting the whole backlog in a single sync batch.
      // Without this, end-of-stream dumps every remaining word at once and
      // all their reveal animations collapse into one visual event.
      //
      // Drain mode differs from steady-state in one way: if word-mode has a
      // partial word with no trailing whitespace, we still emit it. Otherwise
      // the final fragment would sit in the buffer forever.
      if (pendingHandle !== null) {
        scheduler.cancel(pendingHandle);
        pendingHandle = null;
      }

      await new Promise<void>((resolve) => {
        const drainTick = () => {
          pendingHandle = null;
          if (buffer.length === 0) {
            resolve();
            return;
          }
          let chunk = takeChunks(unitsDue());
          if (chunk === null) {
            // Word mode with no boundary left — emit remaining buffer as the
            // final chunk so nothing gets stranded.
            chunk = buffer;
            buffer = "";
          }
          if (chunk.length > 0) emit(chunk);
          if (buffer.length === 0) {
            resolve();
            return;
          }
          if (delayMs <= 0) {
            drainTick();
          } else {
            schedule(drainTick);
          }
        };
        drainTick();
      });

      if (inflight.length > 0) {
        const pending = inflight;
        inflight = [];
        await Promise.all(pending);
      }
    },

    reset(): void {
      if (pendingHandle !== null) {
        scheduler.cancel(pendingHandle);
        pendingHandle = null;
      }
      buffer = "";
      inflight = [];
      scheduledAt = 0;
    },
  };
};
