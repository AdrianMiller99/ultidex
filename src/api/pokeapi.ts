import { GENERATIONS, generationNameToNumber, VERSION_GROUPS_BY_GENERATION } from "../constants/pokemon";
import type {
  AbilityEffectChange,
  AbilitySearchResult,
  AbilityEntry,
  EvolutionNode,
  MovePastValue,
  MoveSearchResult,
  PokemonGenerationData,
  PokemonSourceData,
} from "../types/pokemon";
import { canonicalizePokemonIdentifier } from "../utils/format";

const API_BASE = "https://pokeapi.co/api/v2";
const SPECIES_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const MOVE_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv";
const ABILITY_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/ability_names.csv";

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
  name: string;
  generation: NamedAPIResource;
  effect_entries: Array<{
    effect: string;
    short_effect: string;
    language: NamedAPIResource;
  }>;
  effect_changes: Array<{
    effect_entries: Array<{
      effect: string;
      short_effect: string;
      language: NamedAPIResource;
    }>;
    version_group: NamedAPIResource;
  }>;
}

interface RawMoveResponse {
  name: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  effect_chance?: number | null;
  damage_class: NamedAPIResource;
  type: NamedAPIResource;
  effect_entries?: Array<{
    effect: string;
    short_effect: string;
    language: NamedAPIResource;
  }>;
  past_values?: Array<{
    accuracy: number | null;
    effect_chance: number | null;
    effect_entries: Array<{
      effect: string;
      short_effect: string;
      language: NamedAPIResource;
    }>;
    power: number | null;
    pp: number | null;
    type: NamedAPIResource | null;
    version_group: NamedAPIResource;
  }>;
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
  pastValues: MovePastValue[];
}

interface SpeciesEvolutionInfo {
  generation: number;
  varieties: string[];
}

interface LocalPokemonLookupIndex {
  names: Record<string, true>;
  idToName: Record<string, string>;
  speciesIdToDefaultName: Record<string, string>;
  localizedToIds: Record<string, number[]>;
  normalizedLocalizedToIds: Record<string, number[]>;
}

interface LocalNamedResourceLookupIndex {
  names: Record<string, true>;
  idToName: Record<string, string>;
  localizedToIds: Record<string, number[]>;
  normalizedLocalizedToIds: Record<string, number[]>;
}

const moveMetadataCache = new Map<string, MoveMetadata>();
const localizedNameToSpeciesIds = new Map<string, number[]>();
const normalizedLocalizedNameToSpeciesIds = new Map<string, number[]>();
let localizedNameIndexPromise: Promise<void> | null = null;
const localizedMoveNameToMoveIds = new Map<string, number[]>();
const normalizedLocalizedMoveNameToMoveIds = new Map<string, number[]>();
let localizedMoveNameIndexPromise: Promise<void> | null = null;
const localizedAbilityNameToAbilityIds = new Map<string, number[]>();
const normalizedLocalizedAbilityNameToAbilityIds = new Map<string, number[]>();
let localizedAbilityNameIndexPromise: Promise<void> | null = null;
const localJsonCache = new Map<string, Promise<unknown | null>>();
let localPokemonLookupPromise: Promise<LocalPokemonLookupIndex | null> | null = null;
let localMoveLookupPromise: Promise<LocalNamedResourceLookupIndex | null> | null = null;
let localAbilityLookupPromise: Promise<LocalNamedResourceLookupIndex | null> | null = null;
const EXCLUDED_LOCALIZED_NAME_LANGUAGE_IDS = new Set([2]);
const LEGACY_SPECIAL_TYPES = new Set(["fire", "water", "grass", "electric", "ice", "psychic", "dragon", "dark"]);
const LOCAL_DATA_BASE = "/data";
const LOCAL_POKEMON_LOOKUP_PATH = `${LOCAL_DATA_BASE}/index/pokemon-lookup.json`;
const LOCAL_MOVE_LOOKUP_PATH = `${LOCAL_DATA_BASE}/index/move-lookup.json`;
const LOCAL_ABILITY_LOOKUP_PATH = `${LOCAL_DATA_BASE}/index/ability-lookup.json`;

const VERSION_GROUP_ORDER = GENERATIONS.flatMap((generation) => generation.versionGroups).reduce(
  (acc, versionGroup, index) => {
    acc.set(versionGroup, index);
    return acc;
  },
  new Map<string, number>()
);

