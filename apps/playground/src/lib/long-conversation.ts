// Deterministic transcript generator for the "long conversations" demo.
// Produces stable output across page loads so screenshots and scroll
// positions stay comparable. Bump the seed if you want different content.
//
// Conversation shape: pairs are grouped into segments that stick with one
// topic for several turns before transitioning. Within a segment, user
// turns alternate between the initial opener and threaded follow-ups
// ("and how does that interact with X?"). Each user template carries a
// list of *allowed response types* so when the user asks for code the
// assistant answers with code, when they ask for math they get math, etc.
// Continuity-flavored assistant templates ("Right. Building on that…")
// are gated to mid-segment turns so they never land right after a topic
// pivot. Language + code snippet are pinned per pair so the assistant's
// snippet matches whatever language the user asked for.

import type { Message } from "./scenarios";

// Default pair count for the demo. Each pair is a user prompt plus an
// assistant reply, so 300 pairs = 600 messages. Virtualized by Virtuoso in
// the transcript component, so this can grow without hurting mount time.
export const DEFAULT_PAIR_COUNT = 300;

// Each segment is N turns long, picked uniformly from this range. Short
// enough that the transcript feels varied, long enough that threading is
// legible when you scroll through.
const MIN_SEGMENT_LENGTH = 4;
const MAX_SEGMENT_LENGTH = 8;

// mulberry32 — four-line deterministic PRNG, no deps, well-distributed
// enough for template picking. Reference: https://github.com/bryc/code
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = <T>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

// Weighted pick. Items without a `weight` field default to weight 1, so
// mixed arrays (some weighted, some not) behave like uniform `pick` for
// the un-weighted entries. Caller must ensure the array is non-empty —
// empty arrays throw via pick() on the fallback path.
const pickWeighted = <T extends { weight?: number }>(arr: readonly T[], rng: () => number): T => {
  let total = 0;
  for (const item of arr) total += item.weight ?? 1;
  let r = rng() * total;
  for (const item of arr) {
    r -= item.weight ?? 1;
    if (r <= 0) return item;
  }
  return arr[arr.length - 1];
};

// ── Vocab pools ───────────────────────────────────────────────────

const TOPICS = [
  "backpressure",
  "garbage collection",
  "React hooks",
  "WebSockets",
  "CSS containment",
  "event loops",
  "virtual DOM diffing",
  "HTTP/2 multiplexing",
  "memoization",
  "streaming parsers",
  "token buckets",
  "circuit breakers",
  "CRDTs",
  "service workers",
  "IndexedDB transactions",
  "layout shift",
  "font loading",
  "WebAssembly threads",
  "reactive scheduling",
  "structured clone",
];

const LANGUAGES = ["TypeScript", "Python", "Rust", "Go", "Swift", "Kotlin"];
const LANG_TAGS: Record<string, string> = {
  TypeScript: "ts",
  Python: "python",
  Rust: "rust",
  Go: "go",
  Swift: "swift",
  Kotlin: "kotlin",
};

const TASKS = [
  "reverses a string in place",
  "computes the nth Fibonacci number",
  "flattens a deeply nested array",
  "debounces a callback",
  "parses a CSV row",
  "formats a byte count",
  "chunks an iterable",
  "walks a tree depth-first",
];

const CODE_SNIPPETS: Record<string, string[]> = {
  TypeScript: [
    `const sum = (xs: number[]): number =>\n  xs.reduce((a, b) => a + b, 0);`,
    `const debounce = <T extends (...a: unknown[]) => void>(fn: T, ms: number) => {\n  let t: ReturnType<typeof setTimeout>;\n  return (...args: Parameters<T>) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n};`,
    `type Result<T> = { ok: true; value: T } | { ok: false; error: string };`,
  ],
  Python: [
    `def fib(n: int) -> int:\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a`,
    `def chunks(xs, n):\n    for i in range(0, len(xs), n):\n        yield xs[i:i + n]`,
  ],
  Rust: [
    `fn sum(xs: &[i64]) -> i64 {\n    xs.iter().sum()\n}`,
    `fn chunked<T: Clone>(xs: &[T], n: usize) -> Vec<Vec<T>> {\n    xs.chunks(n).map(|c| c.to_vec()).collect()\n}`,
  ],
  Go: [
    `func Sum(xs []int) int {\n    total := 0\n    for _, x := range xs {\n        total += x\n    }\n    return total\n}`,
  ],
  Swift: [
    `func fib(_ n: Int) -> Int {\n    var a = 0, b = 1\n    for _ in 0..<n { (a, b) = (b, a + b) }\n    return a\n}`,
  ],
  Kotlin: [
    `fun <T> List<T>.chunked2(size: Int): List<List<T>> =\n    (0 until this.size step size).map { subList(it, minOf(it + size, this.size)) }`,
  ],
};

