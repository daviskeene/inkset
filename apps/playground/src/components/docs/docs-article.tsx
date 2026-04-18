"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Inkset, type InksetTheme } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import { createDiagramPlugin } from "@inkset/diagram";
import { useThemeKey } from "../../lib/theme-context";
import type { ThemeKey } from "../../lib/themes";
import type { DocsEntry } from "../../lib/docs-nav";
import type { DocsPage } from "../../lib/docs-content";
import { slugifyHeading } from "../../lib/docs-slug";

// Per-theme plugin bundles — shiki and mermaid need explicit themes so a
// dark code block on a light page doesn't end up as dark-on-dark.
const CODE_BY_THEME: Record<ThemeKey, ReturnType<typeof createCodePlugin>> = {
  dark: createCodePlugin({ theme: "github-dark" }),
  light: createCodePlugin({ theme: "github-light" }),
  sepia: createCodePlugin({ theme: "github-light" }),
  dusk: createCodePlugin({ theme: "github-dark" }),
};
const DIAGRAM_BY_THEME: Record<ThemeKey, ReturnType<typeof createDiagramPlugin>> = {
  dark: createDiagramPlugin({ theme: "dark" }),
  light: createDiagramPlugin({ theme: "default" }),
  sepia: createDiagramPlugin({ theme: "neutral" }),
  dusk: createDiagramPlugin({ theme: "dark" }),
};
const MATH = createMathPlugin();
const TABLE = createTablePlugin();

const INKSET_THEME: InksetTheme = {
  colors: {
    text: "var(--pg-text-primary)",
    textMuted: "var(--pg-text-muted)",
    blockquoteAccent: "var(--pg-border-default)",
    blockquoteText: "var(--pg-text-muted)",
    inlineCodeBg: "var(--pg-surface-raised)",
    inlineCodeText: "var(--pg-text-primary)",
    hr: "var(--pg-divider)",
  },
  code: {
    headerBorderColor: "var(--pg-border-subtle)",
  },
  table: {
    border: "var(--pg-border-subtle)",
    headerText: "var(--pg-text-muted)",
  },
};

// The lede is the first paragraph after the title. It reads as standfirst
// copy, so `text` is muted and `inlineCode` picks up the same visual weight
// as the body's inline code.
const LEDE_THEME: InksetTheme = {
  colors: {
    text: "var(--pg-text-muted)",
    textMuted: "var(--pg-text-muted)",
    inlineCodeBg: "var(--pg-surface-raised)",
    inlineCodeText: "var(--pg-text-primary)",
  },
};

const BODY_FONT = '"Libre Franklin", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';

