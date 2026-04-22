import { promises as fs } from "node:fs";
import path from "node:path";
import type { RevealKey } from "./reveal-presets";
import { DEFAULT_PAIR_COUNT, generateConversation } from "./long-conversation";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type ScenarioData = {
  key: string;
  label: string;
  description: string;
  group: "plugins" | "animations";
  userPrompt: string;
  assistant: string;
  // If present, the playground renders a stacked transcript instead of a
  // single user+assistant pair. Used by the long-conversation demo.
  messages?: Message[];
  stream?: boolean;
  streamInitialChunkSize?: number;
  revealKey?: RevealKey;
};

// The index defines display order, tab metadata, streaming config, and which
// reveal preset (if any) to hydrate on the client. The markdown body for each
// scenario lives in src/content/demos/<key>.md so prose edits stay out of
// component code.
type ScenarioMeta = Omit<ScenarioData, "assistant">;

const SCENARIO_INDEX: ScenarioMeta[] = [
  {
    key: "mixed",
    label: "what is inkset",
    description: "what it is, why it exists, and why pretext matters",
    group: "plugins",
    userPrompt: "How do I display AI output in my React/Next.js app?",
  },
  {
    key: "code",
    label: "show me code",
    description: "three sorting algorithms, syntax highlighted",
    group: "plugins",
    userPrompt: "Show me three classic sorting algorithms in TypeScript.",
  },
  {
    key: "diagram",
    label: "draw me a diagram",
    description: "streaming chat request lifecycle, via mermaid",
    group: "plugins",
    userPrompt:
      "Sketch the lifecycle of a streaming chat request from user input through response.",
  },
  {
    key: "math",
    label: "give me math",
    description: "linear algebra fundamentals, rendered with KaTeX",
    group: "plugins",
    userPrompt: "Walk me through the linear algebra fundamentals I'd need for ML.",
  },
  {
    key: "long-conversation",
    label: "long conversations",
    description: `${DEFAULT_PAIR_COUNT * 2} stacked messages, scroll to prove it`,
    group: "plugins",
    userPrompt: "Show me what a long multi-turn conversation looks like.",
  },
  {
    key: "stream",
    label: "stream it",
    description: "plain token-by-token streaming",
    group: "animations",
    userPrompt: "What makes Inkset different from DOM-based renderers?",
    stream: true,
    streamInitialChunkSize: 4,
  },
  {
    key: "stream-animated",
    label: "stream animated",
    description: "throttle + blur-in, staggered by layout order",
    group: "animations",
    userPrompt: "What makes Inkset different from DOM-based renderers?",
    stream: true,
    streamInitialChunkSize: 0,
    revealKey: "stream-with-animation",
  },
  {
    key: "ink-sweep-reveal",
    label: "ink sweep",
    description: "user-supplied RevealComponent with warm sweep",
    group: "animations",
    userPrompt: "Show me a custom reveal component.",
    stream: true,
    streamInitialChunkSize: 0,
    revealKey: "ink-sweep",
  },
];

const DEMOS_DIR = path.join(process.cwd(), "src", "content", "demos");

export const loadScenarios = async (): Promise<ScenarioData[]> => {
  return Promise.all(
    SCENARIO_INDEX.map(async (meta) => {
      // Long-conversation is generated programmatically. Its "assistant"
      // field is kept as a placeholder so single-message code paths that
      // read it don't crash; the transcript comes from `messages`.
      if (meta.key === "long-conversation") {
        const messages = generateConversation();
        const firstAssistant = messages.find((m) => m.role === "assistant")?.content ?? "";
        return { ...meta, assistant: firstAssistant, messages };
      }
      const body = await fs.readFile(path.join(DEMOS_DIR, `${meta.key}.md`), "utf-8");
      return { ...meta, assistant: body.trimEnd() };
    }),
  );
};