async function fetchJson<T>(pathOrUrl: string, notFoundMessage = "Pokemon not found."): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(notFoundMessage);
    }
    throw new Error("Could not load data from PokeAPI.");
  }

  return (await response.json()) as T;
}

async function fetchLocalJson<T>(path: string): Promise<T | null> {
  const cachedPromise = localJsonCache.get(path) as Promise<T | null> | undefined;
  if (cachedPromise) {
    return cachedPromise;
  }

  const promise = (async () => {
    const response = await fetch(path);
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Could not load local data.");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return null;
    }

    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  })();

  localJsonCache.set(path, promise as Promise<unknown | null>);
  return promise;
}

function resolveSmallestIdFromMapRecord(map: Record<string, number[]>, key: string): number | null {
  const ids = map[key];
  if (!ids || ids.length === 0) {
    return null;
  }

  return Math.min(...ids);
}

async function ensureLocalPokemonLookup(): Promise<LocalPokemonLookupIndex | null> {
  if (!localPokemonLookupPromise) {
    localPokemonLookupPromise = fetchLocalJson<LocalPokemonLookupIndex>(LOCAL_POKEMON_LOOKUP_PATH);
  }

  return localPokemonLookupPromise;
}

async function ensureLocalMoveLookup(): Promise<LocalNamedResourceLookupIndex | null> {
  if (!localMoveLookupPromise) {
    localMoveLookupPromise = fetchLocalJson<LocalNamedResourceLookupIndex>(LOCAL_MOVE_LOOKUP_PATH);
  }

  return localMoveLookupPromise;
}

async function ensureLocalAbilityLookup(): Promise<LocalNamedResourceLookupIndex | null> {
  if (!localAbilityLookupPromise) {
    localAbilityLookupPromise = fetchLocalJson<LocalNamedResourceLookupIndex>(LOCAL_ABILITY_LOOKUP_PATH);
  }

  return localAbilityLookupPromise;
}

