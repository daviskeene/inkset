"use client";

import React, { useEffect, useState } from "react";
import type { OutlineItem } from "../../lib/docs-content";

// Right-rail "on this page" outline. Highlights the section being read: the
// last heading that has scrolled up under the sticky site nav.
export const DocsOutline = ({ outline }: { outline: OutlineItem[] }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (outline.length === 0) return;

    // Recomputed from positions on every scroll frame. Intersection callbacks
    // only fire when a heading crosses a band, so a fast scroll could skip a
    // section entirely and leave the previous one highlighted.
    let frame = 0;
    const update = () => {
      frame = 0;
      let active: string | null = null;
      for (const item of outline) {
        // DocsArticle tags heading ids after Inkset renders, so look them up
        // each time instead of caching elements that may not exist yet.
        const el = document.getElementById(item.id);
        if (!el) continue;
        // 64px nav plus a little reading margin; jump links land at 48px.
        if (el.getBoundingClientRect().top > 96) break;
        active = item.id;
      }
      setActiveId(active ?? outline[0].id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
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
