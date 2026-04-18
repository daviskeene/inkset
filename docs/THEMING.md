# Theming Inkset

Inkset ships four layers of customization. Pick the lightest one that
satisfies your need.

| Layer           | When to use                                     | Wins over                   |
| --------------- | ----------------------------------------------- | --------------------------- |
| CSS variables   | One-off overrides in consumer CSS               | Built-in defaults           |
| `theme` prop    | Typed, grouped overrides on a single `<Inkset>` | CSS variables               |
| Heading tuples  | Change heading sizes without breaking layout    | Theme typography strings    |
| `style` prop    | Final escape hatch for a single property        | Everything above            |
| `unstyled` prop | Drop the default stylesheet, own the cascade    | All CSS the component emits |
| Plugin options  | Behavior toggles per plugin (not just visuals)  | (orthogonal)                |

Precedence, low to high:

```
built-in CSS defaults
  → font / fontSize / lineHeight props
  → headingSizes / headingWeights / headingLineHeights props
  → theme prop
  → style prop
```

## 1. CSS variables

Every visual knob in Inkset is declared as a `--inkset-*` custom property
inside a `:where(.inkset-root)` block (zero specificity). Override any of
them from your own stylesheet with a plain class selector and you win
without `!important`.

```css
.my-app .inkset-root {
  --inkset-color-text: #1a1a1a;
  --inkset-blockquote-accent: #e5e7eb;
  --inkset-code-block-bg: #f5f5f4;
}
```

The full list lives in `packages/react/src/index.tsx` under `INKSET_STYLES`.
Categories:

- **Colors:** `color-text`, `color-text-muted`, `color-hr`,
  `blockquote-accent`, `blockquote-text`, `inline-code-bg`, `inline-code-text`
- **Typography:** `font-family`, `font-family-mono`, `base-font-size`,
  `base-line-height-ratio`, `heading-{1..4}-size|line-height|weight|tracking`,
  `inline-code-size`
- **Spacing:** `list-indent`, `blockquote-padding-left`,
  `blockquote-border-width`, `inline-code-padding`, `inline-code-radius`
- **Code block:** `code-block-bg|padding|radius|font-size|line-height`,
  `code-header-padding|font-size|opacity|border`, `code-copy-padding|opacity`,
  `code-selection-bg`, `code-scrollbar-color`
- **Table:** `table-border`, `table-header-text|bg|font-size|weight|
tracking|padding`, `table-cell-padding`, `table-zebra-bg`,
  `table-row-hover-bg`
- **Math:** `math-error|error-font-size`,
  `math-display-padding|line-height|bg|radius`, `math-inline-bg`,
  `math-selection-bg`, `math-raw-font-size|opacity`

## 2. The `theme` prop

A typed object that flattens to the same CSS variables. Gives you
autocomplete and groups related knobs.

```tsx
import { Inkset, type InksetTheme } from "@inkset/react";

const warmTheme: InksetTheme = {
  colors: {
    text: "#e7c8a0",
    blockquoteAccent: "#ff8f4a",
    inlineCodeBg: "rgba(255, 143, 74, 0.15)",
  },
  typography: {
    fontFamily: "'IBM Plex Serif', serif",
    lineHeight: 1.6,
  },
  code: {
    background: "#2a1d12",
    blockRadius: "10px",
  },
};

<Inkset content={markdown} theme={warmTheme} />;
```

Every field is optional. Skipped fields fall through to the previous
precedence layer.

## 3. Heading metric tuples

Headings have a subtlety: changing their visual size via CSS also changes
how much vertical space Inkset's measurement layer reserves for them. If
the two drift apart, you'll see gaps or clipping between blocks.

The `headingSizes` / `headingWeights` / `headingLineHeights` props drive
both measurement _and_ CSS from the same numeric tuples.

```tsx
<Inkset
  content={markdown}
  // h1..h4 font size multipliers relative to base fontSize
  headingSizes={[2.25, 1.75, 1.35, 1]}
  // CSS font weights
  headingWeights={[700, 650, 600, 600]}
  // Line-height multipliers relative to each heading's own font size
  headingLineHeights={[1.1, 1.15, 1.2, 1.25]}
/>
```