function resolveNamedResourceNameFromLookup(
  query: string,
  canonicalIdentifier: string,
  lookup: LocalNamedResourceLookupIndex
): string | null {
  if (lookup.idToName[canonicalIdentifier]) {
    return lookup.idToName[canonicalIdentifier];
  }

  if (lookup.names[canonicalIdentifier]) {
    return canonicalIdentifier;
  }

  const directLocalizedId = resolveSmallestIdFromMapRecord(lookup.localizedToIds, query.toLowerCase());
  if (directLocalizedId) {
    const resolved = lookup.idToName[String(directLocalizedId)];
    if (resolved) {
      return resolved;
    }
  }

  const normalizedLocalizedId = resolveSmallestIdFromMapRecord(lookup.normalizedLocalizedToIds, normalizeLocalizedName(query));
  if (normalizedLocalizedId) {
    const resolved = lookup.idToName[String(normalizedLocalizedId)];
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolvePokemonNameFromLookup(query: string, canonicalIdentifier: string, lookup: LocalPokemonLookupIndex): string | null {
  if (lookup.idToName[canonicalIdentifier]) {
    return lookup.idToName[canonicalIdentifier];
  }

  if (lookup.names[canonicalIdentifier]) {
    return canonicalIdentifier;
  }

  const directLocalizedId = resolveSmallestIdFromMapRecord(lookup.localizedToIds, query.toLowerCase());
  if (directLocalizedId) {
    const resolved = lookup.speciesIdToDefaultName[String(directLocalizedId)];
    if (resolved) {
      return resolved;
    }
  }

  const normalizedLocalizedId = resolveSmallestIdFromMapRecord(lookup.normalizedLocalizedToIds, normalizeLocalizedName(query));
  if (normalizedLocalizedId) {
    const resolved = lookup.speciesIdToDefaultName[String(normalizedLocalizedId)];
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function loadLocalPokemonSource(nameOrId: string): Promise<PokemonSourceData | null> {
  const canonicalIdentifier = canonicalizePokemonIdentifier(nameOrId);
  if (!canonicalIdentifier) {
    return null;
  }

  if (!/^\d+$/.test(canonicalIdentifier)) {
    const direct = await fetchLocalJson<PokemonSourceData>(
      `${LOCAL_DATA_BASE}/pokemon/${encodeURIComponent(canonicalIdentifier)}.json`
    );
    if (direct) {
      return direct;
    }
  }

  const lookup = await ensureLocalPokemonLookup();
  if (!lookup) {
    return null;
  }

  const resolvedPokemonName = resolvePokemonNameFromLookup(nameOrId.trim(), canonicalIdentifier, lookup);
  if (!resolvedPokemonName) {
    return null;
  }

  return fetchLocalJson<PokemonSourceData>(`${LOCAL_DATA_BASE}/pokemon/${encodeURIComponent(resolvedPokemonName)}.json`);
}

async function loadLocalMoveByIdentifier(nameOrId: string): Promise<RawMoveResponse | null> {
  const canonicalIdentifier = normalizeNamedResourceInput(nameOrId);
  if (!canonicalIdentifier) {
    return null;
  }

  if (!/^\d+$/.test(canonicalIdentifier)) {
    const direct = await fetchLocalJson<RawMoveResponse>(`${LOCAL_DATA_BASE}/moves/${encodeURIComponent(canonicalIdentifier)}.json`);
    if (direct) {
      return direct;
    }
  }

  const lookup = await ensureLocalMoveLookup();
  if (!lookup) {
    return null;
  }

  const resolvedMoveName = resolveNamedResourceNameFromLookup(nameOrId.trim(), canonicalIdentifier, lookup);
  if (!resolvedMoveName) {
    return null;
  }

  return fetchLocalJson<RawMoveResponse>(`${LOCAL_DATA_BASE}/moves/${encodeURIComponent(resolvedMoveName)}.json`);
}

async function loadLocalAbilityByIdentifier(nameOrId: string): Promise<RawAbilityResponse | null> {
  const canonicalIdentifier = normalizeNamedResourceInput(nameOrId);
  if (!canonicalIdentifier) {
    return null;
  }

  if (!/^\d+$/.test(canonicalIdentifier)) {
    const direct = await fetchLocalJson<RawAbilityResponse>(
      `${LOCAL_DATA_BASE}/abilities/${encodeURIComponent(canonicalIdentifier)}.json`
    );
    if (direct) {
      return direct;
    }
  }

  const lookup = await ensureLocalAbilityLookup();
  if (!lookup) {
    return null;
  }

  const resolvedAbilityName = resolveNamedResourceNameFromLookup(nameOrId.trim(), canonicalIdentifier, lookup);
  if (!resolvedAbilityName) {
    return null;
  }

  return fetchLocalJson<RawAbilityResponse>(`${LOCAL_DATA_BASE}/abilities/${encodeURIComponent(resolvedAbilityName)}.json`);
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

function normalizeLocalizedName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u2640/g, "female")
    .replace(/\u2642/g, "male")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function addLocalizedIdToAliasMap(map: Map<string, number[]>, alias: string, id: number): void {
  if (!alias) {
    return;
  }

  const existing = map.get(alias);
  if (!existing) {
    map.set(alias, [id]);
    return;
  }

  if (!existing.includes(id)) {
    existing.push(id);
  }
}

async function loadLocalizedIdIndex(
  csvUrl: string,
  idToAliasMap: Map<string, number[]>,
  normalizedAliasToIdMap: Map<string, number[]>
): Promise<void> {
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error("Could not load multilingual names.");
  }

  const csv = await response.text();
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);

  for (let index = 1; index < lines.length; index += 1) {
    const fields = parseCsvLine(lines[index]);
    if (fields.length < 3) {
      continue;
    }

    const entityId = Number(fields[0]);
    const languageId = Number(fields[1]);
    const localizedName = fields[2]?.trim();

    if (!Number.isFinite(entityId) || !Number.isFinite(languageId) || !localizedName) {
      continue;
    }

    if (EXCLUDED_LOCALIZED_NAME_LANGUAGE_IDS.has(languageId)) {
      continue;
    }

    const lowerAlias = localizedName.toLowerCase();
    addLocalizedIdToAliasMap(idToAliasMap, lowerAlias, entityId);
    addLocalizedIdToAliasMap(normalizedAliasToIdMap, normalizeLocalizedName(localizedName), entityId);
  }
}

async function ensureLocalizedPokemonNameIndex(): Promise<void> {
  if (localizedNameToSpeciesIds.size > 0 || normalizedLocalizedNameToSpeciesIds.size > 0) {
    return;
  }

  if (!localizedNameIndexPromise) {
    localizedNameIndexPromise = (async () => {
      await loadLocalizedIdIndex(SPECIES_NAMES_CSV_URL, localizedNameToSpeciesIds, normalizedLocalizedNameToSpeciesIds);
    })();
  }

  await localizedNameIndexPromise;
}

async function resolveSpeciesIdFromLocalizedName(query: string): Promise<number | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const localLookup = await ensureLocalPokemonLookup();
  if (localLookup) {
    const localDirect = resolveSmallestIdFromMapRecord(localLookup.localizedToIds, trimmed.toLowerCase());
    if (localDirect) {
      return localDirect;
    }

    const localNormalized = resolveSmallestIdFromMapRecord(localLookup.normalizedLocalizedToIds, normalizeLocalizedName(trimmed));
    if (localNormalized) {
      return localNormalized;
    }
  }

  await ensureLocalizedPokemonNameIndex();

  const direct = localizedNameToSpeciesIds.get(trimmed.toLowerCase());
  if (direct && direct.length > 0) {
    return Math.min(...direct);
  }

  const normalized = normalizeLocalizedName(trimmed);
  const normalizedMatch = normalizedLocalizedNameToSpeciesIds.get(normalized);
  if (normalizedMatch && normalizedMatch.length > 0) {
    return Math.min(...normalizedMatch);
  }

  return null;
}

async function ensureLocalizedMoveNameIndex(): Promise<void> {
  if (localizedMoveNameToMoveIds.size > 0 || normalizedLocalizedMoveNameToMoveIds.size > 0) {
    return;
  }

  if (!localizedMoveNameIndexPromise) {
    localizedMoveNameIndexPromise = (async () => {
      await loadLocalizedIdIndex(MOVE_NAMES_CSV_URL, localizedMoveNameToMoveIds, normalizedLocalizedMoveNameToMoveIds);
    })();
  }

  await localizedMoveNameIndexPromise;
}

async function resolveMoveIdFromLocalizedName(query: string): Promise<number | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const localLookup = await ensureLocalMoveLookup();
  if (localLookup) {
    const localDirect = resolveSmallestIdFromMapRecord(localLookup.localizedToIds, trimmed.toLowerCase());
    if (localDirect) {
      return localDirect;
    }

    const localNormalized = resolveSmallestIdFromMapRecord(localLookup.normalizedLocalizedToIds, normalizeLocalizedName(trimmed));
    if (localNormalized) {
      return localNormalized;
    }
  }

  await ensureLocalizedMoveNameIndex();

  const direct = localizedMoveNameToMoveIds.get(trimmed.toLowerCase());
  if (direct && direct.length > 0) {
    return Math.min(...direct);
  }

  const normalized = normalizeLocalizedName(trimmed);
  const normalizedMatch = normalizedLocalizedMoveNameToMoveIds.get(normalized);
  if (normalizedMatch && normalizedMatch.length > 0) {
    return Math.min(...normalizedMatch);
  }

  return null;
}

