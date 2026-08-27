import { useEffect } from "react";
import { useApp } from "~/stores/app";

/// macOS can change appearance while the app is open — on a schedule, or
/// because someone flipped it. Only the "system" choice follows along; a named
/// palette stays where it was put.
export function useSystemTheme() {
  const theme = useApp((state) => state.theme);
  const syncSystemTheme = useApp((state) => state.syncSystemTheme);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", syncSystemTheme);
    return () => query.removeEventListener("change", syncSystemTheme);
  }, [theme, syncSystemTheme]);
}