export const DocsArticle = ({
  page,
  navEntry,
  prev,
  next,
}: {
  page: DocsPage;
  navEntry: DocsEntry & { groupLabel: string };
  prev: DocsEntry | null;
  next: DocsEntry | null;
}) => {
  const { themeKey } = useThemeKey();
  const plugins = useMemo(
    () => [
      CODE_BY_THEME[themeKey] ?? CODE_BY_THEME.light,
      MATH,
      TABLE,
      DIAGRAM_BY_THEME[themeKey] ?? DIAGRAM_BY_THEME.light,
    ],
    [themeKey],
  );

  // Inkset wants a width in px. We observe the column's width so the layout
  // reflows in lockstep with the viewport.
  const articleRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);

  useLayoutEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setWidth(Math.min(720, Math.floor(rect.width)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // After Inkset renders, each heading block sits inside a
  // [data-block-type="heading"] wrapper. We slugify the heading text and
  // stamp an id on the inner h2/h3 so the outline rail's anchor links land
  // on the right section, and so deep-links (/docs/quick-start#install) work.
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;

    const assignIds = () => {
      const blocks = el.querySelectorAll<HTMLElement>('[data-block-type="heading"]');
      let stamped = 0;
      for (const block of Array.from(blocks)) {
        const heading = block.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
        if (!heading) continue;
        const text = (heading.textContent ?? "").trim();
        if (!text) continue;
        const id = slugifyHeading(text);
        if (!id) continue;
        if (heading.id !== id) heading.id = id;
        stamped += 1;
      }
      return stamped;
    };

    // First pass immediately after render; then retry a couple of times to
    // catch the reveal-measurement race where text hasn't settled yet.
    let attempts = 0;
    assignIds();
    const timer = window.setInterval(() => {
      attempts += 1;
      const n = assignIds();
      if (n >= page.outline.length || attempts > 8) window.clearInterval(timer);
    }, 120);

    // If the user navigated in with a hash, scroll once ids are in place.
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      const ready = window.setInterval(() => {
        const target = document.getElementById(hash);
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 48;
          window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
          window.clearInterval(ready);
        }
      }, 80);
      window.setTimeout(() => window.clearInterval(ready), 2000);
    }

    return () => window.clearInterval(timer);
  }, [page.slug, page.outline.length]);

  return (
    <article ref={articleRef} style={{ maxWidth: 720, width: "100%", minWidth: 0 }}>
      {/* Breadcrumbs — rendered outside Inkset so they stay in SSR HTML. */}
      <nav
        aria-label="Breadcrumb"
        style={{
          fontSize: 12,
          color: "var(--pg-text-faint)",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/docs"
          className="pg-docs-breadcrumb-link"
          style={{ color: "var(--pg-text-muted)", textDecoration: "none" }}
        >
          Docs
        </Link>
        <span aria-hidden style={{ color: "var(--pg-text-faint)" }}>
          /
        </span>
        <span style={{ color: "var(--pg-text-muted)" }}>{navEntry.groupLabel}</span>
        <span aria-hidden style={{ color: "var(--pg-text-faint)" }}>
          /
        </span>
        <span style={{ color: "var(--pg-text-primary)" }}>{page.title}</span>
      </nav>

      {/* Page title — native h1 so SEO + a11y work even before Inkset
          hydrates. Heading styles use our reading font to match the rest
          of the site. */}
      <h1
        style={{
          fontFamily: "var(--font-reading), Georgia, serif",
          fontWeight: 600,
          fontSize: "clamp(30px, 3.6vw, 42px)",
          lineHeight: 1.1,
          letterSpacing: "-0.022em",
          margin: "0 0 14px",
          color: "var(--pg-text-primary)",
          textWrap: "pretty",
        }}
      >
        {page.title}
      </h1>

      {page.lede ? (
        // The lede still flows through Inkset — that's the one way inline
        // markdown (links, `code`, emphasis) will render correctly. We give
        // this block a larger font and a muted color to match the design's
        // "lede" treatment without stepping outside the renderer.
        <div
          className="pg-docs-lede"
          style={{
            maxWidth: 640,
            margin: "0 0 32px",
            color: "var(--pg-text-muted)",
          }}
        >
          <Inkset
            key={`${page.slug}-lede`}
            content={page.lede}
            plugins={plugins}
            theme={LEDE_THEME}
            width={Math.min(width, 640)}
            font={BODY_FONT}
            fontSize={17}
            lineHeight={27}
            blockMargin={0}
          />
        </div>
      ) : (
        <div style={{ height: 16 }} />
      )}

      <div className="pg-docs-body" style={{ minWidth: 0, color: "var(--pg-text-primary)" }}>
        <Inkset
          key={page.slug}
          content={page.body}
          plugins={plugins}
          theme={INKSET_THEME}
          width={width}
          font={BODY_FONT}
          fontSize={15}
          lineHeight={25}
          blockMargin={12}
          headingSizes={[2, 1.6, 1.15, 1]}
          headingWeights={[600, 600, 600, 600]}
          headingLineHeights={[1.15, 1.2, 1.25, 1.35]}
        />
      </div>

      {prev || next ? (
        <nav
          aria-label="Page navigation"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 64,
            paddingTop: 24,
            borderTop: "1px solid var(--pg-border-subtle)",
            maxWidth: 640,
          }}
        >
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="pg-docs-pagefoot-link"
              style={{
                display: "block",
                padding: "14px 16px",
                border: "1px solid var(--pg-border-subtle)",
                borderRadius: 6,
                textDecoration: "none",
                color: "var(--pg-text-primary)",
                background: "transparent",
                transition: "background 120ms ease, border-color 120ms ease",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--pg-text-faint)",
                  marginBottom: 3,
                  letterSpacing: "0.02em",
                }}
              >
                ← Previous
              </div>
              <div
                style={{
                  fontFamily: "var(--font-reading), Georgia, serif",
                  fontSize: 17,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                {prev.title}
              </div>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="pg-docs-pagefoot-link"
              style={{
                display: "block",
                padding: "14px 16px",
                border: "1px solid var(--pg-border-subtle)",
                borderRadius: 6,
                textDecoration: "none",
                color: "var(--pg-text-primary)",
                background: "transparent",
                textAlign: "right",
                transition: "background 120ms ease, border-color 120ms ease",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--pg-text-faint)",
                  marginBottom: 3,
                  letterSpacing: "0.02em",
                }}
              >
                Next →
              </div>
              <div
                style={{
                  fontFamily: "var(--font-reading), Georgia, serif",
                  fontSize: 17,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                {next.title}
              </div>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      ) : null}

      <div
        style={{
          marginTop: 32,
          fontSize: 11,
          color: "var(--pg-text-faint)",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <a
          href={`https://github.com/daviskeene/inkset/edit/main/apps/playground/src/content/docs/${page.slug}.md`}
          target="_blank"
          rel="noreferrer"
          className="pg-docs-edit-link"
          style={{ color: "var(--pg-text-muted)", textDecoration: "none" }}
        >
          Edit this page on GitHub
        </a>
        <span aria-hidden style={{ color: "var(--pg-text-faint)" }}>
          ·
        </span>
        <span>
          Rendered by{" "}
          <code
            style={{
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: 11,
              color: "var(--pg-text-muted)",
            }}
          >
            @inkset/react
          </code>
        </span>
      </div>
    </article>
  );
};
