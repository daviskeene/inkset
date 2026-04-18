export type ThemeKey = "dark" | "light" | "sepia" | "dusk";

export const THEME_LABELS: Record<ThemeKey, string> = {
  dark: "dark",
  light: "light",
  sepia: "sepia",
  dusk: "dusk",
};

export const THEME_ORDER: ThemeKey[] = ["light", "dark", "sepia", "dusk"];

export type PagePalette = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  divider: string;
  chipActiveBg: string;
  chipActiveText: string;
  userBubbleBg: string;
  userBubbleText: string;
  submitBg: string;
  submitText: string;
  submitDisabledBg: string;
  submitDisabledText: string;
  sidebarCodeText: string;
  accent: string;
  accentSoft: string;
};

export const DARK_PALETTE: PagePalette = {
  bg: "#0a0a0a",
  surface: "#101010",
  surfaceRaised: "#181818",
  borderSubtle: "#1a1a1a",
  borderDefault: "#1f1f1f",
  borderStrong: "#333",
  textPrimary: "#ededed",
  textMuted: "#8b8fa6",
  textFaint: "#5a5a5a",
  divider: "#222",
  chipActiveBg: "#181818",
  chipActiveText: "#ededed",
  userBubbleBg: "#1c1c1f",
  userBubbleText: "#ededed",
  submitBg: "#ededed",
  submitText: "#0a0a0a",
  submitDisabledBg: "#1f1f1f",
  submitDisabledText: "#5a5a5a",
  sidebarCodeText: "#c8c8cc",
  accent: "#8da3c9",
  accentSoft: "rgba(141, 163, 201, 0.10)",
};

export const LIGHT_PALETTE: PagePalette = {
  bg: "#fafaf9",
  surface: "#ffffff",
  surfaceRaised: "#f2f2f0",
  borderSubtle: "#ececea",
  borderDefault: "#dddcd8",
  borderStrong: "#b5b4af",
  textPrimary: "#1a1a1a",
  textMuted: "#6a6a6a",
  textFaint: "#a8a8a6",
  divider: "#e4e4e2",
  chipActiveBg: "#ffffff",
  chipActiveText: "#1a1a1a",
  userBubbleBg: "#ebeae7",
  userBubbleText: "#1a1a1a",
  submitBg: "#1a1a1a",
  submitText: "#fafaf9",
  submitDisabledBg: "#e4e4e2",
  submitDisabledText: "#b0b0ae",
  sidebarCodeText: "#2a2a2a",
  accent: "#2b3a6b",
  accentSoft: "rgba(43, 58, 107, 0.08)",
};

// Warm paper. Reads like a pocket journal or a well-worn book. Sienna
// accent keeps it editorial rather than nostalgic-kitsch.
export const SEPIA_PALETTE: PagePalette = {
  bg: "#f3ecdc",
  surface: "#f9f3e2",
  surfaceRaised: "#ede3c8",
  borderSubtle: "#e4d7b4",
  borderDefault: "#d4c496",
  borderStrong: "#a89770",
  textPrimary: "#3a2e20",
  textMuted: "#6d5a42",
  textFaint: "#9f8a6c",
  divider: "#dccfa9",
  chipActiveBg: "#f9f3e2",
  chipActiveText: "#3a2e20",
  userBubbleBg: "#e6d9b3",
  userBubbleText: "#3a2e20",
  submitBg: "#3a2e20",
  submitText: "#f9f3e2",
  submitDisabledBg: "#d4c496",
  submitDisabledText: "#a89770",
  sidebarCodeText: "#4a3d2a",
  accent: "#8b4d2b",
  accentSoft: "rgba(139, 77, 43, 0.10)",
};

// Reading-by-lamplight. Deep blue-black with warm cream text and a muted
// gold accent — the palette of a library at night.
export const DUSK_PALETTE: PagePalette = {
  bg: "#0e1019",
  surface: "#14172b",
  surfaceRaised: "#1d2138",
  borderSubtle: "#1a1e30",
  borderDefault: "#272c44",
  borderStrong: "#3b415f",
  textPrimary: "#e6dfc8",
  textMuted: "#9ba1bc",
  textFaint: "#5c6283",
  divider: "#232744",
  chipActiveBg: "#1d2138",
  chipActiveText: "#f1ead1",
  userBubbleBg: "#232744",
  userBubbleText: "#e6dfc8",
  submitBg: "#e6dfc8",
  submitText: "#0e1019",
  submitDisabledBg: "#1d2138",
  submitDisabledText: "#5c6283",
  sidebarCodeText: "#c9c0a5",
  accent: "#d4a55a",
  accentSoft: "rgba(212, 165, 90, 0.12)",
};

export const getPalette = (key: ThemeKey): PagePalette => {
  switch (key) {
    case "light":
      return LIGHT_PALETTE;
    case "sepia":
      return SEPIA_PALETTE;
    case "dusk":
      return DUSK_PALETTE;
    default:
      return DARK_PALETTE;
  }
};

export const paletteToCssVars = (p: PagePalette): Record<string, string> => {
  return {
    "--pg-bg": p.bg,
    "--pg-surface": p.surface,
    "--pg-surface-raised": p.surfaceRaised,
    "--pg-border-subtle": p.borderSubtle,
    "--pg-border-default": p.borderDefault,
    "--pg-border-strong": p.borderStrong,
    "--pg-text-primary": p.textPrimary,
    "--pg-text-muted": p.textMuted,
    "--pg-text-faint": p.textFaint,
    "--pg-divider": p.divider,
    "--pg-chip-active-bg": p.chipActiveBg,
    "--pg-chip-active-text": p.chipActiveText,
    "--pg-user-bubble-bg": p.userBubbleBg,
    "--pg-user-bubble-text": p.userBubbleText,
    "--pg-submit-bg": p.submitBg,
    "--pg-submit-text": p.submitText,
    "--pg-submit-disabled-bg": p.submitDisabledBg,
    "--pg-submit-disabled-text": p.submitDisabledText,
    "--pg-sidebar-code-text": p.sidebarCodeText,
    "--pg-accent": p.accent,
    "--pg-accent-soft": p.accentSoft,
  };
};
