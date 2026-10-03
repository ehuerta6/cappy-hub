"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "cappy-hub-theme";
const THEME_CHANGE_EVENT = "cappy-hub-theme-change";

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

function toggleTheme() {
  const nextTheme = getTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // The active page theme still changes if browser storage is unavailable.
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, () => "dark");
  return { theme, toggleTheme };
}