const FORMULAS = [
  String.raw`a^2 + b^2 = c^2`,
  String.raw`E = mc^2`,
  String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`,
  String.raw`\int_0^\infty e^{-x^2}\, dx = \frac{\sqrt{\pi}}{2}`,
  String.raw`f(x) = \frac{1}{\sqrt{2\pi}\sigma} e^{-\frac{(x-\mu)^2}{2\sigma^2}}`,
  String.raw`P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)}`,
];

const SENTENCES = [
  "the tradeoff depends on how much state you are willing to hold in memory",
  "the browser batches this work until something forces a read",
  "the cost grows with the number of active observers, not just the size of the input",
  "it usually comes down to whether you can hand off the write to a later frame",
  "the framework handles most of it, but the edges are where surprises live",
  "you can cache it, but cache invalidation is still the hard part",
  "the bottleneck is almost always the synchronous measurement, not the work itself",
  "the right answer depends on whether you care more about throughput or latency",
  "the guarantees only hold while the scheduler is cooperative",
  "ordering survives the reconnect, but timing doesn't",
  "the allocator is the thing that actually decides whether this is fast",
  "concurrency bugs here are almost always a missing fence, not a missing lock",
];

const POINTS = [
  "it is idempotent, so retries are safe",
  "the hot path does no allocation",
  "ordering is preserved across reconnects",
  "backpressure is signaled through the reader",
  "it fails loudly instead of silently",
  "the state machine has exactly three terminal nodes",
  "each step is independently cancellable",
  "there is no shared mutable state between workers",
  "retries are bounded and exponentially backed off",
  "the failure domain is isolated to a single request",
  "measurement happens exactly once per frame",
  "the cache is keyed on content, not on position",
];

const TAKEAWAYS = [
  "most of the cost is already paid before the hot path runs",
  "small, bounded work per event beats large batched passes for UI responsiveness",
  "the abstraction leaks once you cross a thread boundary",
  "getting the cache key right matters more than the cache size",
  "you only pay for observability on the paths you instrument",
  "correctness under reconnects is worth more than correctness under ideal conditions",
];

// ── Template types ────────────────────────────────────────────────

// Narrow union of assistant response shapes. User templates declare which
// ones they'll accept; assistant templates declare which one they are.
// "continuity" is a subtype of prose that opens with a back-reference
// ("Right. Building on that…") — only safe mid-segment, never after a
// topic pivot.
type ResponseType = "prose" | "code" | "math" | "list" | "heading" | "mixed" | "continuity";

type UserTemplate = {
  text: string;
  // Assistant templates whose `type` is in this list are the only ones
  // eligible for this user turn. Order doesn't matter; picking is uniform
  // over the matching set.
  accepts: readonly ResponseType[];
};

type AssistantTemplate = {
  text: string;
  type: ResponseType;
  // Selection weight inside a matching-type candidate set. Defaults to 1.
  // Long multi-paragraph templates take ~2 so the transcript leans toward
  // the lengths real assistant responses actually hit, instead of a wall
  // of 3-sentence replies.
  weight?: number;
};

// ── Templates ─────────────────────────────────────────────────────

// First turn of the whole conversation. Openers want overview-shaped
// replies — no single-snippet code answers, no continuity flavour.
const OPENER_TEMPLATES: readonly UserTemplate[] = [
  {
    text: "Can you explain how {TOPIC} works in practice?",
    accepts: ["prose", "heading", "mixed", "list"],
  },
  {
    text: "Summarize the key points of {TOPIC} for someone new to it.",
    accepts: ["heading", "list", "prose"],
  },
  {
    text: "I keep running into {TOPIC} — what's actually going on under the hood?",
    accepts: ["heading", "prose", "mixed"],
  },
  {
    text: "When would you reach for {TOPIC}?",
    accepts: ["prose", "list"],
  },
  {
    text: "What's the mental model I should have for {TOPIC}?",
    accepts: ["heading", "prose"],
  },
];

// First turn of a segment after the first. Reads as a pivot, not as if the
// user dropped the previous thread mid-sentence. Same shape as openers.
const TRANSITION_TEMPLATES: readonly UserTemplate[] = [
  {
    text: "Switching gears — can you walk me through {TOPIC}?",
    accepts: ["prose", "heading", "mixed", "list"],
  },
  {
    text: "That makes sense. Different topic: how does {TOPIC} work?",
    accepts: ["prose", "heading", "mixed"],
  },
  {
    text: "OK, new thread. I want to understand {TOPIC}.",
    accepts: ["heading", "prose", "list"],
  },
  {
    text: "Let's pivot to {TOPIC} — what's the short version?",
    accepts: ["prose", "list"],
  },
  {
    text: "Moving on: give me the overview of {TOPIC}.",
    accepts: ["heading", "prose", "mixed"],
  },
  {
    text: "Got it. One more thing, unrelated: {TOPIC}?",
    accepts: ["prose", "list"],
  },
];

// Mid-segment follow-ups. Reference the current topic as "that" / "it",
// or pull in the related topic so the segment moves without breaking
// thread. The `accepts` field is the main anti-incoherence mechanism:
// when the user asks "in Rust", the assistant must pick a code template.
const FOLLOWUP_TEMPLATES: readonly UserTemplate[] = [
  {
    text: "And how does that interact with {RELATED}?",
    accepts: ["prose", "mixed", "continuity", "list"],
  },
  {
    text: "Got it. Can you show me that in {LANGUAGE}?",
    accepts: ["code", "mixed"],
  },
  {
    text: "What about the failure cases?",
    accepts: ["list", "prose", "continuity"],
  },
  {
    text: "Why would you design it that way?",
    accepts: ["prose", "continuity"],
  },
  {
    text: "Is there a downside?",
    accepts: ["list", "prose", "continuity"],
  },
  {
    text: "Can you give me a concrete example?",
    accepts: ["code", "mixed"],
  },
  {
    text: "Interesting — and what if the input scales up?",
    accepts: ["prose", "continuity", "mixed"],
  },
  {
    text: "How does that compare with {RELATED}?",
    accepts: ["prose", "list", "continuity"],
  },
  {
    text: "Does that change when {RELATED} is in the mix?",
    accepts: ["prose", "continuity", "mixed"],
  },
  {
    text: "OK, and one more: what are the edge cases?",
    accepts: ["list", "prose"],
  },
  {
    text: "Wait — so what happens under backpressure here?",
    accepts: ["prose", "continuity"],
  },
  {
    text: "Can you put that into a short snippet?",
    accepts: ["code"],
  },
  {
    text: "Could you also sketch the math?",
    accepts: ["math"],
  },
  {
    text: "Walk me through it end to end.",
    accepts: ["heading", "mixed", "list"],
  },
];

const ASSISTANT_TEMPLATES: readonly AssistantTemplate[] = [
  // ── Short templates ──────────────────────────────────────────────

  // Plain paragraph
  {
    type: "prose",
    text: `Sure. {TOPIC} works by breaking the problem into bounded chunks. {SENTENCE_A}. The key insight is that {TAKEAWAY}.`,
  },

  // Code block
  {
    type: "code",
    text: `Here's a compact example.

