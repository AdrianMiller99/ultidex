import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { normalizePokemonInput } from "../utils/format";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="app-shell landing-shell">
      <Header />
      <main className="page-content landing-page">
        <section className="landing-panel">
          <p className="landing-kicker">PokeAPI powered</p>
          <h1>Search any Pokemon instantly.</h1>
          <p>
            Browse abilities, generation-based movesets, evolution lines, and base stats in a single-screen bento layout.
          </p>

          <form
            className="landing-search"
            action="#"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const query = normalizePokemonInput(String(data.get("pokemon") ?? ""));
              if (!query) {
                return;
              }
              navigate(`/pokemon/${encodeURIComponent(query)}`);
            }}
          >
            <input
              name="pokemon"
              autoComplete="off"
              placeholder="Type a Pokemon name or National Dex number"
              aria-label="Pokemon search"
            />
            <button type="submit">Open Pokedex</button>
          </form>
        </section>
      </main>
    </div>
  );
}
