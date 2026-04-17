import type { Metadata, Viewport } from "next";
import { sans, reading, mono } from "./fonts";

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
  .pg-desktop-controls,
  .pg-scenario-strip,
  .pg-justification-link,
  .pg-playground-label {
    display: none !important;
  }
  .pg-header {
    padding: 10px 14px !important;
  }
  .pg-chat-scroll {
    padding: 16px 14px 20px !important;
  }
  .pg-chat-input-wrap {
    padding: 10px 12px 14px !important;
  }
}
@media (min-width: 769px) {
  .pg-menu-btn,
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
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${reading.variable} ${mono.variable}`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css"
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
          letterSpacing: "-0.003em",
          backgroundColor: "#0a0a0a",
          color: "#ededed",
        }}
      >
        {children}
      </body>
    </html>
  );
}
