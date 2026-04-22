"use client";

import { useEffect, useState } from "react";
import type { RevealComponent, RevealComponentProps, RevealProp } from "@inkset/react";

export const STREAM_WITH_ANIMATION_REVEAL: RevealProp = {
  throttle: {
    delayInMs: 58,
    chunking: "word",
  },
  timeline: {
    durationMs: 260,
    stagger: 36,
    sep: "word",
  },
  css: {
    preset: "blurIn",
  },
};

export const INK_DITHER_SHADER_REVEAL: RevealProp = {
  throttle: {
    delayInMs: 63,
    chunking: "word",
  },
  timeline: {
    durationMs: 440,
    stagger: 36,
    sep: "word",
    order: "layout",
    maxSpanMs: 640,
  },
  css: {
    preset: "pg-reveal-dither-in",
    easing: "cubic-bezier(.2,.78,.22,1)",
  },
  shader: {
    source: "ink-dither",
    options: {
      tint: "130, 150, 168",
      fogTint: "172, 204, 228",
      alpha: 0.13,
      fogAlpha: 0.022,
      minLifetimeMs: 450,
      lifetimeScale: 1.12,
      gridSize: 2.8,
      dotMinSize: 0.82,
      dotMaxSize: 1.72,
      blurStartPx: 2.8,
      blurEndPx: 0.18,
      jitterPx: 0.28,
      expandX: 3.2,
      expandY: 1.8,
      bandTop: 0.3,
      bandHeight: 0.46,
    },
  },
};

// Phase 4 demo: custom RevealComponent. Renders a warm ink-like sweep behind
// each token while the glyphs sharpen into place. Width/height are threaded in
// from pretext so the wash can size itself to the measured token box.
const InkSweepReveal: RevealComponent = ({
  children,
  width,
  height,
  delayMs,
  durationMs,
}: RevealComponentProps) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);
    const frameId = window.requestAnimationFrame(() => {
      setActive(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const tokenWidth = Math.max(width, 12);
  const tokenHeight = Math.max(height, 18);
  const sweepHeight = Math.max(tokenHeight * 0.72, 14);
  const sweepOffsetY = Math.max((tokenHeight - sweepHeight) * 0.55, 1);
  const horizontalInset = Math.max(tokenWidth * 0.08, 2);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        isolation: "isolate",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: `-${horizontalInset}px`,
          top: `${sweepOffsetY}px`,
          width: `${tokenWidth + horizontalInset * 2}px`,
          height: `${sweepHeight}px`,
          pointerEvents: "none",
          borderRadius: Math.max(sweepHeight * 0.42, 8),
          background:
            "linear-gradient(90deg, rgba(198,142,42,0) 0%, rgba(230,187,84,0.32) 18%, rgba(245,214,128,0.72) 50%, rgba(222,174,66,0.24) 82%, rgba(198,142,42,0) 100%)",
          opacity: active ? 0 : 1,
          transform: active ? "translateX(28%) scaleX(1.08)" : "translateX(-32%) scaleX(0.82)",
          transformOrigin: "left center",
          transitionProperty: "transform, opacity",
          transitionDuration: `${Math.max(durationMs * 0.9, 220)}ms`,
          transitionTimingFunction: "cubic-bezier(.18,.82,.22,1)",
          transitionDelay: `${delayMs}ms`,
          mixBlendMode: "multiply",
          zIndex: 0,
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          display: "inline-block",
          opacity: active ? 1 : 0.18,
          filter: active ? "blur(0px)" : "blur(5px)",
          transform: active ? "translateY(0)" : "translateY(0.05em)",
          transitionProperty: "opacity, filter, transform",
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: "cubic-bezier(.2,.82,.2,1)",
          transitionDelay: `${delayMs}ms`,
          willChange: "opacity, filter, transform",
        }}
      >
        {children}
      </span>
    </span>
  );
};

export const INK_SWEEP_REVEAL: RevealProp = {
  // Cadence tuned to feel like a steady typed-out stream: ~17 tok/s matches
  // stream-animated, but the custom component leans more editorial than
  // decorative: a short wash + sharpen, not an effects-heavy spectacle.
  throttle: { delayInMs: 60, chunking: "word" },
  timeline: {
    durationMs: 320,
    stagger: 42,
    sep: "word",
    order: "layout",
    maxSpanMs: 600,
  },
  css: false,
  component: InkSweepReveal,
};

export type RevealKey = "stream-with-animation" | "ink-sweep" | "ink-dither-shader";

export const REVEAL_PRESETS: Record<RevealKey, RevealProp> = {
  "stream-with-animation": STREAM_WITH_ANIMATION_REVEAL,
  "ink-sweep": INK_SWEEP_REVEAL,
  "ink-dither-shader": INK_DITHER_SHADER_REVEAL,
};