\`\`\`{LANG_TAG}
{CODE}
\`\`\`

That's roughly it. {SENTENCE_A}.`,
  },

  // Math.
  // Note: `\${` escapes the dollar-brace sequence so JS doesn't interpret
  // `${FORMULA}` as a template-literal interpolation. The resulting string
  // still contains literal `$${FORMULA}$$` which the slot filler then
  // substitutes into `$$...$$` LaTeX delimiters.
  {
    type: "math",
    text: `The relationship for {TOPIC} is:

$\${FORMULA}$$

{SENTENCE_A}. In practice, {SENTENCE_B}.`,
  },

  // Short list
  {
    type: "list",
    text: `A few angles worth naming:

- {POINT_A}.
- {POINT_B}.
- {POINT_C}.

{SENTENCE_A}.`,
  },

  // Heading + paragraphs
  {
    type: "heading",
    text: `## {TOPIC}

{SENTENCE_A}. {SENTENCE_B}.

{SENTENCE_C}.`,
  },

  // Mixed prose + code + prose
  {
    type: "mixed",
    text: `The short version: {SENTENCE_A}.

\`\`\`{LANG_TAG}
{CODE}
\`\`\`

{SENTENCE_B}. {TAKEAWAY}.`,
  },

  // Continuity-flavored short prose (only picked mid-segment). Weighted
  // light so back-referencing flavor punctuates a segment instead of
  // dominating it.
  {
    type: "continuity",
    weight: 0.5,
    text: `Right. Building on that, {SENTENCE_A}. The piece that trips people up is {SENTENCE_B}.`,
  },
  {
    type: "continuity",
    weight: 0.5,
    text: `Yeah. The way I'd phrase it is: {SENTENCE_A}. Which is why, once {RELATED} enters the picture, {SENTENCE_B}.`,
  },
  {
    type: "continuity",
    weight: 0.5,
    text: `Exactly — {SENTENCE_A}. And to tie it back, the thing worth remembering is {TAKEAWAY}.`,
  },

  // ── Long templates (realistic assistant-length responses) ────────

  // Long comprehensive explanation with sub-headings + code + takeaway.
  {
    type: "heading",
    weight: 2,
    text: `## {TOPIC}

{SENTENCE_A}. The way I usually think about it: {SENTENCE_B}.

**How it works.** At a high level, {SENTENCE_C}. The runtime handles the sequencing so callers don't have to think about it on every call.

**Where it breaks down.** Once {RELATED} enters the picture, the guarantees get fuzzy. {SENTENCE_A}. That's why most production systems end up with a compensating mechanism layered on top.

**A concrete example.**

\`\`\`{LANG_TAG}
{CODE}
\`\`\`

{SENTENCE_B}. The takeaway is that {TAKEAWAY}.`,
  },

  // Long code-centric walkthrough — dominant mode is code, hence "mixed".
  {
    type: "mixed",
    weight: 2,
    text: `Let me walk through this one end to end.

The core problem: {SENTENCE_A}. A naive version buffers everything into memory, but that doesn't scale once {RELATED} is involved. Here's a compact {LANGUAGE} version that handles the general case:

\`\`\`{LANG_TAG}
{CODE}
\`\`\`

A few things worth noticing about that:

- {POINT_A}.
- {POINT_B}.
- {POINT_C}.

In practice, {SENTENCE_B}. And the general lesson — which shows up in almost every variant of this problem — is that {TAKEAWAY}.`,
  },

  // Long failure-modes list with explanations under each item.
  {
    type: "list",
    weight: 2,
    text: `Good question — the failure modes are where {TOPIC} gets genuinely interesting.

The three I'd flag:

1. **When {RELATED} enters the mix.** {SENTENCE_A}. You see this most often in multi-tenant setups where the coordinator doesn't own the underlying resource.
2. **Under sustained load.** {SENTENCE_B}. It's rarely the first request that breaks things; it's request number ten thousand.
3. **During reconnects.** {SENTENCE_C}. The state machine has to converge, and most implementations don't verify convergence — they just assume it.

The pattern across all three: {TAKEAWAY}. Which is, honestly, the thing most teams under-invest in until it bites them in production.`,
  },

  // Long math + unpacking.
  {
    type: "math",
    weight: 2,
    text: `The cleanest formulation I know for {TOPIC} looks like this:

$\${FORMULA}$$

Unpacking it a bit: {SENTENCE_A}. In plain terms, the denominator is what keeps the whole thing bounded as the input grows — without it, {SENTENCE_B}.

The practical implication is that {TAKEAWAY}. You'll find the same shape showing up whenever {RELATED} gets involved, just with different constants in front.`,
  },

  // Long "three things" with conclusion.
  {
    type: "list",
    weight: 2,
    text: `Three things to watch for around {TOPIC}:

1. {POINT_A}. That's the one that bites first if you skip it.
2. {POINT_B}. This becomes load-bearing the moment you introduce {RELATED}.
3. {POINT_C}. Nice property to have, easy to lose during refactors.

Past that, {TAKEAWAY}. Most of the rest is engineering ergonomics — they matter, but they're tractable once the core is right.`,
  },

  // Long pure-prose with RELATED continuity.
  {
    type: "prose",
    weight: 2,
    text: `Good question. At the core, {SENTENCE_A}. There's a subtlety though: once {RELATED} enters the picture, the assumptions underneath start to shift. {SENTENCE_B}.

The way this usually plays out in production: you ship the naive version, it works for months, then you hit a load pattern where {SENTENCE_C}. That's when the second-order effects show up.

The through-line, across every variant of this I've seen, is that {TAKEAWAY}.`,
  },

  // Long prose + inline emphasis, no code.
  {
    type: "prose",
    weight: 2,
    text: `Short answer: it depends, but the honest default is to lean toward {TOPIC}. The longer version takes a minute to unpack.

{SENTENCE_A}. The reason this matters is that {SENTENCE_B}, which is the piece most tutorials gloss over.

Where {TOPIC} earns its keep is the moment you start caring about {RELATED}. Up to that point you could have gotten away with something simpler. Past that point, you either adopt it or reinvent it. {TAKEAWAY}.`,
  },

  // Long comparative walkthrough: sets up {TOPIC} vs {RELATED} with a code
  // example in the middle and a closing recommendation.
  {
    type: "mixed",
    weight: 2,
    text: `Happy to. The short version is that {TOPIC} and {RELATED} solve adjacent problems, but they make different tradeoffs about where the state lives.

{SENTENCE_A}. The side-effect is subtle: {SENTENCE_B}, which only shows up once you cross a process boundary.

Concretely, a sketch:

\`\`\`{LANG_TAG}
{CODE}
\`\`\`

A couple of things to call out on that:

- {POINT_A}.
- {POINT_B}.

If I had to pick a default, I'd reach for {TOPIC} first and fall back to {RELATED} only when the workload demands it. {TAKEAWAY}.`,
  },

  // Long step-by-step walkthrough as a numbered list with explanations.
  {
    type: "list",
    weight: 2,
    text: `Walking through it end-to-end, the lifecycle looks like:

1. **Request arrives.** The runtime decides whether to admit it at all. {SENTENCE_A}.
2. **Admission gate.** This is where backpressure signals land. If the gate rejects, the client sees it immediately instead of queueing forever.
3. **Hand-off to the worker.** {SENTENCE_B}. The invariant worth preserving here is that the hand-off is cheap — no copies, no large allocations.
4. **Actual work.** {SENTENCE_C}. Most of the interesting metrics live at this step.
5. **Commit + notify.** A successful commit triggers downstream listeners; a failed commit unwinds cleanly without touching neighbors.

A couple of corollaries:

- {POINT_A}.
- {POINT_B}.

Once you internalize that lifecycle, {TAKEAWAY}.`,
  },
];

