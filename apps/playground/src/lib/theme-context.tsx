"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { THEME_ORDER, type ThemeKey } from "./themes";

type ThemeContextValue = {
  themeKey: ThemeKey;
  setThemeKey: (key: ThemeKey) => void;
  cycleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "inkset:theme";

const readStoredTheme = (): ThemeKey => {
  if (typeof window === "undefined") return "light";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && (THEME_ORDER as string[]).includes(raw)) {
    return raw as ThemeKey;
  }
  return "light";
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Server renders with "light"; the client effect below reconciles to the
  // stored preference without a layout jump — palette CSS vars are applied
  // via useLayoutEffect so the first paint after hydration is already themed.
  const [themeKey, setThemeKeyState] = useState<ThemeKey>("light");

  useEffect(() => {
    setThemeKeyState(readStoredTheme());
  }, []);

  const setThemeKey = useCallback((key: ThemeKey) => {
    setThemeKeyState(key);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, key);
    }
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeKeyState((prev) => {
      const idx = THEME_ORDER.indexOf(prev);
      const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeKey, setThemeKey, cycleTheme }),
    [themeKey, setThemeKey, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeKey = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeKey must be used inside <ThemeProvider>");
  }
  return ctx;
};
