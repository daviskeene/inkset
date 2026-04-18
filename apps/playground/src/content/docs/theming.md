# Theming

Inkset ships unstyled. Colors and fonts come from CSS custom properties on the `<Inkset>` root — set them inline, in your stylesheet, or wire them to your app's theme tokens.

## The `theme` prop

The easiest path is the `theme` prop. Pass an object that maps semantic color tokens to CSS values (or `var()` references).

```tsx
const theme = {
  colors: {
    text: "var(--page-text)",
    textMuted: "var(--page-text-muted)",
    blockquoteAccent: "var(--page-border)",
    blockquoteText: "var(--page-text-muted)",
    inlineCodeBg: "var(--page-surface-raised)",
    inlineCodeText: "var(--page-text)",
    hr: "var(--page-divider)",
  },
  code: {
    headerBorderColor: "var(--page-border-subtle)",
  },
  table: {
    border: "var(--page-border-subtle)",
    headerText: "var(--page-text-muted)",
  },
};

<Inkset content={markdown} theme={theme} plugins={plugins} />;
```

## CSS custom properties

Every token maps to a CSS variable on the Inkset root. You can set them directly instead of passing `theme`:

```css
.inkset-root {
  --inkset-text: #1a1a1a;
  --inkset-text-muted: #6a6a6a;
  --inkset-heading-1-size: 2em;
  --inkset-heading-1-weight: 700;
  --inkset-code-bg: #f4f4f4;
}
```

## Heading tuples

Heading sizes, weights, and line-heights can be tuples that cover h1 through h4. The component exposes them as `headingSizes`, `headingWeights`, and `headingLineHeights` for ergonomic overrides; under the hood they set `--inkset-heading-N-*` vars.

```tsx
<Inkset
  headingSizes={[2, 1.5, 1.2, 1]}
  headingWeights={[700, 600, 600, 600]}
  headingLineHeights={[1.1, 1.15, 1.2, 1.3]}
/>
```

## Spacing

Inter-block rhythm is controlled by `blockSpacing`, not DOM margins. This is intentional: Inkset lays out frozen blocks with arithmetic before it writes them to the DOM, so spacing has to live in the layout config rather than sibling selectors like `p + p` or `h2 + p`.

```tsx
<Inkset
  blockSpacing={{
    default: 8,
    blocks: {
      heading2: { top: 18, bottom: 6 },
      paragraph: { bottom: 4 },
    },
    pairs: [{ from: "paragraph", to: "heading2", gap: 20 }],
  }}
/>
```

Use `theme` and CSS vars for colors and typography. Use `blockSpacing` when you want the document's rhythm to change.

## Dark / light / anything

Inkset doesn't pick a color scheme for you. The CSS variables track whatever your outer app sets — wire them through your theme layer (CSS variables, data-attributes, next-themes, anything) and the output follows.

## Plugins

Plugins consume their own subset of CSS variables:

- `@inkset/code` reads Shiki's theme vars.
- `@inkset/math` reads KaTeX's.
- `@inkset/table` reads the `table.*` section of the theme prop.

See each plugin's doc page for the specific tokens they expose.

## See also

- [`<Inkset>`](/docs/component) — the full prop list.
