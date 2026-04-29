"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Inkset } from "@inkset/react";
import { INK_DITHER_SHADER_REVEAL } from "../../lib/reveal-presets";

const ANIMATE_EXAMPLE_TEXT =
  "Fresh tokens can reveal with pacing, staggered timing, and a shader overlay while the final text remains ordinary markdown.";

export const DocsAnimateExample = ({ width }: { width: number }) => {
  const [content, setContent] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [runId, setRunId] = useState(0);

  const replay = useCallback(() => {
    setRunId((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setContent("");
    setStreaming(true);

    const tokens = ANIMATE_EXAMPLE_TEXT.match(/\S+\s*/g) ?? [];
    let index = 0;

    const tick = () => {
      if (cancelled) return;
      if (index >= tokens.length) {
        setStreaming(false);
        return;
      }

      setContent((prev) => prev + tokens[index]);
      index += 1;
      window.setTimeout(tick, 90);
    };

    const startId = window.setTimeout(tick, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(startId);
    };
  }, [runId]);

  return (
    <div
      style={{
        margin: "14px 0 18px",
        padding: "14px 16px 16px",
        borderRadius: 8,
        background: "var(--pg-surface-raised)",
        boxShadow: "inset 0 0 0 1px var(--pg-border-subtle)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-sans), system-ui, sans-serif",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--pg-text-muted)",
          }}
        >
          Reveal preview
        </div>
        <button
          type="button"
          onClick={replay}
          style={{
            minHeight: 40,
            padding: "0 12px",
            border: "1px solid var(--pg-border-subtle)",
            borderRadius: 6,
            background: "var(--pg-surface)",
            color: "var(--pg-text-primary)",
            font: "inherit",
            fontSize: 12,
            cursor: "pointer",
            transition: "transform 120ms ease, border-color 120ms ease, background 120ms ease",
          }}
        >
          Replay
        </button>
      </div>

      <Inkset
        key={runId}
        content={content}
        streaming={streaming}
        width={Math.max(260, Math.min(width - 32, 640))}
        font='"Libre Franklin", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif'
        fontSize={16}
        lineHeight={27}
        reveal={INK_DITHER_SHADER_REVEAL}
        blockSpacing={{ default: 0 }}
        theme={{
          colors: {
            text: "var(--pg-text-primary)",
            textMuted: "var(--pg-text-muted)",
          },
        }}
      />
    </div>
  );
};
