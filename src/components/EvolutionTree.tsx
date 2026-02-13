import type { EvolutionNode } from "../types/pokemon";
import { generationLabel } from "./BentoCard";
import { formatPokemonName } from "../utils/format";

interface EvolutionTreeProps {
  root: EvolutionNode | null;
  resolvePokemonName?: (node: EvolutionNode) => string;
  onSelectPokemon?: (pokemonName: string) => void;
}

function EvolutionBranch({
  node,
  resolvePokemonName,
  onSelectPokemon,
}: {
  node: EvolutionNode;
  resolvePokemonName?: (node: EvolutionNode) => string;
  onSelectPokemon?: (pokemonName: string) => void;
}) {
  const pokemonName = resolvePokemonName ? resolvePokemonName(node) : node.name;

  return (
    <li>
      <div className="evolution-item">
        <div className="evolution-item-main">
          {onSelectPokemon ? (
            <button type="button" className="evolution-link" onClick={() => onSelectPokemon(pokemonName)}>
              {formatPokemonName(pokemonName)}
            </button>
          ) : (
            <strong>{formatPokemonName(pokemonName)}</strong>
          )}
          <small>{generationLabel(node.generation)}</small>
        </div>
        {node.condition ? <p>{node.condition}</p> : null}
      </div>
      {node.children.length > 0 ? (
        <ul className="evolution-branch">
          {node.children.map((child) => (
            <EvolutionBranch
              key={`${node.name}-${child.name}`}
              node={child}
              resolvePokemonName={resolvePokemonName}
              onSelectPokemon={onSelectPokemon}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function EvolutionTree({ root, resolvePokemonName, onSelectPokemon }: EvolutionTreeProps) {
  if (!root) {
    return <p className="empty-state">No evolution data for this generation.</p>;
  }

  return (
    <ul className="evolution-tree">
      <EvolutionBranch node={root} resolvePokemonName={resolvePokemonName} onSelectPokemon={onSelectPokemon} />
    </ul>
  );
}