async function ensureLocalizedAbilityNameIndex(): Promise<void> {
  if (localizedAbilityNameToAbilityIds.size > 0 || normalizedLocalizedAbilityNameToAbilityIds.size > 0) {
    return;
  }

  if (!localizedAbilityNameIndexPromise) {
    localizedAbilityNameIndexPromise = (async () => {
      await loadLocalizedIdIndex(
        ABILITY_NAMES_CSV_URL,
        localizedAbilityNameToAbilityIds,
        normalizedLocalizedAbilityNameToAbilityIds
      );
    })();
  }

  await localizedAbilityNameIndexPromise;
}

async function resolveAbilityIdFromLocalizedName(query: string): Promise<number | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const localLookup = await ensureLocalAbilityLookup();
  if (localLookup) {
    const localDirect = resolveSmallestIdFromMapRecord(localLookup.localizedToIds, trimmed.toLowerCase());
    if (localDirect) {
      return localDirect;
    }

    const localNormalized = resolveSmallestIdFromMapRecord(localLookup.normalizedLocalizedToIds, normalizeLocalizedName(trimmed));
    if (localNormalized) {
      return localNormalized;
    }
  }

  await ensureLocalizedAbilityNameIndex();

  const direct = localizedAbilityNameToAbilityIds.get(trimmed.toLowerCase());
  if (direct && direct.length > 0) {
    return Math.min(...direct);
  }

  const normalized = normalizeLocalizedName(trimmed);
  const normalizedMatch = normalizedLocalizedAbilityNameToAbilityIds.get(normalized);
  if (normalizedMatch && normalizedMatch.length > 0) {
    return Math.min(...normalizedMatch);
  }

  return null;
}

function isPokemonNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === "Pokemon not found.";
}

function isMoveNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === "Attack not found.";
}

function isAbilityNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === "Ability not found.";
}

function getVersionGroupOrder(versionGroup: string): number | null {
  const order = VERSION_GROUP_ORDER.get(versionGroup);
  return typeof order === "number" ? order : null;
}

function getRepresentativeVersionGroup(generation: number): string | null {
  const groups = VERSION_GROUPS_BY_GENERATION[generation];
  if (!groups || groups.length === 0) {
    return null;
  }
  return groups[groups.length - 1] ?? null;
}

function getRepresentativeVersionGroupOrder(generation: number): number | null {
  const representativeVersionGroup = getRepresentativeVersionGroup(generation);
  if (!representativeVersionGroup) {
    return null;
  }
  return getVersionGroupOrder(representativeVersionGroup);
}

function resolveMoveCategoryForGeneration(category: string, type: string, generation: number): string {
  if (category === "status") {
    return "status";
  }

  if (generation <= 3) {
    return LEGACY_SPECIAL_TYPES.has(type) ? "special" : "physical";
  }

  return category;
}

function resolveArtwork(pokemon: RawPokemonResponse): { image: string; shinyImage: string } {
  const official = pokemon.sprites.other?.["official-artwork"];
  const image = official?.front_default ?? pokemon.sprites.front_default ?? "";
  const shinyImage = official?.front_shiny ?? pokemon.sprites.front_shiny ?? image;
  return { image, shinyImage };
}

function extractEnglishDescription(
  effectEntries: Array<{
    effect: string;
    short_effect: string;
    language: NamedAPIResource;
  }>,
  effectChance?: number | null
): string {
  const englishEffect = effectEntries.find((entry) => entry.language.name === "en");
  const rawDescription = englishEffect?.short_effect ?? englishEffect?.effect;
  if (!rawDescription) {
    return "No description available.";
  }

  const compactDescription = rawDescription.replace(/\s+/g, " ").trim();
  if (effectChance === null || effectChance === undefined) {
    return compactDescription.replace(/\$effect_chance/g, "");
  }

  return compactDescription.replace(/\$effect_chance/g, String(effectChance));
}

function extractEnglishDescriptionOrNull(
  effectEntries: Array<{
    effect: string;
    short_effect: string;
    language: NamedAPIResource;
  }>,
  effectChance?: number | null
): string | null {
  const englishEffect = effectEntries.find((entry) => entry.language.name === "en");
  const rawDescription = englishEffect?.short_effect ?? englishEffect?.effect;
  if (!rawDescription) {
    return null;
  }

  return extractEnglishDescription(effectEntries, effectChance);
}

function resolveMoveValuesForGeneration(
  currentValues: {
    type: string;
    category: string;
    power: number | null;
    accuracy: number | null;
    pp: number | null;
  },
  pastValues: MovePastValue[],
  generation: number
): {
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
} {
  const targetOrder = getRepresentativeVersionGroupOrder(generation);
  if (targetOrder === null || pastValues.length === 0) {
    return {
      ...currentValues,
      category: resolveMoveCategoryForGeneration(currentValues.category, currentValues.type, generation),
    };
  }

  const resolved = { ...currentValues };
  const sortedPastValues = [...pastValues].sort((a, b) => {
    const orderA = getVersionGroupOrder(a.versionGroup);
    const orderB = getVersionGroupOrder(b.versionGroup);
    if (orderA === null && orderB === null) {
      return 0;
    }
    if (orderA === null) {
      return 1;
    }
    if (orderB === null) {
      return -1;
    }
    return orderB - orderA;
  });

  for (const pastValue of sortedPastValues) {
    const changeOrder = getVersionGroupOrder(pastValue.versionGroup);
    if (changeOrder === null || targetOrder >= changeOrder) {
      continue;
    }

    if (pastValue.type) {
      resolved.type = pastValue.type;
    }
    if (pastValue.power !== null) {
      resolved.power = pastValue.power;
    }
    if (pastValue.accuracy !== null) {
      resolved.accuracy = pastValue.accuracy;
    }
    if (pastValue.pp !== null) {
      resolved.pp = pastValue.pp;
    }
  }

  resolved.category = resolveMoveCategoryForGeneration(resolved.category, resolved.type, generation);
  return resolved;
}