Defaults are `[3, 2.15, 1.3, 1]`, `[800, 780, 720, 680]`, and
`[1.05, 1.08, 1.15, 1.2]`. h5 and h6 inherit h4.

If you only need visual changes (font-size but not layout), you can also
pass CSS strings under `theme.typography.headingSizes` — but that path is
visuals-only and layout will reserve space at the default multipliers.

## 4. Plugin options

Each built-in plugin takes both CSS vars (via `theme.code` / `theme.table` /
`theme.math`) and behavior options (on `createX`). The vars are pure styling;
the behavior options control render-time decisions.

### Code (`@inkset/code`)

```tsx
import { createCodePlugin } from "@inkset/code";

const code = createCodePlugin({
  theme: "one-dark-pro",
  lightTheme: "github-light", // dual-rendered, swaps under prefers-color-scheme: light
  showHeader: true,
  showCopy: true,
  showLangLabel: true,
  wrapLongLines: false,
});
```

### Table (`@inkset/table`)

```tsx
import { createTablePlugin } from "@inkset/table";

const table = createTablePlugin({
  showCopy: true,
  borderStyle: "horizontal", // "all" | "horizontal" | "none"
  zebra: false,
  stickyHeader: false,
});
```

### Math (`@inkset/math`)

```tsx
import { createMathPlugin } from "@inkset/math";

const math = createMathPlugin({
  displayAlign: "center", // "left" | "center" | "right"
  errorDisplay: "source", // "source" (raw LaTeX) | "message" | "hide"
});
```

Behavior options that reduce to CSS switches (border style, zebra, display
alignment) are implemented as `data-*` attributes on the block root. That
means you can target them from your own stylesheet without touching JS:

```css
.inkset-table-block[data-border-style="all"] td {
  border: 2px solid hotpink;
}
```

## 5. The `unstyled` prop

Drops the entire built-in `<style>` block. Layout still works (block
positioning is applied inline). Your stylesheet now owns the cascade.

```tsx
<Inkset content={markdown} unstyled className="my-prose" />
```

Good fits:

- Tailwind with a preflight reset — you own typography via `prose` or
  your own classes and don't want Inkset's defaults bleeding through.
- Vanilla-extract / CSS Modules projects that want strict style ownership.
- SSR purity where you don't want any runtime `<style>` tag.

You give up all `--inkset-*` defaults when using `unstyled`. Plugin CSS vars
(e.g. `--inkset-code-block-bg`) are still readable via `var()`, but nothing
consumes them until you write the rules yourself.

## Recipes

### Match the OS theme

Set `lightTheme` on the code plugin, use `prefers-color-scheme` in your CSS
for other knobs:

```tsx
const code = createCodePlugin({
  theme: "github-dark",
  lightTheme: "github-light",
});
```

```css
.inkset-root {
  --inkset-color-text: #e8e8eb;
  --inkset-code-block-bg: #24292e;
}
@media (prefers-color-scheme: light) {
  .inkset-root {
    --inkset-color-text: #1a1a1a;
    --inkset-code-block-bg: #f6f8fa;
  }
}
```

### Integrate with Tailwind `prose`

```tsx
<Inkset content={markdown} unstyled className="prose prose-invert max-w-none" />
```

The `unstyled` prop removes Inkset's cascade; the `prose` class gives you
Tailwind Typography's. Block layout still works because width/position come
from inline styles on each block.

### Just restyle headings

```tsx
<Inkset
  content={markdown}
  headingSizes={[1.8, 1.5, 1.25, 1]}
  headingWeights={[600, 600, 600, 500]}
  headingLineHeights={[1.2, 1.25, 1.3, 1.35]}
/>
```

Single numeric tuples keep visuals and layout in sync. No CSS needed.

### Swap a single property without a theme

```tsx
<Inkset
  content={markdown}
  style={{ "--inkset-blockquote-accent": "#ff4444" } as React.CSSProperties}
/>
```

`style` has the final word, so this wins even over a theme you passed.
