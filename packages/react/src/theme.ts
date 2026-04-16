// Typed theme API that compiles to the --inkset-* CSS custom properties
// declared in INKSET_STYLES. This is a thin ergonomics layer — every field
// below could also be set directly via style={{ "--inkset-...": ... }}. The
// benefit of the typed object is autocomplete, grouping, and a single
// documented surface consumers can reason about.
//
// Values flow: base defaults (in INKSET_STYLES :where block)
//   → font/fontSize/lineHeight props (if provided)
//   → theme prop
//   → style prop (final escape hatch)
// Each layer wins over the previous.

/** 4-tuple for heading metrics (h1..h4; h5 and h6 inherit h4). */
export type HeadingTuple<T = string> = {
  h1?: T;
  h2?: T;
  h3?: T;
  h4?: T;
};

export type InksetTheme = {
  colors?: {
    text?: string;
    textMuted?: string;
    hr?: string;
    blockquoteAccent?: string;
    blockquoteText?: string;
    inlineCodeBg?: string;
    inlineCodeText?: string;
  };
  typography?: {
    fontFamily?: string;
    fontFamilyMono?: string;
    /** Number is treated as `${n}px`. Strings pass through (use `rem`, `em`, etc.). */
    fontSize?: string | number;
    /** Unitless ratio (preferred) or any CSS line-height value. */
    lineHeight?: string | number;
    inlineCodeSize?: string;
    headingSizes?: HeadingTuple;
    headingWeights?: HeadingTuple<number>;
    headingLineHeights?: HeadingTuple<string | number>;
    headingTracking?: HeadingTuple;
  };
  spacing?: {
    listIndent?: string;
    blockquotePaddingLeft?: string;
    blockquoteBorderWidth?: string;
    inlineCodePadding?: string;
    inlineCodeRadius?: string;
  };
  code?: {
    background?: string;
    blockPadding?: string;
    blockRadius?: string;
    blockFontSize?: string;
    blockLineHeight?: string | number;
    headerPadding?: string;
    headerFontSize?: string;
    headerOpacity?: number;
    copyPadding?: string;
    copyOpacity?: number;
  };
  table?: {
    border?: string;
    headerText?: string;
    headerFontSize?: string;
    headerWeight?: number;
    headerTracking?: string;
    headerPadding?: string;
    cellPadding?: string;
  };
  math?: {
    errorColor?: string;
    errorFontSize?: string;
    displayPadding?: string;
    displayLineHeight?: string | number;
    rawFontSize?: string;
    rawOpacity?: number;
  };
};

/** Type-safe record of `--inkset-*` CSS variables the root can accept. */
export type InksetCssVars = Record<`--inkset-${string}`, string | number>;

/**
 * Flattens a theme object into a `style`-compatible map of CSS custom
 * properties. Undefined fields are skipped so consumer overrides at higher
 * layers (e.g. the `style` prop) remain in effect.
 */
export const themeToCssVars = (theme: InksetTheme | undefined): InksetCssVars => {
  if (!theme) return {};
  const vars: InksetCssVars = {};

  const set = (name: `--inkset-${string}`, value: string | number | undefined): void => {
    if (value !== undefined) vars[name] = value;
  };

  // ── Colors ──────────────────────────────────────────────────
  const c = theme.colors;
  if (c) {
    set("--inkset-color-text", c.text);
    set("--inkset-color-text-muted", c.textMuted);
    set("--inkset-color-hr", c.hr);
    set("--inkset-blockquote-accent", c.blockquoteAccent);
    set("--inkset-blockquote-text", c.blockquoteText);
    set("--inkset-inline-code-bg", c.inlineCodeBg);
    set("--inkset-inline-code-text", c.inlineCodeText);
  }

  // ── Typography ──────────────────────────────────────────────
  const t = theme.typography;
  if (t) {
    set("--inkset-font-family", t.fontFamily);
    set("--inkset-font-family-mono", t.fontFamilyMono);
    if (t.fontSize !== undefined) {
      vars["--inkset-base-font-size"] =
        typeof t.fontSize === "number" ? `${t.fontSize}px` : t.fontSize;
    }
    set("--inkset-base-line-height-ratio", t.lineHeight);
    set("--inkset-inline-code-size", t.inlineCodeSize);

    const heads: Array<keyof HeadingTuple> = ["h1", "h2", "h3", "h4"];
    heads.forEach((h, i) => {
      const n = i + 1;
      set(`--inkset-heading-${n}-size`, t.headingSizes?.[h]);
      set(`--inkset-heading-${n}-weight`, t.headingWeights?.[h]);
      set(`--inkset-heading-${n}-line-height`, t.headingLineHeights?.[h]);
      set(`--inkset-heading-${n}-tracking`, t.headingTracking?.[h]);
    });
  }

  // ── Spacing ─────────────────────────────────────────────────
  const s = theme.spacing;
  if (s) {
    set("--inkset-list-indent", s.listIndent);
    set("--inkset-blockquote-padding-left", s.blockquotePaddingLeft);
    set("--inkset-blockquote-border-width", s.blockquoteBorderWidth);
    set("--inkset-inline-code-padding", s.inlineCodePadding);
    set("--inkset-inline-code-radius", s.inlineCodeRadius);
  }

  // ── Code ────────────────────────────────────────────────────
  const code = theme.code;
  if (code) {
    set("--inkset-code-block-bg", code.background);
    set("--inkset-code-block-padding", code.blockPadding);
    set("--inkset-code-block-radius", code.blockRadius);
    set("--inkset-code-block-font-size", code.blockFontSize);
    set("--inkset-code-block-line-height", code.blockLineHeight);
    set("--inkset-code-header-padding", code.headerPadding);
    set("--inkset-code-header-font-size", code.headerFontSize);
    set("--inkset-code-header-opacity", code.headerOpacity);
    set("--inkset-code-copy-padding", code.copyPadding);
    set("--inkset-code-copy-opacity", code.copyOpacity);
  }

  // ── Table ───────────────────────────────────────────────────
  const table = theme.table;
  if (table) {
    set("--inkset-table-border", table.border);
    set("--inkset-table-header-text", table.headerText);
    set("--inkset-table-header-font-size", table.headerFontSize);
    set("--inkset-table-header-weight", table.headerWeight);
    set("--inkset-table-header-tracking", table.headerTracking);
    set("--inkset-table-header-padding", table.headerPadding);
    set("--inkset-table-cell-padding", table.cellPadding);
  }

  // ── Math ────────────────────────────────────────────────────
  const math = theme.math;
  if (math) {
    set("--inkset-math-error", math.errorColor);
    set("--inkset-math-error-font-size", math.errorFontSize);
    set("--inkset-math-display-padding", math.displayPadding);
    set("--inkset-math-display-line-height", math.displayLineHeight);
    set("--inkset-math-raw-font-size", math.rawFontSize);
    set("--inkset-math-raw-opacity", math.rawOpacity);
  }

  return vars;
};
