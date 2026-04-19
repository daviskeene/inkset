const SANS_FONT_FAMILY =
  '"Inter", "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, system-ui, -apple-system, sans-serif';
const READING_FONT_FAMILY =
  '"Libre Franklin", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';
const MONO_FONT_FAMILY =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';

export const fontVariables = {
  "--font-sans": SANS_FONT_FAMILY,
  "--font-reading": READING_FONT_FAMILY,
  "--font-mono": MONO_FONT_FAMILY,
} as const;

export const sans = {
  style: {
    fontFamily: SANS_FONT_FAMILY,
  },
} as const;

export const reading = {
  style: {
    fontFamily: READING_FONT_FAMILY,
  },
} as const;

export const mono = {
  style: {
    fontFamily: MONO_FONT_FAMILY,
  },
} as const;
