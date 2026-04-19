"use client";

import React, { useEffect, useState } from "react";
import type { OutlineItem } from "../../lib/docs-content";

// Right-rail "on this page" outline. Tracks which heading is currently in
// view by observing the id-tagged heading elements placed by DocsArticle.
export const DocsOutline = ({ outline }: { outline: OutlineItem[] }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (outline.length === 0) return;

    // Heading elements are tagged with `id` by DocsArticle after Inkset
    // renders. They may not exist on the first tick, so we poll briefly
    // until at least one is present, then observe.
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    const attach = () => {
      const ids = outline.map((item) => item.id);
      const elements = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);

      if (elements.length === 0) return false;

      // Keep a running list of what's currently intersecting; pick the one
      // closest to the top of the viewport as "active". Fallback to the
      // first heading if nothing is intersecting yet (scrolled above all).
      const visible = new Set<string>();

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = entry.target.id;
            if (entry.isIntersecting) {
              visible.add(id);
            } else {
              visible.delete(id);
            }
          }
          if (visible.size === 0) {
            // Find the last heading that's above the viewport — that's the
            // section the user is currently reading.
            let candidate: string | null = null;
            for (const el of elements) {
              if (el.getBoundingClientRect().top < 0) {
                candidate = el.id;
              } else {
                break;
              }
            }
            setActiveId(candidate ?? elements[0].id);
          } else {
            // Pick the one that appears earliest in outline order.
            const first = ids.find((id) => visible.has(id));
            setActiveId(first ?? null);
          }
        },
        { rootMargin: "-64px 0px -65% 0px", threshold: 0 },
      );

      for (const el of elements) observer.observe(el);
      return true;
    };

    if (!attach()) {
      // Inkset may still be laying out; retry a couple of times before giving
      // up. The second ReadObserver-driven re-measure on width changes can
      // move headings around but not add or remove them.
      let attempts = 0;
      const id = window.setInterval(() => {
        if (cancelled) return;
        attempts += 1;
        if (attach() || attempts > 10) window.clearInterval(id);
      }, 150);
      return () => {
        cancelled = true;
        window.clearInterval(id);
        observer?.disconnect();
      };
    }

    return () => {
      observer?.disconnect();
    };
  }, [outline]);

  if (outline.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--pg-text-faint)",
        }}
      >
        (no sections)
      </div>
    );
  }

  const onJump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - 48;
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top, behavior: "smooth" });
    setActiveId(id);
  };

  return (
    <>
      <div
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: "-0.005em",
          color: "var(--pg-text-primary)",
          marginBottom: 10,
        }}
      >
        On this page
      </div>
      <nav>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {outline.map((item) => {
            const isActive = item.id === activeId;
            const isSub = item.level === 3;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => onJump(e, item.id)}
                  className="pg-docs-outline-link"
                  data-active={isActive || undefined}
                  style={{
                    display: "block",
                    padding: isSub ? "3px 0 3px 22px" : "4px 0 4px 12px",
                    fontSize: isSub ? 12 : 12.5,
                    lineHeight: 1.5,
                    color: isActive ? "var(--pg-text-primary)" : "var(--pg-text-muted)",
                    textDecoration: "none",
                    borderLeft: `1px solid ${
                      isActive ? "var(--pg-text-primary)" : "var(--pg-border-subtle)"
                    }`,
                    transition: "color 120ms ease, border-color 120ms ease",
                  }}
                >
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className="pg-docs-rendered-by"
        style={{
          marginTop: 28,
          paddingTop: 14,
          borderTop: "1px solid var(--pg-border-subtle)",
          fontSize: 11,
          lineHeight: 1.55,
          color: "var(--pg-text-faint)",
        }}
      >
        The Inkset docs are rendered by Inkset. Every paragraph, code block, table, and math
        expression on this page flows through{" "}
        <b style={{ color: "var(--pg-text-muted)" }}>@inkset/react</b>.
      </div>
    </>
  );
};