// ── Slot filling ──────────────────────────────────────────────────

type PairContext = {
  topic: string;
  related: string;
  language: string;
  langTag: string;
  code: string;
};

const fillSlots = (template: string, rng: () => number, ctx: PairContext): string => {
  const replacements: Record<string, string> = {
    TOPIC: ctx.topic,
    RELATED: ctx.related,
    // Kept for any legacy template that reaches for a comparison pair —
    // maps to (topic, related) so segment threading still holds.
    TOPIC_A: ctx.topic,
    TOPIC_B: ctx.related,
    LANGUAGE: ctx.language,
    LANG_TAG: ctx.langTag,
    TASK: pick(TASKS, rng),
    CODE: ctx.code,
    FORMULA: pick(FORMULAS, rng),
    SENTENCE_A: pick(SENTENCES, rng),
    SENTENCE_B: pick(SENTENCES, rng),
    SENTENCE_C: pick(SENTENCES, rng),
    POINT_A: pick(POINTS, rng),
    POINT_B: pick(POINTS, rng),
    POINT_C: pick(POINTS, rng),
    TAKEAWAY: pick(TAKEAWAYS, rng),
  };

  return template.replace(/\{(\w+)\}/g, (_, key) => replacements[key] ?? `{${key}}`);
};

// ── Post-processing ───────────────────────────────────────────────