function resolveMoveDescriptionForGeneration(moveData: RawMoveResponse, generation: number): string {
  const targetOrder = getRepresentativeVersionGroupOrder(generation);
  const currentDescription = moveData.effect_entries
    ? extractEnglishDescription(moveData.effect_entries, moveData.effect_chance)
    : "No description available.";

  if (targetOrder === null || !moveData.past_values || moveData.past_values.length === 0) {
    return currentDescription;
  }

  let description = currentDescription;
  const sortedPastValues = [...moveData.past_values].sort((a, b) => {
    const orderA = getVersionGroupOrder(a.version_group.name);
    const orderB = getVersionGroupOrder(b.version_group.name);
    if (orderA === null && orderB === null) {
      return 0;
    }
    if (orderA === null) {
      return 1;
    }
    if (orderB === null) {
      return -1;
    }
    return orderB - orderA;
  });

  for (const pastValue of sortedPastValues) {
    const changeOrder = getVersionGroupOrder(pastValue.version_group.name);
    if (changeOrder === null || targetOrder >= changeOrder) {
      continue;
    }

    if (pastValue.effect_entries && pastValue.effect_entries.length > 0) {
      const changeDescription = extractEnglishDescriptionOrNull(
        pastValue.effect_entries,
        pastValue.effect_chance === null ? undefined : pastValue.effect_chance
      );
      if (changeDescription) {
        description = changeDescription;
      }
    }
  }

  return description;
}

