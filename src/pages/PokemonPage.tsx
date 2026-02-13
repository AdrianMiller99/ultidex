import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { countEvolutionNodes, derivePokemonForGeneration, loadPokemonSource } from "../api/pokeapi";
import { BentoCard, generationLabel } from "../components/BentoCard";
import { EvolutionTree } from "../components/EvolutionTree";
import { Header } from "../components/Header";
import { StatBars } from "../components/StatBars";
import { TypePills } from "../components/TypePills";
import { GENERATION_ROMAN } from "../constants/pokemon";
import { useAppContext } from "../context/AppContext";
import type { PokemonSourceData } from "../types/pokemon";
import { canonicalizePokemonIdentifier, formatPokemonName, titleCase } from "../utils/format";
import { calculateTypeEffectiveness } from "../utils/typeEffectiveness";

const REGIONAL_FORM_SUFFIXES = ["alola", "galar", "hisui", "paldea"] as const;

function detectRegionalFormSuffix(name: string): string | null {
  for (const suffix of REGIONAL_FORM_SUFFIXES) {
    if (name.includes(`-${suffix}`)) {
      return suffix;
    }
  }
  return null;
}

function resolveEvolutionVariantName(nodeName: string, varieties: string[], suffix: string | null): string {
  if (!suffix) {
    return nodeName;
  }

  const exactName = `${nodeName}-${suffix}`;
  if (varieties.includes(exactName)) {
    return exactName;
  }

  const partialMatch = varieties.find((variety) => variety.includes(`-${suffix}`));
  return partialMatch ?? nodeName;
}

