import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "dark" | "light";

interface AppContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  generation: number;
  setGeneration: (generation: number) => void;
}

const STORAGE_THEME = "ultimate_pokedex_theme";
const STORAGE_GENERATION = "ultimate_pokedex_generation";

const AppContext = createContext<AppContextValue | undefined>(undefined);

function readTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_THEME);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "dark";
}

function readGeneration(): number {
  const parsed = Number(localStorage.getItem(STORAGE_GENERATION));
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9) {
    return parsed;
  }
  return 9;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());
  const [generation, setGeneration] = useState<number>(() => readGeneration());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_THEME, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_GENERATION, String(generation));
  }, [generation]);

  const value = useMemo<AppContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
      generation,
      setGeneration,
    }),
    [theme, generation]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used inside AppProvider.");
  }
  return context;
}
