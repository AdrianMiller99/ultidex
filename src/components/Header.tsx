import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GENERATIONS } from "../constants/pokemon";
import { useAppContext } from "../context/AppContext";

interface HeaderProps {
  showSearch?: boolean;
}

export function Header({ showSearch = false }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme, generation, setGeneration } = useAppContext();
  const locationState = location.state as { preferredSkeleton?: "pokemon" | "lookup" } | null;

  const queryFromPath = useMemo(() => {
    const pathParts = location.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      return "";
    }

    if (pathParts[0] === "pokemon" || pathParts[0] === "moves" || pathParts[0] === "abilities" || pathParts[0] === "search") {
      return decodeURIComponent(pathParts[1] ?? "");
    }

    return "";
  }, [location.pathname]);
  const [query, setQuery] = useState(queryFromPath);

  useEffect(() => {
    setQuery(queryFromPath);
  }, [queryFromPath]);

  function submitSearch(formData: FormData) {
    const rawQuery = String(formData.get("query") ?? "");
    if (!rawQuery.trim()) {
      return;
    }

    const preferredSkeleton: "pokemon" | "lookup" =
      location.pathname.startsWith("/pokemon") || locationState?.preferredSkeleton === "pokemon" ? "pokemon" : "lookup";

    navigate(`/search/${encodeURIComponent(rawQuery.trim())}`, {
      state: { preferredSkeleton },
    });
  }

  return (
    <header className="site-header">
      <div className="site-header-left">
        <Link to="/" className="brand-link">
          <img src="/pokedex_logo.svg" alt="UltiDex logo" className="brand-logo" />
          UltiDex
        </Link>
      </div>

      {showSearch ? (
        <div className="header-search-wrap">
          <form
            className="header-search"
            action="#"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch(new FormData(event.currentTarget));
            }}
          >
            <input
              name="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              placeholder="Search Pokemon, Attack, or Ability"
            />
            <button type="submit">Search</button>
          </form>
        </div>
      ) : null}

      <div className="site-header-controls">
        <label className="generation-select">
          <span>Generation</span>
          <select value={generation} onChange={(event) => setGeneration(Number(event.target.value))}>
            {GENERATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "Light" : "Dark"} mode
        </button>
      </div>
    </header>
  );
}
