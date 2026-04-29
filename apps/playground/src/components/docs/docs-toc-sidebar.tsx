"use client";

import React from "react";
import Link from "next/link";
import { DOCS_NAV } from "../../lib/docs-nav";

export const DocsTocSidebar = ({ activeSlug }: { activeSlug: string }) => {
  return (
    <nav
      className="pg-docs-toc-nav"
      style={{
        padding: "44px 20px 32px 0",
      }}
    >
      {DOCS_NAV.map((group) => (
        <div key={group.label} style={{ marginBottom: 22 }}>
          <div
            style={{
              fontFamily: "var(--font-sans), system-ui, sans-serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: "-0.005em",
              color: "var(--pg-text-primary)",
              padding: "0 0 8px",
            }}
          >
            {group.label}
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {group.entries.map((entry) => {
              const isActive = entry.slug === activeSlug;
              return (
                <li key={entry.slug}>
                  <Link
                    href={`/docs/${entry.slug}`}
                    aria-current={isActive ? "page" : undefined}
                    className="pg-docs-toc-link"
                    data-active={isActive || undefined}
                    style={{
                      display: "block",
                      padding: "10px 18px 10px 22px",
                      marginLeft: -22,
                      marginRight: 10,
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: isActive ? "var(--pg-text-primary)" : "var(--pg-text-muted)",
                      textDecoration: "none",
                      borderRadius: 10,
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    {entry.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};
