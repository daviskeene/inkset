import type { Metadata, Viewport } from "next";
import { sans, reading, mono } from "./fonts";
import { RootChrome } from "../components/root-chrome";
// Self-host KaTeX CSS so the font files are bundled by Next and served
// same-origin. Using the CDN <link> caused a measurable font-swap flicker
// where pretext measured math blocks against the fallback font before the
// KaTeX webfonts arrived.
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "Inkset Playground",
  description: "Interactive demo of pretext-powered streaming markdown rendering",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const RESPONSIVE_CSS = `
@media (max-width: 768px) {
  .pg-aside,
  .pg-playground-controls-desktop,
  .pg-scenario-strip {
    display: none !important;
  }
  .pg-playground-controls {
    padding: 8px 14px !important;
    justify-content: flex-end !important;
  }
  .pg-playground-mobile-options {
    display: inline-flex !important;
  }
  .pg-chat-scroll {
    padding: 16px 14px 20px !important;
  }
  .pg-chat-input-wrap {
    padding: 10px 12px 14px !important;
  }
}
@media (min-width: 769px) {
  .pg-playground-mobile-options,
  .pg-mobile-menu {
    display: none !important;
  }
}

.pg-shimmer {
  background: linear-gradient(
    110deg,
    color-mix(in srgb, currentColor 30%, transparent) 30%,
    currentColor 50%,
    color-mix(in srgb, currentColor 30%, transparent) 70%
  );
  background-size: 200% 100%;
  background-position: 100% 0;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pg-shimmer-slide 1.8s linear infinite;
}
@keyframes pg-shimmer-slide {
  to { background-position: -100% 0; }
}

.pg-assistant-mount {
  animation: pg-assistant-fade-in 380ms ease-out both;
}
@keyframes pg-assistant-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .pg-assistant-mount { animation: none; }
}

/* Used by the custom-component scenario in SCENARIO_LIST. Radial glow
   animation anchored to each revealed token's pretext-computed origin. */
@keyframes pg-particle-burst {
  0%   { opacity: 0;   transform: scale(0.4); }
  45%  { opacity: 1;   transform: scale(1.6); }
  100% { opacity: 0;   transform: scale(2.4); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes pg-particle-burst {
    from, to { opacity: 0; transform: none; }
  }
}
`;

const RootLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${reading.variable} ${mono.variable}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_CSS }} />
      </head>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
          fontFeatureSettings: '"cv11", "ss01", "ss03"',
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <RootChrome>{children}</RootChrome>
      </body>
    </html>
  );
};

export default RootLayout;
