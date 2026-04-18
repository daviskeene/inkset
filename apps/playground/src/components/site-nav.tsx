"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useThemeKey } from "../lib/theme-context";
import { THEME_LABELS, THEME_ORDER, type ThemeKey } from "../lib/themes";

type Page = "playground" | "compare" | "docs";

export const SiteNav = ({
  activePage,
  onOpenMobileMenu,
}: {
  activePage: Page;
  onOpenMobileMenu?: () => void;
}) => {
  const { themeKey, setThemeKey, cycleTheme } = useThemeKey();
  const [themeOpen, setThemeOpen] = useState(false);
  const themeWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!themeOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!themeWrapRef.current) return;
      if (!themeWrapRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThemeOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [themeOpen]);

  const onGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      // Don't hijack typing in inputs / textareas / contentEditable.
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) {
        return;
      }
      if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        cycleTheme();
      }
    },
    [cycleTheme],
  );

  useEffect(() => {
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [onGlobalKey]);

  return (
    <header
      className="pg-site-nav"
      style={{
        // Sticky so the top bar stays pinned on pages that let the outer
        // viewport scroll (docs). On playground/compare the outer column
        // doesn't scroll, so sticky is a no-op there.
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "14px 22px 12px",
        borderBottom: "1px solid var(--pg-border-subtle)",
        background: "var(--pg-bg)",
        flexShrink: 0,
      }}
    >
      {/* Masthead */}
      <div
        className="pg-site-nav-brand"
        style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}
      >
        <Link
          href="/"
          style={{
            textDecoration: "none",
            color: "var(--pg-text-primary)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <InksetMark />
          <span
            style={{
              fontFamily: "var(--font-reading), Georgia, serif",
              fontWeight: 600,
              fontSize: 22,
              letterSpacing: "-0.022em",
              lineHeight: 1,
            }}
          >
            inkset
          </span>
        </Link>
        <span
          aria-hidden
          className="pg-site-nav-brand-divider"
          style={{
            display: "inline-block",
            width: 1,
            height: 16,
            background: "var(--pg-divider)",
          }}
        />
        <span
          className="pg-site-nav-sub"
          style={{
            fontSize: 12,
            color: "var(--pg-text-muted)",
            lineHeight: 1.3,
            letterSpacing: 0,
          }}
        >
          a rendering library for AI chat UIs in React
        </span>
      </div>

      {/* Tabs + right rail */}
      <div
        className="pg-site-nav-right"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexShrink: 0,
        }}
      >
        <nav aria-label="Primary" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <TabLink href="/" active={activePage === "playground"}>
            Playground
          </TabLink>
          <TabLink href="/compare" active={activePage === "compare"}>
            Compare
          </TabLink>
          <TabLink href="/docs" active={activePage === "docs"}>
            Docs
          </TabLink>
        </nav>

        <div
          aria-hidden
          className="pg-site-nav-divider"
          style={{ width: 1, height: 16, background: "var(--pg-divider)" }}
        />

        <div ref={themeWrapRef} style={{ position: "relative" }} className="pg-site-nav-theme-wrap">
          <button
            type="button"
            onClick={() => setThemeOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={themeOpen}
            style={{
              background: "transparent",
              border: "1px solid var(--pg-border-default)",
              color: "var(--pg-text-muted)",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12.5,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "border-color 120ms ease, color 120ms ease",
              fontFamily: "inherit",
            }}
          >
            <span
              className="pg-site-nav-theme-label"
              style={{
                fontSize: 12.5,
                color: "var(--pg-text-muted)",
                letterSpacing: 0,
              }}
            >
              theme
            </span>
            <span style={{ color: "var(--pg-text-primary)" }}>{THEME_LABELS[themeKey]}</span>
            <Chevron open={themeOpen} />
          </button>
          {themeOpen ? (
            <ThemePopover
              themeKey={themeKey}
              onChoose={(k) => {
                setThemeKey(k);
                setThemeOpen(false);
              }}
            />
          ) : null}
        </div>

        <a
          href="https://github.com/daviskeene/inkset"
          target="_blank"
          rel="noreferrer"
          aria-label="Inkset on GitHub"
          className="pg-site-nav-gh"
          style={{
            color: "var(--pg-text-muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 999,
            transition: "color 120ms ease, background-color 120ms ease",
          }}
        >
          <GithubMark />
        </a>

        {onOpenMobileMenu ? (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open options menu"
            className="pg-site-nav-mobile-options"
            style={{
              display: "none",
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid var(--pg-border-default)",
              background: "transparent",
              color: "var(--pg-text-primary)",
              cursor: "pointer",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            <HamburgerMark />
          </button>
        ) : null}
      </div>
    </header>
  );
};

const HamburgerMark = () => {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
};

const TabLink = ({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) => {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        position: "relative",
        fontSize: 13.5,
        padding: "4px 10px 6px",
        color: active ? "var(--pg-text-primary)" : "var(--pg-text-muted)",
        textDecoration: "none",
        letterSpacing: "-0.005em",
        transition: "color 120ms ease",
      }}
    >
      {children}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 0,
          height: 1.5,
          background: active ? "var(--pg-text-primary)" : "transparent",
          transition: "background-color 160ms ease",
        }}
      />
    </Link>
  );
};

