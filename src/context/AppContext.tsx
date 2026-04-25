import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "dark" | "light";

export interface TeamPokemon {
  name: string;
  image: string;
}

interface AppContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  generation: number;
  setGeneration: (generation: number) => void;
  team: TeamPokemon[];
  addTeamPokemon: (pokemon: TeamPokemon) => void;
  removeTeamPokemon: (index: number) => void;
}

const STORAGE_THEME = "ultimate_pokedex_theme";
const STORAGE_GENERATION = "ultimate_pokedex_generation";
const STORAGE_TEAM = "ultimate_pokedex_team";
const MAX_TEAM_SIZE = 6;

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

function readTeam(): TeamPokemon[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_TEAM) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is TeamPokemon => typeof entry?.name === "string" && typeof entry?.image === "string")
      .slice(0, MAX_TEAM_SIZE);
  } catch {
    return [];
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());
  const [generation, setGeneration] = useState<number>(() => readGeneration());
  const [team, setTeam] = useState<TeamPokemon[]>(() => readTeam());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_THEME, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_GENERATION, String(generation));
  }, [generation]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TEAM, JSON.stringify(team));
  }, [team]);

  const value = useMemo<AppContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
      generation,
      setGeneration,
      team,
      addTeamPokemon: (pokemon) => {
        setTeam((prev) => (prev.length >= MAX_TEAM_SIZE ? prev : [...prev, pokemon].slice(0, MAX_TEAM_SIZE)));
      },
      removeTeamPokemon: (index) => {
        setTeam((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
      },
    }),
    [theme, generation, team]
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
