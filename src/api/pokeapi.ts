import { generationNameToNumber, VERSION_GROUPS_BY_GENERATION } from "../constants/pokemon";
import type {
  AbilityEntry,
  EvolutionNode,
  PokemonGenerationData,
  PokemonSourceData,
} from "../types/pokemon";

const API_BASE = "https://pokeapi.co/api/v2";
const SPECIES_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";

interface NamedAPIResource {
  name: string;
  url: string;
}

interface RawPokemonResponse {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    front_shiny: string | null;
    other?: {
      [key: string]: {
        front_default?: string | null;
        front_shiny?: string | null;
      };
    };
  };
  types: Array<{ slot: number; type: NamedAPIResource }>;
  stats: Array<{ base_stat: number; stat: NamedAPIResource }>;
  abilities: Array<{ is_hidden: boolean; ability: NamedAPIResource }>;
  moves: Array<{
    move: NamedAPIResource;
    version_group_details: Array<{
      level_learned_at: number;
      move_learn_method: NamedAPIResource;
      version_group: NamedAPIResource;
    }>;
  }>;
  species: NamedAPIResource;
}

interface RawSpeciesResponse {
  generation: NamedAPIResource;
  evolution_chain: { url: string };
  varieties: Array<{
    is_default: boolean;
    pokemon: NamedAPIResource;
  }>;
}

interface RawAbilityResponse {
  generation: NamedAPIResource;
  effect_entries: Array<{
    effect: string;
    short_effect: string;
    language: NamedAPIResource;
  }>;
}

interface RawMoveResponse {
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  damage_class: NamedAPIResource;
  type: NamedAPIResource;
}

interface RawEvolutionChainResponse {
  chain: RawEvolutionNode;
}

interface RawEvolutionNode {
  species: NamedAPIResource;
  evolution_details: RawEvolutionDetail[];
  evolves_to: RawEvolutionNode[];
}

interface RawEvolutionDetail {
  trigger: NamedAPIResource | null;
  min_level: number | null;
  item: NamedAPIResource | null;
  held_item: NamedAPIResource | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  known_move_type: NamedAPIResource | null;
  location: NamedAPIResource | null;
  time_of_day: string;
}

interface MoveMetadata {
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
}

interface SpeciesEvolutionInfo {
  generation: number;
  varieties: string[];
}

const moveMetadataCache = new Map<string, MoveMetadata>();
const localizedNameToSpeciesIds = new Map<string, number[]>();
const normalizedLocalizedNameToSpeciesIds = new Map<string, number[]>();
let localizedNameIndexPromise: Promise<void> | null = null;

async function fetchJson<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Pokemon not found.");
    }
    throw new Error("Could not load data from PokeAPI.");
  }

  return (await response.json()) as T;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function normalizeLocalizedPokemonName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u2640/g, "female")
    .replace(/\u2642/g, "male")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function addSpeciesIdToAliasMap(map: Map<string, number[]>, alias: string, speciesId: number): void {
  if (!alias) {
    return;
  }

  const existing = map.get(alias);
  if (!existing) {
    map.set(alias, [speciesId]);
    return;
  }

  if (!existing.includes(speciesId)) {
    existing.push(speciesId);
  }
}

async function ensureLocalizedNameIndex(): Promise<void> {
  if (localizedNameToSpeciesIds.size > 0 || normalizedLocalizedNameToSpeciesIds.size > 0) {
    return;
  }

  if (!localizedNameIndexPromise) {
    localizedNameIndexPromise = (async () => {
      const response = await fetch(SPECIES_NAMES_CSV_URL);
      if (!response.ok) {
        throw new Error("Could not load multilingual Pokemon names.");
      }

      const csv = await response.text();
      const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);

      for (let index = 1; index < lines.length; index += 1) {
        const fields = parseCsvLine(lines[index]);
        if (fields.length < 3) {
          continue;
        }

        const speciesId = Number(fields[0]);
        const localizedName = fields[2]?.trim();

        if (!Number.isFinite(speciesId) || !localizedName) {
          continue;
        }

        const lowerAlias = localizedName.toLowerCase();
        addSpeciesIdToAliasMap(localizedNameToSpeciesIds, lowerAlias, speciesId);
        addSpeciesIdToAliasMap(normalizedLocalizedNameToSpeciesIds, normalizeLocalizedPokemonName(localizedName), speciesId);
      }
    })();
  }

  await localizedNameIndexPromise;
}