const Chevron = ({ open }: { open: boolean }) => {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 140ms ease",
        opacity: 0.7,
      }}
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
};

const ThemePopover = ({
  themeKey,
  onChoose,
}: {
  themeKey: ThemeKey;
  onChoose: (k: ThemeKey) => void;
}) => {
  return (
    <div
      role="listbox"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        background: "var(--pg-surface)",
        border: "1px solid var(--pg-border-default)",
        borderRadius: 10,
        padding: 4,
        minWidth: 200,
        boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
        zIndex: 40,
      }}
    >
      {THEME_ORDER.map((k) => {
        const isActive = k === themeKey;
        return (
          <button
            key={k}
            role="option"
            aria-selected={isActive}
            onClick={() => onChoose(k)}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: 10,
              padding: "7px 9px",
              background: isActive ? "var(--pg-surface-raised)" : "transparent",
              border: "none",
              borderRadius: 7,
              color: "var(--pg-text-primary)",
              cursor: "pointer",
              fontSize: 13,
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <Swatch themeKey={k} />
            <span style={{ flex: 1 }}>{THEME_LABELS[k]}</span>
            {isActive ? <span style={{ color: "var(--pg-accent)", fontSize: 12 }}>•</span> : null}
          </button>
        );
      })}
      <div
        style={{
          borderTop: "1px solid var(--pg-border-subtle)",
          marginTop: 4,
          padding: "6px 9px 4px",
          fontSize: 11,
          color: "var(--pg-text-faint)",
          letterSpacing: "0.02em",
        }}
      >
        press <Kbd>t</Kbd> to cycle
      </div>
    </div>
  );
};

const SWATCH_BY_KEY: Record<ThemeKey, { bg: string; fg: string; accent: string; divider: string }> =
  {
    dark: {
      bg: "#0a0a0a",
      fg: "#ededed",
      accent: "#8da3c9",
      divider: "rgba(255,255,255,0.08)",
    },
    light: {
      bg: "#fafaf9",
      fg: "#1a1a1a",
      accent: "#2b3a6b",
      divider: "rgba(0,0,0,0.08)",
    },
    sepia: {
      bg: "#f3ecdc",
      fg: "#3a2e20",
      accent: "#8b4d2b",
      divider: "rgba(58,46,32,0.10)",
    },
    dusk: {
      bg: "#0e1019",
      fg: "#e6dfc8",
      accent: "#d4a55a",
      divider: "rgba(230,223,200,0.10)",
    },
  };

const Swatch = ({ themeKey }: { themeKey: ThemeKey }) => {
  const s = SWATCH_BY_KEY[themeKey];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        width: 28,
        height: 18,
        borderRadius: 4,
        border: "1px solid var(--pg-border-default)",
        background: s.bg,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          width: "60%",
          borderRight: `1px solid ${s.divider}`,
          display: "flex",
          alignItems: "center",
          paddingLeft: 4,
        }}
      >
        <span
          style={{
            display: "block",
            width: 9,
            height: 1.5,
            background: s.fg,
            opacity: 0.9,
          }}
        />
      </span>
      <span
        style={{
          flex: 1,
          background: s.accent,
          opacity: 0.75,
        }}
      />
    </span>
  );
};

const Kbd = ({ children }: { children: React.ReactNode }) => {
  return (
    <span
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        padding: "1px 5px",
        border: "1px solid var(--pg-border-default)",
        borderRadius: 4,
        color: "var(--pg-text-muted)",
      }}
    >
      {children}
    </span>
  );
};

const GithubMark = () => {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
           0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01
           1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
           0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
           1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0
           3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01
           8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
};

const InksetMark = () => {
  return (
    <svg
      viewBox="0 0 100 100"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden
      style={{
        display: "block",
        flexShrink: 0,
      }}
    >
      <path
        d="M 10 18 L 30 18 Q 50 28 70 18 L 90 18 L 50 94 Z M 55 44 a 5 5 0 1 0 -10 0 a 5 5 0 1 0 10 0 Z"
        fillRule="evenodd"
      />
    </svg>
  );
};

export const SITE_NAV_STYLES = `
@media (max-width: 720px) {
  .pg-site-nav {
    padding: 10px 14px !important;
    gap: 10px !important;
  }
  .pg-site-nav-right {
    gap: 10px !important;
  }
  .pg-site-nav-sub,
  .pg-site-nav-brand-divider,
  .pg-site-nav-divider,
  .pg-site-nav-theme-wrap,
  .pg-site-nav-gh {
    display: none !important;
  }
  .pg-site-nav-mobile-options {
    display: inline-flex !important;
  }
}
@media (max-width: 540px) {
  .pg-site-nav {
    gap: 8px !important;
  }
  .pg-site-nav-right {
    gap: 6px !important;
  }
}
.pg-site-nav-gh:hover {
  color: var(--pg-text-primary) !important;
  background: var(--pg-surface-raised) !important;
}
.pg-site-nav-mobile-options:hover {
  border-color: var(--pg-border-strong) !important;
  background: var(--pg-surface-raised) !important;
}
`;