function resolveAbilityDescriptionForGeneration(
  currentDescription: string,
  effectChanges: AbilityEffectChange[],
  generation: number
): string {
  const targetOrder = getRepresentativeVersionGroupOrder(generation);
  if (targetOrder === null || effectChanges.length === 0) {
    return currentDescription;
  }

  let description = currentDescription;
  const sortedChanges = [...effectChanges].sort((a, b) => {
    const orderA = getVersionGroupOrder(a.versionGroup);
    const orderB = getVersionGroupOrder(b.versionGroup);
    if (orderA === null && orderB === null) {
      return 0;
    }
    if (orderA === null) {
      return 1;
    }
    if (orderB === null) {
      return -1;
    }
    return orderB - orderA;
  });

  for (const change of sortedChanges) {
    const changeOrder = getVersionGroupOrder(change.versionGroup);
    if (changeOrder === null || targetOrder >= changeOrder || !change.description) {
      continue;
    }
    description = change.description;
  }

  return description;
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
      const description = extractEnglishDescription(abilityData.effect_entries);
      const effectChanges: AbilityEffectChange[] = abilityData.effect_changes
        .map((change) => {
          const changeDescription = extractEnglishDescriptionOrNull(change.effect_entries);
          if (!changeDescription) {
            return null;
          }
          return {
            versionGroup: change.version_group.name,
            description: changeDescription,
          };
        })
        .filter((change): change is AbilityEffectChange => change !== null);

      return {
        name: ability.ability.name,
        hidden: ability.is_hidden,
        introducedIn: generationNameToNumber(abilityData.generation.name),
        description,
        effectChanges,
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
    pastValues: (moveData.past_values ?? []).map((pastValue) => ({
      versionGroup: pastValue.version_group.name,
      type: pastValue.type?.name ?? null,
      power: pastValue.power,
      accuracy: pastValue.accuracy,
      pp: pastValue.pp,
    })),
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
      pastValues: movesMetadata[entry.move.name]?.pastValues ?? [],
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
  const localSource = await loadLocalPokemonSource(nameOrId);
  if (localSource) {
    return localSource;
  }

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

function normalizeNamedResourceInput(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

async function loadMoveByIdentifier(nameOrId: string): Promise<RawMoveResponse> {
  const localMove = await loadLocalMoveByIdentifier(nameOrId);
  if (localMove) {
    return localMove;
  }

  const canonicalIdentifier = normalizeNamedResourceInput(nameOrId);

  try {
    return await fetchJson<RawMoveResponse>(`/move/${canonicalIdentifier}`, "Attack not found.");
  } catch (error) {
    if (!isMoveNotFoundError(error)) {
      throw error;
    }
  }

  const resolvedMoveId = await resolveMoveIdFromLocalizedName(nameOrId);
  if (!resolvedMoveId || String(resolvedMoveId) === canonicalIdentifier) {
    throw new Error("Attack not found.");
  }

  return fetchJson<RawMoveResponse>(`/move/${resolvedMoveId}`, "Attack not found.");
}

async function loadAbilityByIdentifier(nameOrId: string): Promise<RawAbilityResponse> {
  const localAbility = await loadLocalAbilityByIdentifier(nameOrId);
  if (localAbility) {
    return localAbility;
  }

  const canonicalIdentifier = normalizeNamedResourceInput(nameOrId);

  try {
    return await fetchJson<RawAbilityResponse>(`/ability/${canonicalIdentifier}`, "Ability not found.");
  } catch (error) {
    if (!isAbilityNotFoundError(error)) {
      throw error;
    }
  }

  const resolvedAbilityId = await resolveAbilityIdFromLocalizedName(nameOrId);
  if (!resolvedAbilityId || String(resolvedAbilityId) === canonicalIdentifier) {
    throw new Error("Ability not found.");
  }

  return fetchJson<RawAbilityResponse>(`/ability/${resolvedAbilityId}`, "Ability not found.");
}

async function resolvePokemonIdentifierForSearch(nameOrId: string): Promise<string | null> {
  const canonicalIdentifier = canonicalizePokemonIdentifier(nameOrId);
  if (!canonicalIdentifier) {
    return null;
  }

  const localLookup = await ensureLocalPokemonLookup();
  if (localLookup) {
    const localName = resolvePokemonNameFromLookup(nameOrId.trim(), canonicalIdentifier, localLookup);
    if (localName) {
      return localName;
    }
  }

  try {
    const pokemon = await fetchJson<RawPokemonResponse>(`/pokemon/${canonicalIdentifier}`, "Pokemon not found.");
    return pokemon.name;
  } catch (error) {
    if (!isPokemonNotFoundError(error)) {
      throw error;
    }
  }

  const resolvedSpeciesId = await resolveSpeciesIdFromLocalizedName(nameOrId);
  if (!resolvedSpeciesId) {
    return null;
  }

  const pokemon = await fetchJson<RawPokemonResponse>(`/pokemon/${resolvedSpeciesId}`, "Pokemon not found.");
  return pokemon.name;
}

async function resolveMoveIdentifierForSearch(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const canonicalIdentifier = normalizeNamedResourceInput(trimmed);
  const localLookup = await ensureLocalMoveLookup();
  if (localLookup) {
    const localMoveName = resolveNamedResourceNameFromLookup(trimmed, canonicalIdentifier, localLookup);
    if (localMoveName) {
      return localMoveName;
    }
  }

  try {
    const moveData = await loadMoveByIdentifier(name);
    return moveData.name;
  } catch (error) {
    if (!isMoveNotFoundError(error)) {
      throw error;
    }
    return null;
  }
}

async function resolveAbilityIdentifierForSearch(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const canonicalIdentifier = normalizeNamedResourceInput(trimmed);
  const localLookup = await ensureLocalAbilityLookup();
  if (localLookup) {
    const localAbilityName = resolveNamedResourceNameFromLookup(trimmed, canonicalIdentifier, localLookup);
    if (localAbilityName) {
      return localAbilityName;
    }
  }

  try {
    const abilityData = await loadAbilityByIdentifier(name);
    return abilityData.name;
  } catch (error) {
    if (!isAbilityNotFoundError(error)) {
      throw error;
    }
    return null;
  }
}

export async function resolveSearchPath(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const [localPokemonLookup, localMoveLookup, localAbilityLookup] = await Promise.all([
    ensureLocalPokemonLookup(),
    ensureLocalMoveLookup(),
    ensureLocalAbilityLookup(),
  ]);
  const canonicalPokemonIdentifier = canonicalizePokemonIdentifier(trimmed);
  const canonicalNamedIdentifier = normalizeNamedResourceInput(trimmed);

  if (canonicalPokemonIdentifier && localPokemonLookup) {
    const localPokemonName = resolvePokemonNameFromLookup(trimmed, canonicalPokemonIdentifier, localPokemonLookup);
    if (localPokemonName) {
      return `/pokemon/${encodeURIComponent(localPokemonName)}`;
    }
  }

  if (canonicalNamedIdentifier && localMoveLookup) {
    const localMoveName = resolveNamedResourceNameFromLookup(trimmed, canonicalNamedIdentifier, localMoveLookup);
    if (localMoveName) {
      return `/moves/${encodeURIComponent(localMoveName)}`;
    }
  }

  if (canonicalNamedIdentifier && localAbilityLookup) {
    const localAbilityName = resolveNamedResourceNameFromLookup(trimmed, canonicalNamedIdentifier, localAbilityLookup);
    if (localAbilityName) {
      return `/abilities/${encodeURIComponent(localAbilityName)}`;
    }
  }

  const pokemonName = await resolvePokemonIdentifierForSearch(trimmed);
  if (pokemonName) {
    return `/pokemon/${encodeURIComponent(pokemonName)}`;
  }

  const moveName = await resolveMoveIdentifierForSearch(trimmed);
  if (moveName) {
    return `/moves/${encodeURIComponent(moveName)}`;
  }

  const abilityName = await resolveAbilityIdentifierForSearch(trimmed);
  if (abilityName) {
    return `/abilities/${encodeURIComponent(abilityName)}`;
  }

  return null;
}

export async function loadMoveSearchResult(name: string, generation: number): Promise<MoveSearchResult> {
  const moveData = await loadMoveByIdentifier(name);
  const values = resolveMoveValuesForGeneration(
    {
      type: moveData.type.name,
      category: moveData.damage_class.name,
      power: moveData.power,
      accuracy: moveData.accuracy,
      pp: moveData.pp,
    },
    (moveData.past_values ?? []).map((pastValue) => ({
      versionGroup: pastValue.version_group.name,
      type: pastValue.type?.name ?? null,
      power: pastValue.power,
      accuracy: pastValue.accuracy,
      pp: pastValue.pp,
    })),
    generation
  );

  return {
    kind: "move",
    name: moveData.name,
    description: resolveMoveDescriptionForGeneration(moveData, generation),
    power: values.power,
    accuracy: values.accuracy,
    pp: values.pp,
    category: values.category,
  };
}

export async function loadAbilitySearchResult(name: string, generation: number): Promise<AbilitySearchResult> {
  const abilityData = await loadAbilityByIdentifier(name);
  const currentDescription = extractEnglishDescription(abilityData.effect_entries);
  const effectChanges: AbilityEffectChange[] = abilityData.effect_changes
    .map((change) => {
      const changeDescription = extractEnglishDescriptionOrNull(change.effect_entries);
      if (!changeDescription) {
        return null;
      }
      return {
        versionGroup: change.version_group.name,
        description: changeDescription,
      };
    })
    .filter((change): change is AbilityEffectChange => change !== null);

  return {
    kind: "ability",
    name: abilityData.name,
    description: resolveAbilityDescriptionForGeneration(currentDescription, effectChanges, generation),
  };
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
      const resolvedMoveValues = resolveMoveValuesForGeneration(
        {
          type: move.type,
          category: move.category,
          power: move.power,
          accuracy: move.accuracy,
          pp: move.pp,
        },
        move.pastValues,
        generation
      );

      return {
        name: move.name,
        level: levelValue,
        type: resolvedMoveValues.type,
        category: resolvedMoveValues.category,
        power: resolvedMoveValues.power,
        accuracy: resolvedMoveValues.accuracy,
        pp: resolvedMoveValues.pp,
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

  const abilities = source.abilities
    .filter((ability) => ability.introducedIn <= generation)
    .map((ability) => ({
      ...ability,
      description: resolveAbilityDescriptionForGeneration(ability.description, ability.effectChanges, generation),
    }));

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
