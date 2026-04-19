"use client";

import React from "react";
import { ThemeProvider, useThemeKey } from "../lib/theme-context";
import { getPalette, paletteToCssVars } from "../lib/themes";
import { SITE_NAV_STYLES } from "./site-nav";
import { FOOTER_STYLES } from "./footer";

const GLOBAL_STYLES = `
/* Smooth palette transitions only on color-ish props so layout never
   reflows on theme swap. */
.pg-root {
  min-height: 100vh;
  min-height: 100dvh;
}
.pg-root,
.pg-root * {
  transition-property: background-color, border-color, color, fill, stroke;
  transition-duration: 140ms;
  transition-timing-function: ease;
}
/* Disable transitions during layout-sensitive work. */
@media (prefers-reduced-motion: reduce) {
  .pg-root,
  .pg-root * {
    transition-duration: 0ms !important;
  }
}
${SITE_NAV_STYLES}
${FOOTER_STYLES}
`;

const PaletteApplier = ({ children }: { children: React.ReactNode }) => {
  const { themeKey } = useThemeKey();
  const palette = getPalette(themeKey);
  return (
    <div
      className="pg-root"
      data-theme={themeKey}
      style={{
        ...paletteToCssVars(palette),
        background: "var(--pg-bg)",
        color: "var(--pg-text-primary)",
      }}
    >
      {children}
    </div>
  );
};

export const RootChrome = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
      <PaletteApplier>{children}</PaletteApplier>
    </ThemeProvider>
  );
};
