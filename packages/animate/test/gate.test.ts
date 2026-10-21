import { describe, it, expect, vi } from "vitest";
import { createTokenGate } from "../src/gate";

type ScheduleEntry = { cb: () => void; delayMs: number };

const makeManualScheduler = () => {
  const pending: ScheduleEntry[] = [];
  const advance = () => {
    const next = pending.shift();
    if (next) next.cb();
  };
  const advanceAll = (maxTicks = 100) => {
    let ticks = 0;
    while (pending.length > 0 && ticks < maxTicks) {
      advance();
      ticks += 1;
    }
    return ticks;
  };
  return {
    pending,
    scheduler: {
      schedule(cb: () => void, delayMs: number) {
        const entry = { cb, delayMs };
        pending.push(entry);
        return entry;
      },
      cancel(handle: unknown) {
        const idx = pending.indexOf(handle as ScheduleEntry);
        if (idx >= 0) pending.splice(idx, 1);
      },
    },
    advance,
    advanceAll,
  };
};

describe("createTokenGate — word chunking", () => {
  it("buffers until whitespace then emits one chunk per tick", () => {
    const emitted: string[] = [];
    const { scheduler, pending, advance } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 10,
      chunking: "word",
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push("hel");
    gate.push("lo ");
    expect(pending.length).toBe(1);

    advance();
    expect(emitted).toEqual(["hello "]);

    gate.push("world");
    // No whitespace yet — should not schedule.
    expect(pending.length).toBe(0);

    gate.push(" foo");
    expect(pending.length).toBe(1);
    advance();
    expect(emitted).toEqual(["hello ", "world "]);
  });

  it("flush drains buffered tail even without trailing whitespace", async () => {
    const emitted: string[] = [];
    const { scheduler, pending } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 10,
      chunking: "word",
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push("hello");
    expect(pending.length).toBe(0);
    await gate.flush();
    expect(emitted).toEqual(["hello"]);
  });

  it("flush drains at cadence rather than dumping the buffer in one sync batch", async () => {
    const emitted: string[] = [];
    const { scheduler, pending, advance } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 10,
      chunking: "word",
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push("one two three");
    expect(pending.length).toBe(1);

    const flushPromise = gate.flush();
    // Flush's first drain tick runs synchronously and emits the first word.
    expect(emitted).toEqual(["one "]);
    expect(pending.length).toBe(1); // next drain tick scheduled

    advance();
    expect(emitted).toEqual(["one ", "two "]);
    advance();
    // Final partial word ("three") has no trailing whitespace, so drain mode
    // emits the entire remaining buffer and resolves.
    expect(emitted).toEqual(["one ", "two ", "three"]);
    expect(pending.length).toBe(0);

    await flushPromise;
  });

  it("reset aborts pending ticks and discards the buffer", () => {
    const emitted: string[] = [];
    const { scheduler, pending } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 10,
      chunking: "word",
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push("hello ");
    expect(pending.length).toBe(1);
    gate.reset();
    expect(pending.length).toBe(0);
    expect(emitted).toEqual([]);
  });
});

describe("createTokenGate — char chunking", () => {
  it("emits one codepoint per tick until buffer is empty", () => {
    const emitted: string[] = [];
    const { scheduler, advanceAll } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 5,
      chunking: "char",
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push("abc");
    advanceAll();
    expect(emitted).toEqual(["a", "b", "c"]);
  });

  it("treats astral codepoints as one chunk", () => {
    // 🎉 is U+1F389 — outside the BMP, two code units.
    const emitted: string[] = [];
    const { scheduler, advanceAll } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 0,
      chunking: "char",
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push("a🎉b");
    advanceAll();
    expect(emitted).toEqual(["a", "🎉", "b"]);
  });
});

describe("createTokenGate — zero delay fast path", () => {
  it("emits synchronously when delayInMs is 0", () => {
    const emitted: string[] = [];
    const gate = createTokenGate({
      delayInMs: 0,
      chunking: "word",
      onEmit: (chunk) => void emitted.push(chunk),
    });

    gate.push("hello world ");
    // With delayInMs=0 in word mode, whole buffer drains as word-boundary chunks
    // without scheduling, right inside push().
    expect(emitted).toEqual(["hello ", "world "]);
  });
});

describe("createTokenGate — emission order", () => {
  it("serializes async onEmit so chunks arrive in push order", async () => {
    const emitted: string[] = [];
    const { scheduler, advanceAll } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 0,
      chunking: "word",
      onEmit: async (chunk) => {
        // Deliberately yield — if the gate didn't chain, chunks could interleave.
        await Promise.resolve();
        emitted.push(chunk);
      },
      scheduler,
    });

    gate.push("one two three ");
    advanceAll();
    await gate.flush();
    expect(emitted).toEqual(["one ", "two ", "three "]);
  });
});

describe("createTokenGate — lag budget", () => {
  const words = (count: number) => Array.from({ length: count }, (_, i) => `w${i} `).join("");

  it("keeps one word per tick while the backlog fits the budget", () => {
    const emitted: string[] = [];
    const { scheduler, advance } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 30,
      maxLagMs: 300,
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push(words(10));
    advance();
    expect(emitted).toEqual(["w0 "]);
  });

  it("releases enough per tick to drain a large backlog within the budget", () => {
    const emitted: string[] = [];
    const { scheduler, advance, advanceAll } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 30,
      maxLagMs: 300,
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    // 50 words against a 10-tick budget: the first tick releases a tenth.
    gate.push(words(50));
    advance();
    expect(emitted).toEqual(["w0 w1 w2 w3 w4 "]);

    // Shares shrink with the backlog until it fits the budget, then one word
    // per tick: about half the 50 ticks strict pacing would take.
    const ticks = advanceAll();
    expect(ticks).toBeLessThan(25);
    expect(emitted.join("")).toBe(words(50));
  });

  it("releases the ticks a late timer missed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const emitted: string[] = [];
      const { scheduler, advance } = makeManualScheduler();
      const gate = createTokenGate({
        delayInMs: 30,
        onEmit: (chunk) => void emitted.push(chunk),
        scheduler,
      });

      gate.push(words(10));
      // A background tab clamps the 30ms timer to ~1s: it owes 33 ticks.
      vi.advanceTimersByTime(1000);
      advance();
      expect(emitted).toEqual([words(10)]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps strict one-unit pacing with maxLagMs: Infinity", () => {
    const emitted: string[] = [];
    const { scheduler, advance } = makeManualScheduler();
    const gate = createTokenGate({
      delayInMs: 30,
      maxLagMs: Infinity,
      onEmit: (chunk) => void emitted.push(chunk),
      scheduler,
    });

    gate.push(words(50));
    advance();
    expect(emitted).toEqual(["w0 "]);
  });
});
