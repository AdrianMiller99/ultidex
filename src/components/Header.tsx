import { Link, useLocation, useNavigate } from "react-router-dom";
import { GENERATIONS } from "../constants/pokemon";
import { useAppContext } from "../context/AppContext";
import { normalizePokemonInput } from "../utils/format";

interface HeaderProps {
  showSearch?: boolean;
}

export function Header({ showSearch = false }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme, generation, setGeneration } = useAppContext();

  const pathParts = location.pathname.split("/").filter(Boolean);
  const pokemonFromPath = pathParts[0] === "pokemon" ? decodeURIComponent(pathParts[1] ?? "") : "";

  function submitSearch(formData: FormData) {
    const query = normalizePokemonInput(String(formData.get("pokemon") ?? ""));
    if (!query) {
      return;
    }
    navigate(`/pokemon/${encodeURIComponent(query)}`);
  }

  return (
    <header className="site-header">
      <div className="site-header-left">
        <Link to="/" className="brand-link">
          Ultimate Pokedex
        </Link>
      </div>

      {showSearch ? (
        <form
          className="header-search"
          action="#"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(new FormData(event.currentTarget));
          }}
        >
          <input
            name="pokemon"
            defaultValue={pokemonFromPath}
            autoComplete="off"
            placeholder="Search Pokemon by name or ID"
          />
          <button type="submit">Search</button>
        </form>
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