// The vocab pools store sentences/points in lowercase so mid-sentence
// substitutions like "the key insight is that {TAKEAWAY}" read naturally.
// This capitalizes sentence starts after slot substitution: block start,
// after `. ` / `! ` / `? ` (optionally through a markdown emphasis
// closer), at the start of a new paragraph, and after list markers.
// Content inside ``` fenced code blocks is skipped so identifiers don't
// get mangled.
const capitalizeSentences = (text: string): string => {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return (
        part
          // Block start.
          .replace(/^(\s*)([a-z])/, (_, pre, c) => `${pre}${c.toUpperCase()}`)
          // After sentence-final punctuation, optionally through a
          // markdown emphasis closer (`**` / `*` / `__` / `_`), then
          // whitespace. Matches both "word. next" and "**word.** next".
          .replace(
            /([.!?])([*_]{0,2}\s+)([a-z])/g,
            (_, punct, mid, c) => `${punct}${mid}${c.toUpperCase()}`,
          )
          // Start of a new paragraph (one or more blank lines) where the
          // previous paragraph didn't end with a sentence terminator — a
          // short list followed by a continuation sentence, for example.
          .replace(/(\n{2,})([a-z])/g, (_, br, c) => `${br}${c.toUpperCase()}`)
          // Unordered list bullet at line start.
          .replace(/^(\s*[-*]\s+)([a-z])/gm, (_, pre, c) => `${pre}${c.toUpperCase()}`)
          // Numbered list item at line start.
          .replace(/^(\s*\d+\.\s+)([a-z])/gm, (_, pre, c) => `${pre}${c.toUpperCase()}`)
      );
    })
    .join("");
};