export function PokemonPage() {
  const navigate = useNavigate();
  const { name = "" } = useParams();
  const { generation } = useAppContext();

  const [source, setSource] = useState<PokemonSourceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShiny, setShowShiny] = useState(false);
  const [moveMode, setMoveMode] = useState<"level-up" | "machine">("level-up");
  const [evolutionMode, setEvolutionMode] = useState<"evolutions" | "forms">("evolutions");
  const [selectedFormName, setSelectedFormName] = useState<string | null>(null);
  const [formSources, setFormSources] = useState<Record<string, PokemonSourceData>>({});
  const [formError, setFormError] = useState<string | null>(null);
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

    setIsLoading(true);
    setError(null);

    const canonicalName = canonicalizePokemonIdentifier(decodeURIComponent(name));

    loadPokemonSource(canonicalName)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setSource(data);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : "Unexpected error while loading Pokemon.";
        setError(message);
        setSource(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  useEffect(() => {
    setShowShiny(false);
    setSelectedFormName(null);
    setFormSources({});
    setFormError(null);
    setEvolutionMode("evolutions");
  }, [name]);

  useEffect(() => {
    if (!selectedFormName || formSources[selectedFormName]) {
      return;
    }

    let cancelled = false;
    setFormError(null);

    loadPokemonSource(selectedFormName)
      .then((formSource) => {
        if (cancelled) {
          return;
        }
        setFormSources((prev) => ({ ...prev, [selectedFormName]: formSource }));
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setFormError(err instanceof Error ? err.message : "Could not load alternative form.");
        setSelectedFormName(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFormName, formSources]);

  const activeSource = useMemo(() => {
    if (selectedFormName && formSources[selectedFormName]) {
      return formSources[selectedFormName];
    }
    return source;
  }, [source, selectedFormName, formSources]);

  useEffect(() => {
    hideAbilityTooltip();
  }, [name, generation, selectedFormName]);

  const pokemon = useMemo(() => {
    if (!activeSource) {
      return null;
    }
    return derivePokemonForGeneration(activeSource, generation, moveMode);
  }, [activeSource, generation, moveMode]);

  const evolutionNodeCount = useMemo(() => countEvolutionNodes(pokemon?.evolutionRoot ?? null), [pokemon?.evolutionRoot]);
  const alternativeForms = useMemo(() => source?.alternativeForms ?? [], [source]);
  const hasAlternativeForms = alternativeForms.length > 0;
  const regionalFormSuffix = useMemo(() => {
    if (!pokemon) {
      return null;
    }
    return detectRegionalFormSuffix(pokemon.name);
  }, [pokemon]);
  const typeEffectiveness = useMemo(() => {
    if (!pokemon) {
      return [];
    }
    return calculateTypeEffectiveness(pokemon.types);
  }, [pokemon]);

  useEffect(() => {
    if (!hasAlternativeForms && evolutionMode === "forms") {
      setEvolutionMode("evolutions");
    }
  }, [hasAlternativeForms, evolutionMode]);

  return (
    <div className="app-shell pokemon-shell">
      <Header showSearch />

      <main className="page-content pokemon-page">
        {isLoading ? <section className="status-panel">Loading Pokemon data...</section> : null}
        {!isLoading && error ? <section className="status-panel status-error">{error}</section> : null}

        {!isLoading && !error && pokemon ? (
          <>
            {!pokemon.isAvailableInGeneration ? (
              <section className="generation-warning">
                {formatPokemonName(pokemon.name)} was introduced in {generationLabel(pokemon.introducedGeneration)} and is not
                available in Gen {GENERATION_ROMAN[generation] ?? generation}.
              </section>
            ) : null}

            <section className="bento-grid">
              <BentoCard title="Pokemon" className="card-summary" subtitle={`#${pokemon.id}`}>
                <div className="summary-card">
                  <div className="pokemon-image-wrap">
                    {pokemon.image ? (
                      <img
                        src={showShiny ? pokemon.shinyImage : pokemon.image}
                        alt={formatPokemonName(pokemon.name)}
                        className="pokemon-image"
                      />
                    ) : (
                      <div className="image-fallback">No sprite</div>
                    )}
                  </div>

                  <div className="summary-meta">
                    <h3>{formatPokemonName(pokemon.name)}</h3>
                    <TypePills types={pokemon.types} />
                    <button className="shiny-toggle" type="button" onClick={() => setShowShiny((prev) => !prev)}>
                      {showShiny ? "Show default" : "Show shiny"}
                    </button>
                  </div>
                </div>
              </BentoCard>

              <BentoCard title="Base Stats" className="card-stats" subtitle={`Total ${pokemon.statTotal}`}>
                <StatBars stats={pokemon.stats} />
              </BentoCard>

              <BentoCard title="Abilities" className="card-abilities" subtitle={`${pokemon.abilities.length} listed`}>
                {pokemon.abilities.length > 0 ? (
                  <ul className="ability-list">
                    {pokemon.abilities.map((ability) => (
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
                ) : (
                  <p className="empty-state">No abilities available for this generation.</p>
                )}
              </BentoCard>

              <BentoCard
                title={
                  <span className="evo-header-toggle">
                    <span className={`evo-mode-label ${evolutionMode === "evolutions" ? "is-active" : ""}`}>Evolutions</span>
                    <button
                      type="button"
                      className={`evo-mode-switch ${evolutionMode === "forms" ? "is-on" : ""} ${
                        !hasAlternativeForms ? "is-disabled" : ""
                      }`}
                      onClick={() =>
                        setEvolutionMode((prev) => (hasAlternativeForms ? (prev === "evolutions" ? "forms" : "evolutions") : prev))
                      }
                      aria-label="Toggle between evolutions and alternative forms"
                      aria-pressed={evolutionMode === "forms"}
                      disabled={!hasAlternativeForms}
                    >
                      <span className="evo-mode-thumb" />
                    </button>
                    <span className={`evo-mode-label ${evolutionMode === "forms" ? "is-active" : ""}`}>Alt Forms</span>
                  </span>
                }
                className="card-evolution"
                subtitle={
                  evolutionMode === "evolutions"
                    ? `${evolutionNodeCount} evolution stages`
                    : `${alternativeForms.length} alternatives`
                }
              >
                {evolutionMode === "evolutions" ? (
                  <EvolutionTree
                    root={pokemon.evolutionRoot}
                    resolvePokemonName={(node) => resolveEvolutionVariantName(node.name, node.varieties, regionalFormSuffix)}
                    onSelectPokemon={(pokemonName) => navigate(`/pokemon/${encodeURIComponent(pokemonName)}`)}
                  />
                ) : hasAlternativeForms ? (
                  <div className="alt-forms-panel">
                    <p className="alt-forms-hint">Select one form. Click it again to return to base.</p>
                    <ul className="alt-forms-list">
                      {alternativeForms.map((form) => (
                        <li key={form.name}>
                          <button
                            type="button"
                            className={`alt-form-button ${selectedFormName === form.name ? "is-selected" : ""}`}
                            onClick={() => setSelectedFormName((prev) => (prev === form.name ? null : form.name))}
                          >
                            {formatPokemonName(form.name)}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {formError ? <p className="empty-state">{formError}</p> : null}
                  </div>
                ) : (
                  <p className="empty-state">This Pokemon has no alternative forms.</p>
                )}
              </BentoCard>

              <BentoCard title="Type Matchups" className="card-effectiveness" subtitle="Damage taken">
                <div className="type-matchups">
                  {typeEffectiveness.map((bucket) => (
                    <div className="type-matchup-row" key={bucket.label}>
                      <span className="type-matchup-label">{bucket.label}</span>
                      {bucket.types.length > 0 ? (
                        <TypePills types={bucket.types} size="xs" />
                      ) : (
                        <span className="type-matchup-empty">None</span>
                      )}
                    </div>
                  ))}
                </div>
              </BentoCard>

              <BentoCard
                title={
                  <span className="moves-header-toggle">
                    <span className={`moves-mode-label ${moveMode === "level-up" ? "is-active" : ""}`}>Level-Up Moves</span>
                    <button
                      type="button"
                      className={`moves-mode-switch ${moveMode === "machine" ? "is-on" : ""}`}
                      onClick={() => setMoveMode((prev) => (prev === "level-up" ? "machine" : "level-up"))}
                      aria-label="Toggle between Level-Up moves and TM/HM moves"
                      aria-pressed={moveMode === "machine"}
                    >
                      <span className="moves-mode-thumb" />
                    </button>
                    <span className={`moves-mode-label ${moveMode === "machine" ? "is-active" : ""}`}>TM/HM Moves</span>
                  </span>
                }
                className="card-moves"
                subtitle={`${pokemon.moves.length} moves in ${generationLabel(generation)}`}
              >
                {pokemon.moves.length > 0 ? (
                  <table className="moves-table">
                    <thead>
                      <tr>
                        <th>Lvl</th>
                        <th>Move</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th>PWR</th>
                        <th>ACC</th>
                        <th>PP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pokemon.moves.map((move) => (
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
                ) : (
                  <p className="empty-state">
                    No {moveMode === "level-up" ? "level-up" : "TM/HM"} moves found for this generation.
                  </p>
                )}
              </BentoCard>
            </section>
          </>
        ) : null}
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
