"use client";

import React from "react";
import Link from "next/link";

// Plain links on every page, so crawlers can reach the main pages without
// running the client-side nav.
const SITE_LINKS = [
  { href: "/docs/introduction", label: "Introduction" },
  { href: "/docs/quick-start", label: "Quick start" },
  { href: "/docs/migration", label: "Migration" },
  { href: "/generative-ui", label: "Generative UI" },
  { href: "/compare", label: "Compare" },
];

export const Footer = () => {
  return (
    <footer
      className="pg-footer"
      style={{
        borderTop: "1px solid var(--pg-border-subtle)",
        padding: "10px 22px",
        fontSize: 12,
        color: "var(--pg-text-muted)",
        background: "var(--pg-bg)",
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: "6px 24px",
      }}
    >
      <nav aria-label="Site" className="pg-footer-nav">
        {SITE_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="pg-footer-nav-link">
            {link.label}
          </Link>
        ))}
        {/* A text file, so a plain anchor: client navigation can't render it. */}
        <a href="/llms.txt" className="pg-footer-nav-link">
          llms.txt
        </a>
      </nav>
      <span>
        Made for humans and agents by{" "}
        <a
          href="https://daviskeene.com"
          target="_blank"
          rel="noreferrer"
          className="pg-footer-link"
          style={{
            color: "var(--pg-text-primary)",
            textDecoration: "none",
            borderBottom: "1px solid var(--pg-divider)",
            paddingBottom: 1,
            transition: "border-color 120ms ease, color 120ms ease",
          }}
        >
          Davis Keene
        </a>
      </span>
    </footer>
  );
};

export const FOOTER_STYLES = `
.pg-footer-link:hover {
  color: var(--pg-accent) !important;
  border-bottom-color: var(--pg-accent) !important;
}
.pg-footer-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.pg-footer-nav-link {
  color: var(--pg-text-muted);
  text-decoration: none;
}
.pg-footer-nav-link:hover {
  color: var(--pg-text-primary);
}
@media (max-width: 540px) {
  .pg-footer {
    padding: 8px 14px !important;
  }
}
`;
