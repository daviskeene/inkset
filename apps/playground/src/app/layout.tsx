import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import { RootChrome } from "../components/root-chrome";
// Self-host KaTeX CSS so the font files are bundled by Next and served
// same-origin. Using the CDN <link> caused a measurable font-swap flicker
// where pretext measured math blocks against the fallback font before the
// KaTeX webfonts arrived.
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "Inkset Playground",
  description: "Interactive demo of pretext-powered streaming markdown rendering",
  icons: {
    icon: "/inkset-mark.svg",
    shortcut: "/inkset-mark.svg",
    apple: "/inkset-mark.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const RESPONSIVE_CSS = `
@media (max-width: 768px) {
  .pg-aside,
  .pg-playground-controls,
  .pg-scenario-strip {
    display: none !important;
  }
  .pg-chat-scroll {
    padding: 16px 14px 20px !important;
  }
  .pg-chat-input-wrap {
    padding: 10px 12px 14px !important;
  }
}
@media (min-width: 769px) {
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

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning style={fontVariables as CSSProperties}>
      <head>
        {/* Progressive-enhancement webfont load. Fetched by the browser at
            runtime (not at build time), so a networkless build still succeeds;
            if the fetch fails, the font-family stacks in fonts.ts fall back to
            system faces. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Franklin:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
        />
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