async function resolveSpeciesIdFromLocalizedName(query: string): Promise<number | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  await ensureLocalizedNameIndex();

  const direct = localizedNameToSpeciesIds.get(trimmed.toLowerCase());
  if (direct && direct.length > 0) {
    return Math.min(...direct);
  }

  const normalized = normalizeLocalizedPokemonName(trimmed);
  const normalizedMatch = normalizedLocalizedNameToSpeciesIds.get(normalized);
  if (normalizedMatch && normalizedMatch.length > 0) {
    return Math.min(...normalizedMatch);
  }

  return null;
}

function isPokemonNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === "Pokemon not found.";
}

function resolveArtwork(pokemon: RawPokemonResponse): { image: string; shinyImage: string } {
  const official = pokemon.sprites.other?.["official-artwork"];
  const image = official?.front_default ?? pokemon.sprites.front_default ?? "";
  const shinyImage = official?.front_shiny ?? pokemon.sprites.front_shiny ?? image;
  return { image, shinyImage };
}

function describeEvolution(detail: RawEvolutionDetail | undefined): string | null {
  if (!detail) {
    return null;
  }

  const parts: string[] = [];

  if (detail.min_level) {
    parts.push(`Lvl ${detail.min_level}`);
  }
  if (detail.item) {
    parts.push(`Use ${detail.item.name.replace(/-/g, " ")}`);
  }
  if (detail.held_item) {
    parts.push(`Hold ${detail.held_item.name.replace(/-/g, " ")}`);
  }
  if (detail.min_happiness) {
    parts.push(`Happiness ${detail.min_happiness}+`);
  }
  if (detail.min_beauty) {
    parts.push(`Beauty ${detail.min_beauty}+`);
  }
  if (detail.min_affection) {
    parts.push(`Affection ${detail.min_affection}+`);
  }
  if (detail.known_move_type) {
    parts.push(`Know ${detail.known_move_type.name} move`);
  }
  if (detail.location) {
    parts.push(`At ${detail.location.name.replace(/-/g, " ")}`);
  }
  if (detail.time_of_day) {
    parts.push(`Time: ${detail.time_of_day}`);
  }
  if (detail.trigger?.name === "trade") {
    parts.push("Trade");
  }

  return parts.length > 0 ? parts.join(" | ") : detail.trigger?.name ?? null;
}

function collectSpeciesNames(node: RawEvolutionNode, names: Set<string>): void {
  names.add(node.species.name);
  node.evolves_to.forEach((child) => collectSpeciesNames(child, names));
}

function buildEvolutionTree(
  node: RawEvolutionNode,
  speciesInfoByName: Record<string, SpeciesEvolutionInfo>,
  fromDetail?: RawEvolutionDetail
): EvolutionNode {
  const info = speciesInfoByName[node.species.name];

  return {
    name: node.species.name,
    generation: info?.generation ?? 1,
    condition: describeEvolution(fromDetail),
    varieties: info?.varieties ?? [node.species.name],
    children: node.evolves_to.map((child) => buildEvolutionTree(child, speciesInfoByName, child.evolution_details[0])),
  };
}

function filterEvolutionTree(node: EvolutionNode, generation: number): EvolutionNode | null {
  if (node.generation > generation) {
    return null;
  }

  const children = node.children
    .map((child) => filterEvolutionTree(child, generation))
    .filter((child): child is EvolutionNode => child !== null);

  return {
    ...node,
    children,
  };
}

