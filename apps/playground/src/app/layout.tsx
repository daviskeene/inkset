import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import { RootChrome } from "../components/root-chrome";
// Self-host KaTeX CSS so the font files are bundled by Next and served
// same-origin. Using the CDN <link> caused a measurable font-swap flicker
// where pretext measured math blocks against the fallback font before the
// KaTeX webfonts arrived.
import "katex/dist/katex.min.css";

const SITE_URL = "https://inkset.dev";
const SITE_NAME = "Inkset";
const SITE_TAGLINE = "a rendering library for AI chat UIs in React";
const SITE_DESCRIPTION =
  "Inkset is a streaming-first markdown renderer for React: pretext-powered layout, stable during token-by-token streams, plugin-driven for code, math, tables, and diagrams.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: "/inkset-mark.svg",
    shortcut: "/inkset-mark.svg",
    apple: "/inkset-mark.svg",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const RESPONSIVE_CSS = `
/* Prevent body-level horizontal scroll on any page. Any overflow from a
   child (wide code block, unexpected layout) is clipped at the root, not
   shifted via scroll. */
html, body {
  overflow-x: hidden;
  max-width: 100%;
}
html, body, .pg-root {
  box-sizing: border-box;
}
*, *::before, *::after {
  box-sizing: inherit;
}

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

.pg-playground-markdown a,
.pg-playground-markdown a:visited {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--pg-border-default);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.pg-playground-markdown a:hover {
  text-decoration-color: currentColor;
}

@keyframes pg-reveal-dither-in {
  0% {
    opacity: 0.06;
    filter: blur(2.6px);
    transform: translateY(0.028em);
    text-shadow: 0 0 0.22em rgba(172, 204, 228, 0.1);
  }
  20% {
    opacity: 0.42;
    filter: blur(1.8px);
    transform: translateY(0.018em);
    text-shadow: 0 0 0.14em rgba(172, 204, 228, 0.08);
  }
  48% {
    opacity: 0.78;
    filter: blur(1px);
    transform: translateY(0.01em);
    text-shadow: none;
  }
  76% {
    opacity: 0.94;
    filter: blur(0.35px);
    transform: translateY(0.003em);
    text-shadow: none;
  }
  88% {
    opacity: 0.98;
    filter: blur(0.08px);
    transform: none;
    text-shadow: none;
  }
  100% {
    opacity: 1;
    filter: none;
    transform: none;
    text-shadow: none;
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

/* Used by the ink-sweep-reveal scenario. Radial glow animation anchored
   to each revealed token's pretext-computed origin. */
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
