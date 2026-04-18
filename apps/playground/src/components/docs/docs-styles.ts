// Responsive + hover styles for the /docs shell. Injected once into the
// document head by DocsShell. Everything here is purely CSS — the component
// tree only provides class hooks and data attributes.
export const DOCS_SHELL_STYLES = `
/* ────────────────────────────────────────────────────────────────
   TOC + outline hover and active styles
   ──────────────────────────────────────────────────────────────── */
.pg-docs-toc-link:hover {
  color: var(--pg-text-primary) !important;
  background: var(--pg-surface-raised);
}
.pg-docs-toc-link[data-active] {
  background: transparent !important;
}

.pg-docs-outline-link:hover {
  color: var(--pg-text-primary) !important;
}

.pg-docs-pagefoot-link:hover {
  background: var(--pg-surface-raised) !important;
  border-color: var(--pg-border-default) !important;
}

.pg-docs-breadcrumb-link:hover,
.pg-docs-edit-link:hover {
  color: var(--pg-text-primary) !important;
}

/* Anchor offset so heading #ids don't land under a sticky top bar. */
.pg-docs-body h1,
.pg-docs-body h2,
.pg-docs-body h3,
.pg-docs-body h4 {
  scroll-margin-top: 72px;
}

/* Links inside Inkset-rendered docs content take the body text color with
   a subtle underline — the default browser blue feels wrong against the
   editorial typography. */
.pg-docs-body a,
.pg-docs-lede a {
  color: var(--pg-text-primary);
  text-decoration: underline;
  text-decoration-color: var(--pg-border-default);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition: text-decoration-color 140ms ease;
}
.pg-docs-body a:hover,
.pg-docs-lede a:hover {
  text-decoration-color: var(--pg-text-primary);
}

/* ────────────────────────────────────────────────────────────────
   Large — 3-column fixed. Nothing to override.
   ──────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────
   Medium — hide the right-rail outline; main column widens.
   ──────────────────────────────────────────────────────────────── */
@media (max-width: 1180px) {
  .pg-docs-shell {
    grid-template-columns: 240px minmax(0, 1fr) !important;
    padding: 0 24px !important;
  }
  .pg-docs-onthis {
    display: none !important;
  }
}

/* ────────────────────────────────────────────────────────────────
   Narrow — collapse the left TOC into a drawer triggered from the
   SiteNav hamburger.
   ──────────────────────────────────────────────────────────────── */
@media (max-width: 820px) {
  .pg-docs-shell {
    grid-template-columns: minmax(0, 1fr) !important;
    padding: 0 16px !important;
    overflow-x: hidden;
  }
  .pg-docs-main {
    padding: 28px 0 96px !important;
    min-width: 0;
  }
  /* The 2px left-bar active indicator reads as a dangling bracket inside
     the drawer — swap it for a filled highlight that matches the hover
     state's hit region. */
  .pg-docs-toc-link[data-active] {
    box-shadow: none !important;
    background: var(--pg-surface-raised) !important;
  }
  .pg-docs-toc {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 84vw;
    max-width: 320px;
    background: var(--pg-surface);
    border-right: 1px solid var(--pg-border-subtle);
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 200ms ease;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .pg-docs-toc.is-open {
    transform: translateX(0);
  }
  .pg-docs-toc-drawer-header {
    display: flex !important;
  }
  .pg-docs-toc-nav {
    position: static !important;
    max-height: none !important;
    flex: 1;
    min-height: 0;
    padding: 16px 20px 24px !important;
  }
  .pg-docs-toc-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.38);
    z-index: 35;
    animation: pg-docs-backdrop-in 180ms ease both;
  }
  @keyframes pg-docs-backdrop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
}

/* ────────────────────────────────────────────────────────────────
   Very narrow — tighten further.
   ──────────────────────────────────────────────────────────────── */
@media (max-width: 560px) {
  .pg-docs-shell {
    padding: 0 14px !important;
  }
  .pg-docs-main {
    padding: 22px 0 88px !important;
  }
  .pg-docs-body {
    font-size: 14px;
  }
  .pg-docs-body pre,
  .pg-docs-body [data-block-type="code"] {
    max-width: 100% !important;
  }
}

/* Prev/next stack vertically on narrow viewports so each target hits its
   full 44px tap height. */
@media (max-width: 640px) {
  .pg-docs-main nav[aria-label="Page navigation"] {
    grid-template-columns: 1fr !important;
  }
  .pg-docs-main nav[aria-label="Page navigation"] a {
    text-align: left !important;
  }
}
`;