async function loadSpeciesEvolutionInfo(speciesNames: string[]): Promise<Record<string, SpeciesEvolutionInfo>> {
  const pairs = await Promise.all(
    speciesNames.map(async (name) => {
      const species = await fetchJson<RawSpeciesResponse>(`/pokemon-species/${name}`);
      return [
        name,
        {
          generation: generationNameToNumber(species.generation.name),
          varieties: species.varieties.map((entry) => entry.pokemon.name),
        },
      ] as const;
    })
  );

  return pairs.reduce((acc, [name, info]) => {
    acc[name] = info;
    return acc;
  }, {} as Record<string, SpeciesEvolutionInfo>);
}

async function loadAbilities(
  abilities: Array<{ is_hidden: boolean; ability: NamedAPIResource }>
): Promise<AbilityEntry[]> {
  return Promise.all(
    abilities.map(async (ability) => {
      const abilityData = await fetchJson<RawAbilityResponse>(ability.ability.url);
      const englishEffect = abilityData.effect_entries.find((entry) => entry.language.name === "en");
      const description =
        englishEffect?.short_effect?.replace(/\s+/g, " ").trim() ??
        englishEffect?.effect?.replace(/\s+/g, " ").trim() ??
        "No description available.";

      return {
        name: ability.ability.name,
        hidden: ability.is_hidden,
        introducedIn: generationNameToNumber(abilityData.generation.name),
        description,
      };
    })
  );
}

async function loadMoveMetadata(move: NamedAPIResource): Promise<MoveMetadata> {
  const cached = moveMetadataCache.get(move.name);
  if (cached) {
    return cached;
  }

  const moveData = await fetchJson<RawMoveResponse>(move.url);
  const metadata: MoveMetadata = {
    type: moveData.type.name,
    category: moveData.damage_class.name,
    power: moveData.power,
    accuracy: moveData.accuracy,
    pp: moveData.pp,
  };

  moveMetadataCache.set(move.name, metadata);
  return metadata;
}

async function loadMovesMetadata(moves: NamedAPIResource[]): Promise<Record<string, MoveMetadata>> {
  const uniqueMoves = new Map<string, NamedAPIResource>();
  moves.forEach((move) => uniqueMoves.set(move.name, move));

  const moveEntries = await Promise.all(
    [...uniqueMoves.values()].map(async (move) => [move.name, await loadMoveMetadata(move)] as const)
  );

  return moveEntries.reduce(
    (acc, [name, metadata]) => {
      acc[name] = metadata;
      return acc;
    },
    {} as Record<string, MoveMetadata>
  );
}

async function loadPokemonSourceByIdentifier(nameOrId: string): Promise<PokemonSourceData> {
  const pokemon = await fetchJson<RawPokemonResponse>(`/pokemon/${nameOrId.toLowerCase()}`);
  const species = await fetchJson<RawSpeciesResponse>(pokemon.species.url);
  const evolutionChain = await fetchJson<RawEvolutionChainResponse>(species.evolution_chain.url);

  const [abilities, speciesInfoByName, movesMetadata] = await Promise.all([
    loadAbilities(pokemon.abilities),
    (async () => {
      const speciesNames = new Set<string>();
      collectSpeciesNames(evolutionChain.chain, speciesNames);
      return loadSpeciesEvolutionInfo([...speciesNames]);
    })(),
    loadMovesMetadata(pokemon.moves.map((entry) => entry.move)),
  ]);

  const types = pokemon.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name);

  const stats = pokemon.stats.map((entry) => ({
    name: entry.stat.name,
    value: entry.base_stat,
  }));

  const moves = pokemon.moves
    .map((entry) => ({
      name: entry.move.name,
      details: entry.version_group_details.map((detail) => ({
        level: detail.level_learned_at,
        method: detail.move_learn_method.name,
        versionGroup: detail.version_group.name,
      })),
      type: movesMetadata[entry.move.name]?.type ?? "unknown",
      category: movesMetadata[entry.move.name]?.category ?? "status",
      power: movesMetadata[entry.move.name]?.power ?? null,
      accuracy: movesMetadata[entry.move.name]?.accuracy ?? null,
      pp: movesMetadata[entry.move.name]?.pp ?? null,
    }))
    .filter((entry) => entry.details.length > 0);

  const artwork = resolveArtwork(pokemon);

  return {
    id: pokemon.id,
    name: pokemon.name,
    image: artwork.image,
    shinyImage: artwork.shinyImage,
    types,
    stats,
    statTotal: stats.reduce((total, stat) => total + stat.value, 0),
    introducedGeneration: generationNameToNumber(species.generation.name),
    abilities,
    moves,
    evolutionRoot: buildEvolutionTree(evolutionChain.chain, speciesInfoByName),
    alternativeForms: species.varieties
      .filter((entry) => !entry.is_default)
      .map((entry) => ({ name: entry.pokemon.name })),
  };
}