// ── Public API ────────────────────────────────────────────────────

export const generateConversation = (
  pairCount: number = DEFAULT_PAIR_COUNT,
  seed: number = 42,
): Message[] => {
  const rng = mulberry32(seed);
  const messages: Message[] = [];

  // Pick a fresh (topic, related) for a new segment. Guaranteed distinct so
  // follow-up templates that reference {RELATED} don't collapse into "how
  // does backpressure interact with backpressure?".
  const pickSegmentTopics = (): { topic: string; related: string } => {
    const topic = pick(TOPICS, rng);
    let related = pick(TOPICS, rng);
    while (related === topic && TOPICS.length > 1) {
      related = pick(TOPICS, rng);
    }
    return { topic, related };
  };

  const pickSegmentLength = (): number =>
    MIN_SEGMENT_LENGTH + Math.floor(rng() * (MAX_SEGMENT_LENGTH - MIN_SEGMENT_LENGTH + 1));

  const buildPairContext = (topic: string, related: string): PairContext => {
    const language = pick(LANGUAGES, rng);
    const snippets = CODE_SNIPPETS[language] ?? CODE_SNIPPETS.TypeScript;
    return {
      topic,
      related,
      language,
      langTag: LANG_TAGS[language],
      code: pick(snippets, rng),
    };
  };

  // Pick an assistant template that satisfies the user turn's allowed
  // response types. The `firstInSegment` guard keeps continuity templates
  // ("Right. Building on that…") out of opener / transition responses
  // where back-referencing doesn't make sense.
  const pickAssistantTemplate = (
    allowed: readonly ResponseType[],
    firstInSegment: boolean,
  ): AssistantTemplate => {
    const allowedSet = new Set<ResponseType>(allowed);
    const candidates = ASSISTANT_TEMPLATES.filter((t) => {
      if (!allowedSet.has(t.type)) return false;
      if (firstInSegment && t.type === "continuity") return false;
      return true;
    });
    if (candidates.length > 0) return pickWeighted(candidates, rng);
    // Defensive fallback: allow everything except continuity at segment
    // boundaries. In practice the `accepts` lists above always intersect
    // ASSISTANT_TEMPLATES, so this is dead code — kept so that future
    // edits to the template list can't silently produce empty candidate
    // sets and crash the picker.
    const fallback = ASSISTANT_TEMPLATES.filter(
      (t) => !(firstInSegment && t.type === "continuity"),
    );
    return pickWeighted(fallback, rng);
  };

  let { topic, related } = pickSegmentTopics();
  let turnsLeftInSegment = pickSegmentLength();
  let isFirstSegment = true;

  for (let i = 0; i < pairCount; i++) {
    const firstTurnInSegment = turnsLeftInSegment === 0 || i === 0;

    if (firstTurnInSegment && !isFirstSegment) {
      ({ topic, related } = pickSegmentTopics());
      turnsLeftInSegment = pickSegmentLength();
    }

    let userTemplate: UserTemplate;
    if (firstTurnInSegment && isFirstSegment) {
      userTemplate = pick(OPENER_TEMPLATES, rng);
    } else if (firstTurnInSegment) {
      userTemplate = pick(TRANSITION_TEMPLATES, rng);
    } else {
      userTemplate = pick(FOLLOWUP_TEMPLATES, rng);
    }

    const ctx = buildPairContext(topic, related);
    const userContent = capitalizeSentences(fillSlots(userTemplate.text, rng, ctx));
    const assistantTemplate = pickAssistantTemplate(userTemplate.accepts, firstTurnInSegment);
    const assistantContent = capitalizeSentences(fillSlots(assistantTemplate.text, rng, ctx));

    messages.push({ role: "user", content: userContent });
    messages.push({ role: "assistant", content: assistantContent });

    turnsLeftInSegment -= 1;
    if (isFirstSegment && turnsLeftInSegment <= 0) {
      isFirstSegment = false;
    }
  }

  return messages;
};
