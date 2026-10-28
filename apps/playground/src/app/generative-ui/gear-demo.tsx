"use client";

import { useEffect, useRef, useState } from "react";
import { createStateStore, type Spec } from "@json-render/core";
import { JSONUIProvider, Renderer } from "@json-render/react";
import {
  InksetParts,
  type InksetPart,
  type InksetSurfacePart,
  type InksetTheme,
} from "@inkset/react";
import { SiteNav } from "../../components/site-nav";
import { Footer } from "../../components/footer";
import { reading } from "../fonts";
import { gearCatalog, SessionContext, type SurfaceSession } from "./gear-catalog";
import { TURNS, type ReplayEvent } from "./model-replay";

const READING_FONT_FAMILY = `${reading.style.fontFamily}, "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif`;

// Site palette variables, so the answer follows every playground theme.
const THEME: InksetTheme = {
  colors: {
    text: "var(--pg-text-primary)",
    textMuted: "var(--pg-text-muted)",
    hr: "var(--pg-divider)",
  },
  typography: {
    fontFamily: READING_FONT_FAMILY,
    headingTracking: { h1: "0", h2: "0", h3: "0", h4: "0" },
  },
};

// About 125 characters a second, near a fast model's output rate.
const CHARS_PER_TICK = 3;
const TICK_MS = 24;

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; turn: number; parts: InksetPart<Spec>[]; done: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const GearSurface = ({ session, spec }: { session: SurfaceSession; spec: Spec }) => (
  <SessionContext.Provider value={session}>
    <JSONUIProvider registry={gearCatalog} store={session.store}>
      <Renderer registry={gearCatalog} spec={spec} />
    </JSONUIProvider>
  </SessionContext.Provider>
);

