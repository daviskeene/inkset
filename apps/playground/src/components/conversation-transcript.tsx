"use client";

// Renders a stacked transcript of user + assistant messages. Used by the
// "long conversations" scenario to prove Inkset stays responsive with
// hundreds of mounted messages.
//
// Virtualized via react-virtuoso: only the ~5-10 visible messages (plus an
// over-draw margin) have live <Inkset> instances. Earlier versions mounted
// one Inkset per assistant message, which meant a browser resize kicked off
// an independent pipeline relayout on all 300 of them. With virtualization
// the resize workload scales with viewport size, not transcript length.

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Inkset, type InksetTheme } from "@inkset/react";
import type { InksetPlugin } from "@inkset/core";
import type { Message } from "../lib/scenarios";

// Bumped from the default 500. Cheap per instance, and the transcript's
// varied content churns through more unique segments than a single
// message normally does.
const TRANSCRIPT_CACHE_SIZE = 1000;

// Extra pixels of off-screen content Virtuoso keeps mounted above and below
// the viewport. Large enough that a short fling past the viewport edge lands
// on an already-measured item instead of a placeholder gap.
const VIEWPORT_OVERDRAW_PX = 600;

type Props = {
  messages: Message[];
  plugins: InksetPlugin[];
  width: number | undefined;
  font: string;
  theme: InksetTheme | undefined;
  /** Cap for the centered reading column. Matches the playground's CHAT_MAX_WIDTH. */
  maxWidth: number;
  /** Horizontal padding between the scroll container and the reading column. */
  sidePadding: number;
};

export const ConversationTranscript = ({
  messages,
  plugins,
  width,
  font,
  theme,
  maxWidth,
  sidePadding,
}: Props) => {
  const [mountMs, setMountMs] = useState<number | null>(null);
  const mountStartRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : 0);

  useEffect(() => {
    // Two rAFs so the initially visible tail items have had a chance to run
    // their first pipeline tick and commit measured heights.
    let frame1 = 0;
    const frame2 = requestAnimationFrame(() => {
      frame1 = requestAnimationFrame(() => {
        setMountMs(performance.now() - mountStartRef.current);
      });
    });
    return () => {
      cancelAnimationFrame(frame2);
      if (frame1) cancelAnimationFrame(frame1);
    };
  }, []);

  const messageCount = messages.length;

  // Header carries the metric strip. Memoized so its identity only changes
  // when the values it renders do — otherwise Virtuoso would tear down and
  // rebuild the header on every parent render.
  const Header = useMemo(() => {
    const Component = () => (
      <div
        style={{
          padding: `28px ${sidePadding}px 12px`,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth }}>
          <MetricStrip count={messageCount} mountMs={mountMs} />
        </div>
      </div>
    );
    Component.displayName = "TranscriptHeader";
    return Component;
  }, [messageCount, mountMs, maxWidth, sidePadding]);

  const Footer = useMemo(() => {
    const Component = () => <div style={{ height: 24 }} aria-hidden />;
    Component.displayName = "TranscriptFooter";
    return Component;
  }, []);

  return (
    <Virtuoso
      data={messages}
      style={{
        flex: 1,
        minHeight: 0,
        overscrollBehaviorY: "contain",
      }}
      increaseViewportBy={VIEWPORT_OVERDRAW_PX}
      components={{ Header, Footer }}
      itemContent={(_index, msg) => (
        <TranscriptRow
          msg={msg}
          plugins={plugins}
          width={width}
          font={font}
          theme={theme}
          maxWidth={maxWidth}
          sidePadding={sidePadding}
        />
      )}
    />
  );
};

// ── Row wrapper ───────────────────────────────────────────────────
// Centers each message in the reading column and adds vertical rhythm.
// Split from itemContent so React can reconcile a stable component type
// as Virtuoso recycles row slots.

type RowProps = {
  msg: Message;
  plugins: InksetPlugin[];
  width: number | undefined;
  font: string;
  theme: InksetTheme | undefined;
  maxWidth: number;
  sidePadding: number;
};

const TranscriptRow = ({ msg, plugins, width, font, theme, maxWidth, sidePadding }: RowProps) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: `0 ${sidePadding}px`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          paddingBottom: 18,
        }}
      >
        {msg.role === "user" ? (
          <UserBubble text={msg.content} />
        ) : (
          <TranscriptAssistantMessage
            content={msg.content}
            plugins={plugins}
            width={width}
            font={font}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
};

// ── Metric strip ──────────────────────────────────────────────────

const MetricStrip = ({ count, mountMs }: { count: number; mountMs: number | null }) => {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        fontSize: 12,
        color: "var(--pg-text-muted)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <span>{count.toLocaleString()} messages</span>
      <span aria-hidden>·</span>
      <span>{mountMs != null ? `${Math.round(mountMs)}ms mount` : "measuring…"}</span>
      <span aria-hidden>·</span>
      <span>virtualized</span>
      <span aria-hidden>·</span>
      <span>scroll and resize to test</span>
    </div>
  );
};

// ── User bubble ───────────────────────────────────────────────────
// Mirrors the playground's existing UserBubble visual. Kept local so the
// transcript doesn't reach back into playground-client.tsx.

const UserBubble = ({ text }: { text: string }) => {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: 18,
          background: "var(--pg-user-bubble-bg)",
          color: "var(--pg-user-bubble-text)",
          fontSize: 15,
          lineHeight: 1.5,
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ── Assistant message (static) ────────────────────────────────────
// Stripped-down version of the playground's <AssistantMessage>: no copy
// button, no feedback icons, no regenerate. Just the Inkset column.
// Memoized hard so scrolling through hundreds of instances doesn't
// re-render every visible one on each parent state change.

type AssistantProps = {
  content: string;
  plugins: InksetPlugin[];
  width: number | undefined;
  font: string;
  theme: InksetTheme | undefined;
};

const TranscriptAssistantMessage = memo(
  function TranscriptAssistantMessage({ content, plugins, width, font, theme }: AssistantProps) {
    return (
      <div
        style={{
          width: width ?? "100%",
          visibility: width == null ? "hidden" : "visible",
        }}
      >
        <Inkset
          content={content}
          streaming={false}
          plugins={plugins}
          width={width}
          font={font}
          fontSize={15}
          lineHeight={24}
          blockSpacing={{ default: 12 }}
          headingSizes={[2, 1.5, 1.2, 1]}
          theme={theme}
          cacheSize={TRANSCRIPT_CACHE_SIZE}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.width === next.width &&
    prev.font === next.font &&
    prev.theme === next.theme &&
    prev.plugins === next.plugins,
);
