import { useEffect, useState } from "react";

/**
 * Light/dark theme hook.
 *
 * Source of truth: the `.dark` class on `<html>`. Persistence:
 * `localStorage('streamline-theme')`. The initial class is applied by
 * an inline `<script>` in `index.html` BEFORE React paints, so there's
 * no flash-of-wrong-theme on hard reload.
 *
 * Default is `"dark"` to match Claraity-web's vibe and the previous
 * (locked-to-dark) Streamline-Web behavior — anyone who's used the
 * app before doesn't suddenly land in light mode after the toggle
 * ships.
 *
 * We DON'T listen to `prefers-color-scheme` after first paint: once
 * the user has flipped the toggle, their explicit choice wins until
 * they flip it again. (Same behavior as Claraity-web's `darkMode`
 * boolean setting.)
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "streamline-theme";

/** Read the current theme by inspecting the `<html>` class. SSR-safe. */
function readThemeFromDom(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readThemeFromDom);

  // Apply theme to the DOM + persist whenever it changes via the hook.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage can throw in private-mode Safari etc. Silent
      // failure is fine — the in-memory state still works.
    }
  }, [theme]);

  return {
    theme,
    setTheme: setThemeState,
    toggle: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
  };
}
