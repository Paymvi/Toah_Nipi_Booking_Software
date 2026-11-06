// A per-browser preference. index.html applies the saved theme before first paint with this same key.
export const THEME_STORAGE_KEY = "toahNipiTheme";

// Light unless Night was explicitly saved; storage can be missing, blocked or hold anything.
export function readSavedTheme(storage) {
  try {
    return storage.getItem(THEME_STORAGE_KEY) === "night" ? "night" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(storage, theme) {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not saved: the theme still applies until this page is closed.
  }
}
