# Theming

Inkset includes a default stylesheet. Its colors, fonts, and sizes come from CSS custom properties on the `.inkset-root` element. You can change them with the `theme` prop or with CSS, or you can remove the stylesheet with `unstyled`.

## The theme prop

Pass an object that maps theme tokens to CSS values. A value can be a `var()` reference to your own variables.

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

The theme has these sections: `colors`, `typography`, `spacing`, `code`, `table`, `math`, and `diagram`. The `InksetTheme` type lists all tokens.

## CSS custom properties

Each theme token sets a CSS variable on the root element. You can set the variables in CSS instead:

```css
.inkset-root {
  --inkset-color-text: #1a1a1a;
  --inkset-color-text-muted: #6a6a6a;
  --inkset-code-block-bg: #f4f4f4;
}
```

The default stylesheet uses `:where()`, so your rules always override it.

When a value comes from more than one place, Inkset applies them in this order, and the last one wins:

1. The default stylesheet
2. Your CSS
3. The `font`, `fontSize`, `lineHeight`, and heading props
4. The `theme` prop
5. The `style` prop

Inkset sets the font family, font size, and line height variables from its props, and it measures text with the same values. Do not change the font in your CSS or in `theme.typography`. If you do, Inkset measures with a different font from the one on the screen.

## Color schemes

Inkset does not select a color scheme. Set its variables from your own theme, and Inkset uses them:

```css
[data-theme="dark"] .inkset-root {
  --inkset-color-text: #e8e8e8;
  --inkset-color-text-muted: #9a9a9a;
}
```

Code colors come from the Shiki themes that you give to `createCodePlugin`. See [@inkset/code](/docs/plugin-code#light-and-dark-themes).

## Headings

To change heading sizes, weights, or line heights, use the props on `<Inkset>`:

```tsx
<Inkset
  headingSizes={[3, 2.15, 1.3, 1]}
  headingWeights={[800, 780, 720, 680]}
  headingLineHeights={[1.05, 1.08, 1.15, 1.2]}
/>
```

Each tuple sets h1 to h4. h5 and h6 use the h4 value.

Do not use `theme.typography` for these values. The props change both the measurement and the CSS. The theme changes only the CSS, so Inkset reserves the wrong height for each heading.

## Spacing

Set the space between blocks with `blockSpacing`, not with CSS margins. Inkset calculates the position of each frozen block before it writes the block to the DOM, so CSS margins and selectors such as `p + p` have no effect on the layout.

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

- `default` is the space between all blocks.
- `blocks` sets the space above and below one type of block.
- `pairs` sets the space between two specific types of block, such as a paragraph followed by an h2.
