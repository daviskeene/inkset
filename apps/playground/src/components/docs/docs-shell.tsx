"use client";

import React, { useEffect, useState } from "react";
import { SiteNav } from "../site-nav";
import { Footer } from "../footer";
import type { DocsEntry } from "../../lib/docs-nav";
import type { DocsPage } from "../../lib/docs-content";
import { DocsTocSidebar } from "./docs-toc-sidebar";
import { DocsOutline } from "./docs-outline";
import { DocsArticle } from "./docs-article";
import { DOCS_SHELL_STYLES } from "./docs-styles";

export const DocsShell = ({
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
  // Mobile TOC drawer state. On desktop the sidebar is always open and this
  // flag does nothing; at narrow widths the sidebar becomes a slide-in drawer
  // toggled by the hamburger in SiteNav.
  const [tocOpen, setTocOpen] = useState(false);

  // Close the drawer whenever the slug changes (page navigation).
  useEffect(() => {
    setTocOpen(false);
  }, [page.slug]);

  // Close on Escape.
  useEffect(() => {
    if (!tocOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTocOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tocOpen]);

  // Lock body scroll while the drawer is open so content behind it doesn't
  // jitter under touch.
  useEffect(() => {
    if (!tocOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [tocOpen]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--pg-bg)",
        color: "var(--pg-text-primary)",
      }}
    >
      <SiteNav activePage="docs" onOpenMobileMenu={() => setTocOpen(true)} />

      <div
        className="pg-docs-shell"
        style={{
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr) 232px",
          gap: 0,
          maxWidth: 1360,
          width: "100%",
          margin: "0 auto",
          padding: "0 28px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <aside
          className={`pg-docs-toc${tocOpen ? " is-open" : ""}`}
          aria-label="Documentation navigation"
        >
          {/* Drawer header — only visible when the TOC is in drawer mode. */}
          <div
            className="pg-docs-toc-drawer-header"
            style={{
              display: "none",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px 8px",
              borderBottom: "1px solid var(--pg-border-subtle)",
            }}
          >
            <span
              style={{
                fontSize: 12,
                letterSpacing: "-0.005em",
                color: "var(--pg-text-primary)",
                fontWeight: 600,
              }}
            >
              Contents
            </span>
            <button
              type="button"
              onClick={() => setTocOpen(false)}
              aria-label="Close navigation"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--pg-text-muted)",
                fontSize: 14,
                cursor: "pointer",
                padding: 4,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
          <DocsTocSidebar activeSlug={page.slug} />
        </aside>

        {/* Backdrop for mobile drawer. */}
        {tocOpen ? (
          <div
            className="pg-docs-toc-backdrop"
            aria-hidden="true"
            onClick={() => setTocOpen(false)}
          />
        ) : null}

        <main
          className="pg-docs-main"
          style={{
            minWidth: 0,
            padding: "44px 48px 120px",
          }}
        >
          <DocsArticle page={page} navEntry={navEntry} prev={prev} next={next} />
        </main>

        <aside
          className="pg-docs-onthis"
          aria-label="On this page"
          style={{
            position: "sticky",
            top: 68,
            alignSelf: "start",
            height: "calc(100vh - 80px)",
            padding: "48px 0 32px",
            overflowY: "auto",
            minWidth: 0,
          }}
        >
          <DocsOutline outline={page.outline} />
        </aside>
      </div>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: DOCS_SHELL_STYLES }} />
    </div>
  );
};