export async function loadPokemonSource(nameOrId: string): Promise<PokemonSourceData> {
  const canonicalIdentifier = nameOrId.toLowerCase();

  try {
    return await loadPokemonSourceByIdentifier(canonicalIdentifier);
  } catch (error) {
    if (!isPokemonNotFoundError(error)) {
      throw error;
    }

    let resolvedSpeciesId: number | null = null;
    try {
      resolvedSpeciesId = await resolveSpeciesIdFromLocalizedName(nameOrId);
    } catch {
      throw error;
    }

    if (!resolvedSpeciesId || String(resolvedSpeciesId) === canonicalIdentifier) {
      throw error;
    }

    return loadPokemonSourceByIdentifier(String(resolvedSpeciesId));
  }
}

export function derivePokemonForGeneration(
  source: PokemonSourceData,
  generation: number,
  moveMethod: "level-up" | "machine" = "level-up"
): PokemonGenerationData {
  const isAvailableInGeneration = source.introducedGeneration <= generation;

  if (!isAvailableInGeneration) {
    return {
      ...source,
      isAvailableInGeneration,
      abilities: [],
      moves: [],
      evolutionRoot: null,
    };
  }

  const allowedVersionGroups = new Set(VERSION_GROUPS_BY_GENERATION[generation] ?? []);

  const moves = source.moves
    .map((move) => {
      const matchedDetails = move.details.filter(
        (detail) => allowedVersionGroups.has(detail.versionGroup) && detail.method === moveMethod
      );

      if (matchedDetails.length === 0) {
        return null;
      }

      const minLevel = matchedDetails.reduce((lowest, detail) => Math.min(lowest, detail.level), Number.MAX_SAFE_INTEGER);
      const levelValue = minLevel === Number.MAX_SAFE_INTEGER || minLevel === 0 ? null : minLevel;

      return {
        name: move.name,
        level: levelValue,
        type: move.type,
        category: move.category,
        power: move.power,
        accuracy: move.accuracy,
        pp: move.pp,
      };
    })
    .filter((move): move is NonNullable<typeof move> => move !== null)
    .sort((a, b) => {
      if (moveMethod === "level-up") {
        const levelA = a.level ?? Number.MAX_SAFE_INTEGER;
        const levelB = b.level ?? Number.MAX_SAFE_INTEGER;

        if (levelA !== levelB) {
          return levelA - levelB;
        }
      }

      return a.name.localeCompare(b.name);
    });

  const abilities = source.abilities.filter((ability) => ability.introducedIn <= generation);

  const evolutionRoot = source.evolutionRoot ? filterEvolutionTree(source.evolutionRoot, generation) : null;

  return {
    ...source,
    isAvailableInGeneration,
    abilities,
    moves,
    evolutionRoot,
  };
}

export function countEvolutionNodes(root: EvolutionNode | null): number {
  if (!root) {
    return 0;
  }

  return 1 + root.children.reduce((total, child) => total + countEvolutionNodes(child), 0);
}

