"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { prepareWithSegments } from "@chenglou/pretext";
import { loadHyphenator, type Hyphenator } from "@inkset/core";
import { knuthPlassLayout } from "../../lib/knuth-plass";
import { materializeLines, drawJustifiedLines } from "../../lib/canvas-text";

const PARAGRAPH = `Typography is the art of arranging letters and text so it becomes legible, readable, and visually appealing. The browser's greedy line-breaking algorithm fits as many words as possible on each line, which produces consistent measurements but leaves uneven white space. Knuth-Plass, famously used by TeX, treats line breaking as a global optimization over the whole paragraph — it chooses breaks so the spacing variance across lines is minimized, sometimes hyphenating long words to avoid a ragged river of white running down the middle of a column.`;

const FONT_SIZE = 15;
const LINE_HEIGHT = 22;
const FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";
const FONT_WEIGHT = 400;

const canvasFont = `${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`;

const MIN_WIDTH = 220;
const MAX_WIDTH = 620;
const DEFAULT_WIDTH = 360;

const COLUMN_PADDING = 16;

type Metrics = {
  lineCount: number;
  avgStretchRatio: number;
  maxStretchRatio: number;
  stretchStdDev: number;
  riverCount: number;
};

export default function JustificationComparisonPage() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [hyphensEnabled, setHyphensEnabled] = useState(true);
  const [hyphenator, setHyphenator] = useState<Hyphenator | null>(null);

  // Preload hyphenator once on mount. The setter wraps the function so React
  // doesn't treat it as a state updater (state setters call function args).
  useEffect(() => {
    loadHyphenator("en-us")
      .then((h) => setHyphenator(() => h))
      .catch((err) => {
        console.warn("[justification-demo] hyphenator failed to load:", err);
      });
  }, []);

  const paragraph = useMemo(() => {
    if (!hyphensEnabled || !hyphenator) return PARAGRAPH;
    return hyphenator(PARAGRAPH);
  }, [hyphensEnabled, hyphenator]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#ededed",
        fontFamily: FONT_FAMILY,
        padding: "24px 32px",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20 }}>
        <Link
          href="/"
          style={{ color: "#9aa", textDecoration: "none", fontSize: 13 }}
        >
          ← playground
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          Justification comparison
        </h1>
        <span style={{ fontSize: 12, opacity: 0.55 }}>
          Browser greedy vs. Pretext Knuth-Plass — same text, two line-breakers
        </span>
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "12px 16px",
          background: "#111",
          border: "1px solid #222",
          borderRadius: 6,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ opacity: 0.7 }}>Column width</span>
          <input
            type="range"
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            step={1}
            value={width}
            onChange={(e) => setWidth(Math.round(Number(e.target.value)))}
            style={{ width: 220, accentColor: "#888" }}
          />
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: 48 }}>
            {width}px
          </span>
        </label>

        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            opacity: hyphensEnabled ? 1 : 0.5,
          }}
        >
          <input
            type="checkbox"
            checked={hyphensEnabled}
            onChange={() => setHyphensEnabled((v) => !v)}
            style={{ accentColor: "#888" }}
          />
          Hyphenation (en-us)
        </label>

        {!hyphenator && (
          <span style={{ fontSize: 12, opacity: 0.5 }}>loading hyphenator…</span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(2, ${width + COLUMN_PADDING * 2}px)`,
          gap: 20,
        }}
      >
        <Column
          label="Browser greedy (DOM)"
          accent="#c66"
          subtitle="browser's native line-breaker, text-align: justify"
        >
          <CssColumn text={paragraph} width={width} hyphensEnabled={hyphensEnabled} />
        </Column>

        <Column
          label="Pretext Knuth-Plass"
          accent="#4caa7a"
          subtitle="DP over pretext segments, minimum-badness breaks"
        >
          <PretextCanvas text={paragraph} width={width} />
        </Column>
      </div>
    </div>
  );
}

// ── Column chrome ──────────────────────────────────────────────────

function Column({
  label,
  subtitle,
  accent,
  children,
}: {
  label: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 6,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #222" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: accent,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ padding: COLUMN_PADDING }}>{children}</div>
    </div>
  );
}

// ── CSS column ─────────────────────────────────────────────────────

function CssColumn({
  text,
  width,
  hyphensEnabled,
}: {
  text: string;
  width: number;
  hyphensEnabled: boolean;
}) {
  return (
    <>
      <div
        lang="en-us"
        style={{
          width,
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZE,
          lineHeight: `${LINE_HEIGHT}px`,
          color: "#ededed",
          textAlign: "justify",
          hyphens: hyphensEnabled ? "manual" : "none",
          WebkitHyphens: hyphensEnabled ? "manual" : "none",
          wordSpacing: "normal",
        }}
      >
        {text}
      </div>
      <MetricsNote
        lines="browser-computed"
        note="CSS doesn't expose per-line spacing metrics — inspect visually."
      />
    </>
  );
}

// ── Pretext canvas columns ─────────────────────────────────────────

function PretextCanvas({
  text,
  width,
}: {
  text: string;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  // Synchronous layout effect so the canvas resizes in the same commit as the
  // CSS column next to it — otherwise canvas.style.width lags by one frame and
  // the two columns visibly drift sub-pixel during a drag.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const prepared = prepareWithSegments(text, canvasFont);
      const { lines } = knuthPlassLayout(prepared, width);
      const materialized = materializeLines(prepared, lines, width);

      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const cssHeight = Math.max(LINE_HEIGHT, LINE_HEIGHT * materialized.lines.length);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, cssHeight);

      drawJustifiedLines(ctx, materialized.lines, {
        font: canvasFont,
        lineHeight: LINE_HEIGHT,
        color: "#ededed",
        justify: true,
      });

      setMetrics({
        lineCount: materialized.lines.length,
        avgStretchRatio: materialized.avgStretchRatio,
        maxStretchRatio: materialized.maxStretchRatio,
        stretchStdDev: materialized.stretchStdDev,
        riverCount: materialized.riverCount,
      });
    } catch (err) {
      console.warn("[justification-demo] pretext layout failed:", err);
    }
  }, [text, width]);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <MetricsRow metrics={metrics} />
    </>
  );
}

// ── Metrics display ────────────────────────────────────────────────

function MetricsRow({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return <MetricsNote lines="—" />;
  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 10px",
        background: "#161616",
        border: "1px solid #222",
        borderRadius: 4,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 12,
        rowGap: 2,
        opacity: 0.85,
      }}
    >
      <span style={{ opacity: 0.55 }}>lines</span>
      <span>{metrics.lineCount}</span>
      <span style={{ opacity: 0.55 }}>slack mean</span>
      <span>{(metrics.avgStretchRatio * 100).toFixed(1)}%</span>
      <span style={{ opacity: 0.55 }}>slack σ</span>
      <span>{(metrics.stretchStdDev * 100).toFixed(2)}%</span>
      <span style={{ opacity: 0.55 }}>max slack</span>
      <span>{(metrics.maxStretchRatio * 100).toFixed(1)}%</span>
      <span style={{ opacity: 0.55 }}>rivers</span>
      <span>{metrics.riverCount}</span>
    </div>
  );
}

function MetricsNote({ lines, note }: { lines: string; note?: string }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 10px",
        background: "#161616",
        border: "1px solid #222",
        borderRadius: 4,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        opacity: 0.7,
      }}
    >
      <div>lines: {lines}</div>
      {note && <div style={{ marginTop: 2, opacity: 0.7 }}>{note}</div>}
    </div>
  );
}
