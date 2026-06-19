// useAppTheme.ts
import { useMemo, useEffect, useState } from "react";
import { createTheme } from "@mui/material/styles";
import { prefsStore } from "./prefs-store";

export function useAppTheme() {
    const [systemPrefersDark, setSystemPrefersDark] = useState(
        window.matchMedia("(prefers-color-scheme: dark)").matches
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    }, []);

    const themeMode = prefsStore.get("themeMode") as "light" | "dark" | "auto";

    const actualMode = useMemo(() => {
        if (themeMode === "auto") return systemPrefersDark ? "dark" : "light";
        return themeMode;
    }, [themeMode, systemPrefersDark]);

    const theme = useMemo(
        () =>
            createTheme({
                typography: { fontFamily: "Inter, sans-serif" },
                palette: { mode: actualMode },
            }),
        [actualMode]
    );

    return theme;
}