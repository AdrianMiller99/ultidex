export interface BaseStat {
  name: string;
  value: number;
}

export interface MoveDetail {
  method: string;
  level: number;
  versionGroup: string;
}

export interface MovePastValue {
  versionGroup: string;
  type: string | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
}

export interface MoveSourceEntry {
  name: string;
  details: MoveDetail[];
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  pastValues: MovePastValue[];
}

export interface AbilityEffectChange {
  versionGroup: string;
  description: string;
}

export interface AbilityEntry {
  name: string;
  hidden: boolean;
  introducedIn: number;
  description: string;
  effectChanges: AbilityEffectChange[];
}

export interface AlternativeFormEntry {
  name: string;
}

export interface EvolutionNode {
  name: string;
  generation: number;
  condition: string | null;
  varieties: string[];
  children: EvolutionNode[];
}

export interface PokemonSourceData {
  id: number;
  name: string;
  image: string;
  shinyImage: string;
  types: string[];
  stats: BaseStat[];
  statTotal: number;
  introducedGeneration: number;
  abilities: AbilityEntry[];
  moves: MoveSourceEntry[];
  evolutionRoot: EvolutionNode | null;
  alternativeForms: AlternativeFormEntry[];
}

export interface PokemonMoveView {
  name: string;
  level: number | null;
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
}

export interface PokemonGenerationData {
  id: number;
  name: string;
  image: string;
  shinyImage: string;
  types: string[];
  stats: BaseStat[];
  statTotal: number;
  introducedGeneration: number;
  isAvailableInGeneration: boolean;
  abilities: AbilityEntry[];
  moves: PokemonMoveView[];
  evolutionRoot: EvolutionNode | null;
  alternativeForms: AlternativeFormEntry[];
}

export interface MoveSearchResult {
  kind: "move";
  name: string;
  description: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  category: string;
}

export interface AbilitySearchResult {
  kind: "ability";
  name: string;
  description: string;
}
