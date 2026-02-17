import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { loadAbilitySearchResult, loadMoveSearchResult } from "../api/pokeapi";
import { Header } from "../components/Header";
import { GENERATION_ROMAN } from "../constants/pokemon";
import { useAppContext } from "../context/AppContext";
import type { AbilitySearchResult, MoveSearchResult } from "../types/pokemon";
import { titleCase } from "../utils/format";

type SearchDetail = MoveSearchResult | AbilitySearchResult;

interface SearchDetailPageProps {
  kind: "move" | "ability";
}

function LookupSkeleton({ kind }: SearchDetailPageProps) {
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

      {kind === "move" ? (
        <div className="lookup-attack-meta">
          <div>
            <div className="lookup-skeleton-line skeleton-meta-label" />
            <div className="lookup-skeleton-line skeleton-meta-value" />
          </div>
          <div>
            <div className="lookup-skeleton-line skeleton-meta-label" />
            <div className="lookup-skeleton-line skeleton-meta-value" />
          </div>
          <div>
            <div className="lookup-skeleton-line skeleton-meta-label" />
            <div className="lookup-skeleton-line skeleton-meta-value" />
          </div>
          <div>
            <div className="lookup-skeleton-line skeleton-meta-label" />
            <div className="lookup-skeleton-line skeleton-meta-value" />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function SearchDetailPage({ kind }: SearchDetailPageProps) {
  const { name = "" } = useParams();
  const { generation } = useAppContext();
  const decodedName = useMemo(() => decodeURIComponent(name), [name]);
  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setDetail(null);

    const loader =
      kind === "move" ? loadMoveSearchResult(decodedName, generation) : loadAbilitySearchResult(decodedName, generation);

    loader
      .then((result) => {
        if (cancelled) {
          return;
        }
        setDetail(result);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load details.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [decodedName, generation, kind]);

  return (
    <div className="app-shell lookup-shell">
      <Header showSearch />

      <main className="page-content lookup-page">
        <div className="lookup-center">
          {isLoading ? <LookupSkeleton kind={kind} /> : null}
          {!isLoading && error ? <section className="status-panel status-error">{error}</section> : null}

          {!isLoading && !error && detail ? (
            <article className="lookup-panel">
              <p className="lookup-kicker">{detail.kind === "move" ? "Attack" : "Ability"}</p>
              <h1>{titleCase(detail.name)}</h1>
              <p className="lookup-generation-label">Generation {GENERATION_ROMAN[generation] ?? generation}</p>
              <p className="lookup-description">{detail.description}</p>

              {detail.kind === "move" ? (
                <dl className="lookup-attack-meta">
                  <div>
                    <dt>Power</dt>
                    <dd>{detail.power ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Accuracy</dt>
                    <dd>{detail.accuracy ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>PP</dt>
                    <dd>{detail.pp ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{titleCase(detail.category)}</dd>
                  </div>
                </dl>
              ) : null}
            </article>
          ) : null}
        </div>
      </main>
    </div>
  );
}