/** The replayed conversation: the thread and a composer that asks the next question. */
export const GearConversation = ({ stickyComposer = false }: { stickyComposer?: boolean }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextTurn, setNextTurn] = useState(0);
  const [busy, setBusy] = useState(false);
  const sessions = useRef(new Map<string, SurfaceSession>());
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );

  const updatePart = (id: string, update: (part: InksetPart<Spec>) => InksetPart<Spec>) =>
    setMessages((current) =>
      current.map((message) =>
        message.role === "assistant" && message.parts.some((part) => part.id === id)
          ? {
              ...message,
              parts: message.parts.map((part) => (part.id === id ? update(part) : part)),
            }
          : message,
      ),
    );

  const addPart = (messageId: string, part: InksetPart<Spec>) =>
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.role === "assistant"
          ? { ...message, parts: [...message.parts, part] }
          : message,
      ),
    );

  // A new surface gets its own state store; a revision of an existing one keeps
  // every value the reader changed and only refreshes the rest.
  const applySurface = (messageId: string, event: Extract<ReplayEvent, { type: "surface" }>) => {
    const session = sessions.current.get(event.part);
    if (!session) {
      sessions.current.set(event.part, {
        store: createStateStore(event.spec.state ?? {}),
        touched: new Set(),
      });
      addPart(messageId, { id: event.part, type: "surface", data: event.spec });
      return;
    }
    const untouched: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event.spec.state ?? {})) {
      if (!session.touched.has(`/${key}`)) untouched[`/${key}`] = value;
    }
    session.store.update(untouched);
    updatePart(event.part, (part) => ({ ...part, data: event.spec }) as InksetPart<Spec>);
  };

  const ask = async (turn: number) => {
    const current = ++run.current;
    const messageId = `assistant-${turn}`;
    setBusy(true);
    setMessages((existing) => [
      ...existing,
      { id: `user-${turn}`, role: "user", text: TURNS[turn].question },
      { id: messageId, role: "assistant", turn, parts: [], done: false },
    ]);
    await wait(350);

    for (const event of TURNS[turn].events) {
      if (current !== run.current) return;
      if (event.type === "surface") {
        applySurface(messageId, event);
        await wait(300);
        continue;
      }
      addPart(messageId, { id: event.part, type: "markdown", content: "", streaming: true });
      for (let end = CHARS_PER_TICK; ; end += CHARS_PER_TICK) {
        await wait(TICK_MS);
        if (current !== run.current) return;
        const finished = end >= event.text.length;
        updatePart(event.part, () => ({
          id: event.part,
          type: "markdown",
          content: event.text.slice(0, end),
          streaming: !finished,
        }));
        if (finished) break;
      }
    }

    setMessages((existing) =>
      existing.map((message) => (message.id === messageId ? { ...message, done: true } : message)),
    );
    setNextTurn(turn + 1);
    setBusy(false);
  };

  const replay = () => {
    run.current++;
    sessions.current = new Map();
    setMessages([]);
    setNextTurn(0);
    setBusy(false);
  };

  const renderSurface = (part: InksetSurfacePart<Spec>) => (
    <GearSurface session={sessions.current.get(part.id)!} spec={part.data} />
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: 18,
                background: "var(--pg-user-bubble-bg)",
                color: "var(--pg-user-bubble-text)",
                fontSize: 15,
                lineHeight: 1.5,
              }}
            >
              {message.text}
            </div>
          </div>
        ) : (
          <div key={message.id} style={{ display: "grid", gap: 12 }}>
            <InksetParts
              parts={message.parts}
              renderSurface={renderSurface}
              font={READING_FONT_FAMILY}
              fontSize={15}
              lineHeight={24}
              blockSpacing={{ default: 12 }}
              headingSizes={[2, 1.5, 1.2, 1]}
              theme={THEME}
              loadingFallback={null}
              style={{ gap: 18 }}
            />
            {message.done && <ModelOutput events={TURNS[message.turn].events} />}
          </div>
        ),
      )}

      <div
        style={{
          position: stickyComposer ? "sticky" : undefined,
          bottom: 0,
          padding: "12px 0 20px",
          marginTop: "auto",
          background: "var(--pg-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 10px 10px 16px",
            borderRadius: 18,
            border: "1px solid var(--pg-border-default)",
            background: "var(--pg-surface)",
            fontSize: 15,
          }}
        >
          <span
            style={{
              flex: 1,
              color: nextTurn < TURNS.length ? "var(--pg-text-primary)" : "var(--pg-text-muted)",
            }}
          >
            {nextTurn < TURNS.length ? TURNS[nextTurn].question : "That's the whole replay."}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => (nextTurn < TURNS.length ? ask(nextTurn) : replay())}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              background: busy ? "var(--pg-submit-disabled-bg)" : "var(--pg-submit-bg)",
              color: busy ? "var(--pg-submit-disabled-text)" : "var(--pg-submit-text)",
              font: "inherit",
              fontSize: 14,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {nextTurn < TURNS.length ? "Ask" : "Replay"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const GearDemo = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      background: "var(--pg-bg)",
      color: "var(--pg-text-primary)",
      fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
    }}
  >
    <SiteNav />
    <main
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 760,
        margin: "0 auto",
        padding: "40px 20px 0",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <header style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: "-0.02em" }}>
          Generative UI
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--pg-text-muted)" }}>
          A replay of a model answering two questions about bike gears. The answer streams as
          Markdown, the explorer arrives as a json-render spec, and Inkset keeps your settings in
          place while the model keeps writing and later updates it.
        </p>
      </header>
      <GearConversation stickyComposer />
    </main>
    <Footer />
  </div>
);

const ModelOutput = ({ events }: { events: ReplayEvent[] }) => (
  <details style={{ fontSize: 13, color: "var(--pg-text-muted)" }}>
    <summary style={{ cursor: "pointer", width: "fit-content" }}>What the model sent</summary>
    <pre
      style={{
        margin: "10px 0 0",
        padding: 14,
        maxHeight: 360,
        overflow: "auto",
        borderRadius: 10,
        border: "1px solid var(--pg-border-subtle)",
        background: "var(--pg-surface)",
        color: "var(--pg-text-primary)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
      }}
    >
      {JSON.stringify(events, null, 2)}
    </pre>
  </details>
);
