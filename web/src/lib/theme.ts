// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
export type Theme = "auto" | "light" | "dark";

const KEY = "gwa-theme";
const ORDER: Theme[] = ["auto", "light", "dark"];

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The saved choice, or "auto" (follow the system). Storage can be missing or blocked, and that must never break the page. */
export function loadTheme(storage?: StorageLike): Theme {
  try {
    const saved = (storage ?? window.localStorage).getItem(KEY);
    return ORDER.includes(saved as Theme) ? (saved as Theme) : "auto";
  } catch {
    return "auto";
  }
}

export function saveTheme(theme: Theme, storage?: StorageLike): void {
  try {
    (storage ?? window.localStorage).setItem(KEY, theme);
  } catch {
    // Not saved: the choice still applies until the page is closed
  }
}

/** "auto" removes the attribute, so the system's light or dark setting decides. */
export function applyTheme(theme: Theme, root: { dataset: Record<string, string | undefined>; removeAttribute(name: string): void } = document.documentElement): void {
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
}

export const nextTheme = (theme: Theme): Theme => ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
