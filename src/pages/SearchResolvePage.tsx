import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { resolveSearchPath } from "../api/pokeapi";
import { Header } from "../components/Header";

function SearchResolveSkeleton() {
  return (
    <article className="lookup-panel lookup-panel-skeleton" aria-hidden="true">
      <div className="lookup-skeleton-line skeleton-kicker" />
      <div className="lookup-skeleton-line skeleton-title" />
      <div className="lookup-skeleton-line skeleton-generation" />

      <div className="lookup-skeleton-paragraph">
        <div className="lookup-skeleton-line skeleton-paragraph-line" />
        <div className="lookup-skeleton-line skeleton-paragraph-line" />
        <div className="lookup-skeleton-line skeleton-paragraph-line short" />
      </div>
    </article>
  );
}

function SearchNotFoundCard({ query }: { query: string }) {
  return (
    <article className="search-empty-card">
      <img src="/psyduck.png" alt="Confused Psyduck" className="search-empty-image" />
      <div className="search-empty-copy">
        <p className="search-empty-kicker">Search Failed</p>
        <h1>Psyduck is confused.</h1>
        <p>
          We could not find any Pokemon, attack, or ability for <strong>{query}</strong>.
        </p>
        <p>Try another spelling, another language variant, or a different term.</p>
      </div>
    </article>
  );
}

function PokemonSearchResolveSkeleton() {
  return (
    <section className="bento-grid pokemon-bento-skeleton" aria-hidden="true">
      <article className="bento-card card-summary">
        <header className="bento-card-header">
          <div className="lookup-skeleton-line pokemon-skeleton-header-line" />
          <div className="lookup-skeleton-line pokemon-skeleton-subtitle-line" />
        </header>
        <div className="bento-card-body">
          <div className="summary-card">
            <div className="pokemon-image-wrap">
              <div className="lookup-skeleton-line pokemon-skeleton-image" />
            </div>
            <div className="summary-meta">
              <div className="lookup-skeleton-line pokemon-skeleton-name-line" />
              <div className="pokemon-skeleton-pill-row">
                <div className="lookup-skeleton-line pokemon-skeleton-pill" />
                <div className="lookup-skeleton-line pokemon-skeleton-pill" />
              </div>
              <div className="lookup-skeleton-line pokemon-skeleton-button-line" />
            </div>
          </div>
        </div>
      </article>

      <article className="bento-card card-stats">
        <header className="bento-card-header">
          <div className="lookup-skeleton-line pokemon-skeleton-header-line" />
          <div className="lookup-skeleton-line pokemon-skeleton-subtitle-line" />
        </header>
        <div className="bento-card-body pokemon-skeleton-list">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="pokemon-skeleton-stat-row">
              <div className="lookup-skeleton-line pokemon-skeleton-stat-label" />
              <div className="lookup-skeleton-line pokemon-skeleton-stat-track" />
              <div className="lookup-skeleton-line pokemon-skeleton-stat-value" />
            </div>
          ))}
        </div>
      </article>

      <article className="bento-card card-abilities">
        <header className="bento-card-header">
          <div className="lookup-skeleton-line pokemon-skeleton-header-line" />
          <div className="lookup-skeleton-line pokemon-skeleton-subtitle-line" />
        </header>
        <div className="bento-card-body pokemon-skeleton-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="pokemon-skeleton-item">
              <div className="lookup-skeleton-line pokemon-skeleton-item-main" />
              <div className="lookup-skeleton-line pokemon-skeleton-item-chip" />
            </div>
          ))}
        </div>
      </article>

      <article className="bento-card card-evolution">
        <header className="bento-card-header">
          <div className="lookup-skeleton-line pokemon-skeleton-header-line" />
          <div className="lookup-skeleton-line pokemon-skeleton-subtitle-line" />
        </header>
        <div className="bento-card-body pokemon-skeleton-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="pokemon-skeleton-evo-item">
              <div className="lookup-skeleton-line pokemon-skeleton-item-main" />
              <div className="lookup-skeleton-line pokemon-skeleton-item-secondary" />
            </div>
          ))}
        </div>
      </article>

      <article className="bento-card card-effectiveness">
        <header className="bento-card-header">
          <div className="lookup-skeleton-line pokemon-skeleton-header-line" />
          <div className="lookup-skeleton-line pokemon-skeleton-subtitle-line" />
        </header>
        <div className="bento-card-body pokemon-skeleton-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="pokemon-skeleton-type-row">
              <div className="lookup-skeleton-line pokemon-skeleton-type-label" />
              <div className="lookup-skeleton-line pokemon-skeleton-type-pill" />
            </div>
          ))}
        </div>
      </article>

      <article className="bento-card card-moves">
        <header className="bento-card-header">
          <div className="lookup-skeleton-line pokemon-skeleton-header-line wide" />
          <div className="lookup-skeleton-line pokemon-skeleton-subtitle-line" />
        </header>
        <div className="bento-card-body pokemon-skeleton-list">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="pokemon-skeleton-move-row">
              <div className="lookup-skeleton-line pokemon-skeleton-cell small" />
              <div className="lookup-skeleton-line pokemon-skeleton-cell large" />
              <div className="lookup-skeleton-line pokemon-skeleton-cell medium" />
              <div className="lookup-skeleton-line pokemon-skeleton-cell medium" />
              <div className="lookup-skeleton-line pokemon-skeleton-cell small" />
              <div className="lookup-skeleton-line pokemon-skeleton-cell small" />
              <div className="lookup-skeleton-line pokemon-skeleton-cell small" />
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export function SearchResolvePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { query = "" } = useParams();
  const decodedQuery = useMemo(() => decodeURIComponent(query), [query]);
  const preferredSkeleton = (location.state as { preferredSkeleton?: "pokemon" | "lookup" } | null)?.preferredSkeleton;
  const shouldShowPokemonSkeleton = preferredSkeleton === "pokemon";
  const [isResolving, setIsResolving] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isNotFoundState = error === "No Pokemon, attack, or ability found.";

  useEffect(() => {
    let cancelled = false;

    setIsResolving(true);
    setError(null);

    resolveSearchPath(decodedQuery)
      .then((path) => {
        if (cancelled) {
          return;
        }
        if (!path) {
          setError("No Pokemon, attack, or ability found.");
          setIsResolving(false);
          return;
        }
        navigate(path, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Could not run search.");
        setIsResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [decodedQuery, navigate]);

  return (
    <div className="app-shell lookup-shell">
      <Header showSearch />

      <main className={`page-content ${isResolving && shouldShowPokemonSkeleton ? "pokemon-page" : "lookup-page"}`}>
        {isResolving && shouldShowPokemonSkeleton ? <PokemonSearchResolveSkeleton /> : null}

        {!isResolving || !shouldShowPokemonSkeleton ? (
          <div className="lookup-center">
            {isResolving ? <SearchResolveSkeleton /> : null}
            {!isResolving && isNotFoundState ? <SearchNotFoundCard query={decodedQuery} /> : null}
            {!isResolving && error && !isNotFoundState ? <section className="status-panel status-error">{error}</section> : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
