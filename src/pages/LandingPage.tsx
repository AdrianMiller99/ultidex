import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { derivePokemonForGeneration, loadPokemonSource } from "../api/pokeapi";
import { BentoCard, generationLabel } from "../components/BentoCard";
import { EvolutionTree } from "../components/EvolutionTree";
import { Header } from "../components/Header";
import { StatBars } from "../components/StatBars";
import { TypePills } from "../components/TypePills";
import { useAppContext } from "../context/AppContext";
import type { PokemonSourceData } from "../types/pokemon";
import { formatPokemonName, titleCase } from "../utils/format";
import { calculateTypeEffectiveness } from "../utils/typeEffectiveness";

export function LandingPage() {
  const navigate = useNavigate();
  const { generation } = useAppContext();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [previewSource, setPreviewSource] = useState<PokemonSourceData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showShinyPreview, setShowShinyPreview] = useState(false);
  const [previewMoveMode, setPreviewMoveMode] = useState<"level-up" | "machine">("level-up");
  const [searchQuery, setSearchQuery] = useState("");
  const [abilityTooltip, setAbilityTooltip] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);

  function hideAbilityTooltip() {
    setAbilityTooltip(null);
  }

  function showAbilityTooltip(target: HTMLElement, text: string) {
    const rect = target.getBoundingClientRect();
    const margin = 12;
    const tooltipWidth = 320;
    const estimatedHeight = 110;

    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - tooltipWidth - margin);
    let top = rect.bottom + 8;

    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - estimatedHeight - 8);
    }

    setAbilityTooltip({ text, top, left });
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPreview(true);
    setPreviewError(null);

    loadPokemonSource("riolu")
      .then((source) => {
        if (cancelled) {
          return;
        }
        setPreviewSource(source);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setPreviewError(err instanceof Error ? err.message : "Could not load preview.");
        setPreviewSource(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const previewPokemon = useMemo(() => {
    if (!previewSource) {
      return null;
    }
    return derivePokemonForGeneration(previewSource, generation, previewMoveMode);
  }, [previewSource, generation, previewMoveMode]);

  const previewMoves = useMemo(() => previewPokemon?.moves.slice(0, 12) ?? [], [previewPokemon]);
  const previewTypeEffectiveness = useMemo(() => {
    if (!previewPokemon) {
      return [];
    }
    return calculateTypeEffectiveness(previewPokemon.types).filter((bucket) => bucket.types.length > 0);
  }, [previewPokemon]);

  useEffect(() => {
    hideAbilityTooltip();
  }, [previewPokemon, generation]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.key !== "/" || isEditableTarget) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <div className="app-shell landing-shell">
      <Header />
      <main className="page-content landing-page">
        <section className="landing-split">
          <section className="landing-copy">
            <p className="landing-kicker">Ultimate Pokedex</p>
            <h1>One view.<br />One Pokemon.<br />All the stats.</h1>
            <p>
              Search by name or number, compare movesets by generation, inspect evolutions, forms, type matchups, and base
              stats instantly.
            </p>

            <form
              className="landing-search"
              action="#"
              onSubmit={(event) => {
                event.preventDefault();
                if (!searchQuery.trim()) {
                  return;
                }
                navigate(`/search/${encodeURIComponent(searchQuery.trim())}`, {
                  state: { preferredSkeleton: "lookup" as const },
                });
              }}
            >
              <input
                ref={searchInputRef}
                name="query"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                autoComplete="off"
                placeholder="Search Pokemon, Attack, or Ability"
                aria-label="Search query"
              />
              <button type="submit">Search</button>
            </form>

            <div className="landing-points">
              <span>No Login</span>
              <span>PokeAPI Powered</span>
            </div>
          </section>

          <section className="landing-preview-pane">
            <header className="landing-preview-header">
              <h2>Interactive Preview</h2>
              <span>{previewPokemon ? `${formatPokemonName(previewPokemon.name)} - ${generationLabel(generation)}` : "Bulbasaur"}</span>
            </header>

            {isLoadingPreview ? <section className="status-panel">Loading preview...</section> : null}
            {!isLoadingPreview && previewError ? <section className="status-panel status-error">{previewError}</section> : null}

            {!isLoadingPreview && !previewError && previewPokemon ? (
              <section className="landing-preview-grid">
                <BentoCard title="Pokemon" className="landing-card-summary" subtitle={`#${previewPokemon.id}`}>
                  <div className="summary-card">
                    <div className="pokemon-image-wrap">
                      {previewPokemon.image ? (
                        <img
                          src={showShinyPreview ? previewPokemon.shinyImage : previewPokemon.image}
                          alt={formatPokemonName(previewPokemon.name)}
                          className="pokemon-image"
                        />
                      ) : (
                        <div className="image-fallback">No sprite</div>
                      )}
                    </div>

                    <div className="summary-meta">
                      <h3>{formatPokemonName(previewPokemon.name)}</h3>
                      <TypePills types={previewPokemon.types} />
                      <button className="shiny-toggle" type="button" onClick={() => setShowShinyPreview((prev) => !prev)}>
                        {showShinyPreview ? "Show default" : "Show shiny"}
                      </button>
                    </div>
                  </div>
                </BentoCard>

                <BentoCard title="Base Stats" className="landing-card-stats" subtitle={`Total ${previewPokemon.statTotal}`}>
                  <StatBars stats={previewPokemon.stats} />
                </BentoCard>

                <BentoCard title="Abilities" className="landing-card-abilities" subtitle={`${previewPokemon.abilities.length} listed`}>
                  <ul className="ability-list">
                    {previewPokemon.abilities.map((ability) => (
                      <li
                        key={ability.name}
                        className="ability-item"
                        tabIndex={0}
                        onMouseEnter={(event) => showAbilityTooltip(event.currentTarget, ability.description)}
                        onMouseLeave={hideAbilityTooltip}
                        onFocus={(event) => showAbilityTooltip(event.currentTarget, ability.description)}
                        onBlur={hideAbilityTooltip}
                      >
                        <div className="ability-main">
                          <strong>{titleCase(ability.name)}</strong>
                        </div>
                        {ability.hidden ? <span className="ability-badge">Hidden</span> : null}
                      </li>
                    ))}
                  </ul>
                </BentoCard>

                <BentoCard title="Evolutions" className="landing-card-evolution">
                  <EvolutionTree
                    root={previewPokemon.evolutionRoot}
                    onSelectPokemon={(pokemonName) => navigate(`/pokemon/${encodeURIComponent(pokemonName)}`)}
                  />
                </BentoCard>

                <BentoCard title="Type Matchups" className="landing-card-effectiveness" subtitle="Damage taken">
                  <div className="type-matchups">
                    {previewTypeEffectiveness.length > 0 ? (
                      previewTypeEffectiveness.map((bucket) => (
                        <div className="type-matchup-row" key={bucket.label}>
                          <span className="type-matchup-label">{bucket.label}</span>
                          <TypePills types={bucket.types} size="xs" />
                        </div>
                      ))
                    ) : (
                      <p className="type-matchup-empty">No matchup data available.</p>
                    )}
                  </div>
                </BentoCard>

                <BentoCard
                  title={
                    <span className="moves-header-toggle">
                      <span className={`moves-mode-label ${previewMoveMode === "level-up" ? "is-active" : ""}`}>Level-Up</span>
                      <button
                        type="button"
                        className={`moves-mode-switch ${previewMoveMode === "machine" ? "is-on" : ""}`}
                        onClick={() => setPreviewMoveMode((prev) => (prev === "level-up" ? "machine" : "level-up"))}
                        aria-label="Toggle preview move source"
                        aria-pressed={previewMoveMode === "machine"}
                      >
                        <span className="moves-mode-thumb" />
                      </button>
                      <span className={`moves-mode-label ${previewMoveMode === "machine" ? "is-active" : ""}`}>TM/HM</span>
                    </span>
                  }
                  className="landing-card-moves"
                  subtitle={`${previewPokemon.moves.length} moves`}
                >
                  <table className="moves-table">
                    <thead>
                      <tr>
                        <th>Lvl</th>
                        <th>Move</th>
                        <th>Type</th>
                        <th>Cat</th>
                        <th>PWR</th>
                        <th>ACC</th>
                        <th>PP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewMoves.map((move) => (
                        <tr key={move.name}>
                          <td>{move.level ?? "-"}</td>
                          <td>{titleCase(move.name)}</td>
                          <td>
                            <TypePills types={[move.type]} size="sm" />
                          </td>
                          <td>{titleCase(move.category)}</td>
                          <td>{move.power ?? "-"}</td>
                          <td>{move.accuracy ?? "-"}</td>
                          <td>{move.pp ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </BentoCard>
              </section>
            ) : null}
          </section>
        </section>
      </main>

      {abilityTooltip && typeof document !== "undefined"
        ? createPortal(
            <div className="ability-tooltip-layer" role="tooltip" style={{ top: abilityTooltip.top, left: abilityTooltip.left }}>
              {abilityTooltip.text}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
