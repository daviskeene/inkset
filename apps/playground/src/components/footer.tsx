"use client";

import React from "react";

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
        textAlign: "right",
      }}
    >
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
@media (max-width: 540px) {
  .pg-footer {
    padding: 8px 14px !important;
  }
}
`;
