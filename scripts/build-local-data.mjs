#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://pokeapi.co/api/v2";
const SPECIES_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const MOVE_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv";
const ABILITY_NAMES_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/ability_names.csv";
const EXCLUDED_LOCALIZED_NAME_LANGUAGE_IDS = new Set([2]);

const GENERATION_NAME_TO_NUMBER = {
  "generation-i": 1,
  "generation-ii": 2,
  "generation-iii": 3,
  "generation-iv": 4,
  "generation-v": 5,
  "generation-vi": 6,
  "generation-vii": 7,
  "generation-viii": 8,
  "generation-ix": 9,
};

const OUTPUT_ROOT = path.resolve(process.cwd(), "public/data");
const OUTPUT_POKEMON_DIR = path.join(OUTPUT_ROOT, "pokemon");
const OUTPUT_MOVE_DIR = path.join(OUTPUT_ROOT, "moves");
const OUTPUT_ABILITY_DIR = path.join(OUTPUT_ROOT, "abilities");
const OUTPUT_INDEX_DIR = path.join(OUTPUT_ROOT, "index");
const CACHE_DIR = path.resolve(process.cwd(), ".cache/pokeapi-build");

function generationNameToNumber(name) {
  if (!name) {
    return 1;
  }
  return GENERATION_NAME_TO_NUMBER[name] ?? 1;
}

function parseArgs(argv) {
  const options = {
    limit: null,
    concurrency: 8,
    clean: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--limit must be a positive number.");
      }
      options.limit = Math.floor(value);
      i += 1;
      continue;
    }

    if (arg === "--concurrency") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--concurrency must be a positive number.");
      }
      options.concurrency = Math.floor(value);
      i += 1;
      continue;
    }

    if (arg === "--clean") {
      options.clean = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashKey(value) {
  return createHash("sha1").update(value).digest("hex");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url, responseType) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url);

    if (response.ok) {
      return responseType === "text" ? response.text() : response.json();
    }

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === maxAttempts) {
      throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
    }

    const backoff = attempt * 500;
    await sleep(backoff);
  }

  throw new Error(`Request failed for ${url}`);
}

const cachedJsonPromises = new Map();
const cachedTextPromises = new Map();

async function fetchJsonCached(url) {
  if (cachedJsonPromises.has(url)) {
    return cachedJsonPromises.get(url);
  }

  const promise = (async () => {
    const filePath = path.join(CACHE_DIR, `${hashKey(`json:${url}`)}.json`);
    if (await fileExists(filePath)) {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content);
    }

    const data = await fetchWithRetry(url, "json");
    await writeFile(filePath, JSON.stringify(data));
    return data;
  })();

  cachedJsonPromises.set(url, promise);
  return promise;
}

async function fetchTextCached(url) {
  if (cachedTextPromises.has(url)) {
    return cachedTextPromises.get(url);
  }

  const promise = (async () => {
    const filePath = path.join(CACHE_DIR, `${hashKey(`text:${url}`)}.txt`);
    if (await fileExists(filePath)) {
      return readFile(filePath, "utf8");
    }

    const text = await fetchWithRetry(url, "text");
    await writeFile(filePath, text, "utf8");
    return text;
  })();

  cachedTextPromises.set(url, promise);
  return promise;
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
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

function normalizeLocalizedName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u2640/g, "female")
    .replace(/\u2642/g, "male")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function addLocalizedIdToAliasMap(map, alias, id) {
  if (!alias) {
    return;
  }

  const existing = map[alias];
  if (!existing) {
    map[alias] = [id];
    return;
  }

  if (!existing.includes(id)) {
    existing.push(id);
  }
}

function sortAliasMap(map) {
  for (const value of Object.values(map)) {
    value.sort((a, b) => a - b);
  }
}

async function loadLocalizedAliasMaps(csvUrl) {
  const csv = await fetchTextCached(csvUrl);
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const localizedToIds = {};
  const normalizedLocalizedToIds = {};

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

    addLocalizedIdToAliasMap(localizedToIds, localizedName.toLowerCase(), entityId);
    addLocalizedIdToAliasMap(normalizedLocalizedToIds, normalizeLocalizedName(localizedName), entityId);
  }

  sortAliasMap(localizedToIds);
  sortAliasMap(normalizedLocalizedToIds);

  return {
    localizedToIds,
    normalizedLocalizedToIds,
  };
}

function extractEnglishDescription(effectEntries, effectChance) {
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

function extractEnglishDescriptionOrNull(effectEntries, effectChance) {
  const englishEffect = effectEntries.find((entry) => entry.language.name === "en");
  const rawDescription = englishEffect?.short_effect ?? englishEffect?.effect;
  if (!rawDescription) {
    return null;
  }

  return extractEnglishDescription(effectEntries, effectChance);
}

function describeEvolution(detail) {
  if (!detail) {
    return null;
  }

  const parts = [];

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

function collectSpeciesNames(node, names) {
  names.add(node.species.name);
  node.evolves_to.forEach((child) => collectSpeciesNames(child, names));
}

function buildEvolutionTree(node, speciesInfoByName, fromDetail) {
  const info = speciesInfoByName[node.species.name];

  return {
    name: node.species.name,
    generation: info?.generation ?? 1,
    condition: describeEvolution(fromDetail),
    varieties: info?.varieties ?? [node.species.name],
    children: node.evolves_to.map((child) => buildEvolutionTree(child, speciesInfoByName, child.evolution_details[0])),
  };
}

function resolveArtwork(pokemon) {
  const official = pokemon.sprites.other?.["official-artwork"];
  const image = official?.front_default ?? pokemon.sprites.front_default ?? "";
  const shinyImage = official?.front_shiny ?? pokemon.sprites.front_shiny ?? image;
  return { image, shinyImage };
}

async function runWithConcurrency(items, concurrency, worker) {
  const executing = new Set();

  for (const item of items) {
    const promise = Promise.resolve().then(() => worker(item));
    executing.add(promise);

    const onDone = () => executing.delete(promise);
    promise.then(onDone, onDone);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value), "utf8");
}

function toRecordFromSet(names) {
  return [...names].sort().reduce((acc, name) => {
    acc[name] = true;
    return acc;
  }, {});
}

function parseIdFromResourceUrl(url) {
  const trimmed = url.replace(/\/+$/, "");
  const maybeId = Number(trimmed.slice(trimmed.lastIndexOf("/") + 1));
  return Number.isFinite(maybeId) ? maybeId : null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await mkdir(CACHE_DIR, { recursive: true });

  if (options.clean) {
    await rm(OUTPUT_ROOT, { recursive: true, force: true });
  }

  await mkdir(OUTPUT_POKEMON_DIR, { recursive: true });
  await mkdir(OUTPUT_MOVE_DIR, { recursive: true });
  await mkdir(OUTPUT_ABILITY_DIR, { recursive: true });
  await mkdir(OUTPUT_INDEX_DIR, { recursive: true });

  console.log("Loading Pokemon list...");
  const pokemonListResponse = await fetchJsonCached(`${API_BASE}/pokemon?limit=20000`);
  const allPokemon = pokemonListResponse.results;
  const pokemonEntries = options.limit ? allPokemon.slice(0, options.limit) : allPokemon;

  console.log(`Preparing ${pokemonEntries.length} Pokemon entries with concurrency=${options.concurrency}`);

  const moveFileWrites = new Map();
  const abilityFileWrites = new Map();

  const pokemonNameSet = new Set();
  const pokemonIdToName = {};
  const speciesIdToDefaultName = {};

  const moveNameSet = new Set();
  const moveIdToName = {};

  const abilityNameSet = new Set();
  const abilityIdToName = {};

  const moveMetadataCache = new Map();

  async function fetchSpeciesByName(name) {
    return fetchJsonCached(`${API_BASE}/pokemon-species/${name}`);
  }

  async function ensureMoveFile(moveData) {
    if (moveFileWrites.has(moveData.name)) {
      return moveFileWrites.get(moveData.name);
    }

    const filePromise = (async () => {
      const trimmedMove = {
        name: moveData.name,
        power: moveData.power,
        accuracy: moveData.accuracy,
        pp: moveData.pp,
        effect_chance: moveData.effect_chance,
        damage_class: moveData.damage_class,
        type: moveData.type,
        effect_entries: moveData.effect_entries ?? [],
        past_values: (moveData.past_values ?? []).map((pastValue) => ({
          accuracy: pastValue.accuracy,
          effect_chance: pastValue.effect_chance,
          effect_entries: pastValue.effect_entries ?? [],
          power: pastValue.power,
          pp: pastValue.pp,
          type: pastValue.type,
          version_group: pastValue.version_group,
        })),
      };

      await writeJson(path.join(OUTPUT_MOVE_DIR, `${moveData.name}.json`), trimmedMove);
    })();

    moveFileWrites.set(moveData.name, filePromise);
    return filePromise;
  }

  async function ensureAbilityFile(abilityData) {
    if (abilityFileWrites.has(abilityData.name)) {
      return abilityFileWrites.get(abilityData.name);
    }

    const filePromise = (async () => {
      const trimmedAbility = {
        name: abilityData.name,
        generation: abilityData.generation,
        effect_entries: abilityData.effect_entries ?? [],
        effect_changes: (abilityData.effect_changes ?? []).map((change) => ({
          effect_entries: change.effect_entries ?? [],
          version_group: change.version_group,
        })),
      };

      await writeJson(path.join(OUTPUT_ABILITY_DIR, `${abilityData.name}.json`), trimmedAbility);
    })();

    abilityFileWrites.set(abilityData.name, filePromise);
    return filePromise;
  }

  async function loadMoveMetadata(moveResource) {
    const cached = moveMetadataCache.get(moveResource.name);
    if (cached) {
      return cached;
    }

    const moveData = await fetchJsonCached(moveResource.url);

    moveNameSet.add(moveData.name);
    if (Number.isFinite(moveData.id)) {
      moveIdToName[String(moveData.id)] = moveData.name;
    } else {
      const fallbackMoveId = parseIdFromResourceUrl(moveResource.url);
      if (fallbackMoveId !== null) {
        moveIdToName[String(fallbackMoveId)] = moveData.name;
      }
    }

    await ensureMoveFile(moveData);

    const metadata = {
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

    moveMetadataCache.set(moveResource.name, metadata);
    return metadata;
  }

  async function loadAbilities(abilities) {
    return Promise.all(
      abilities.map(async (ability) => {
        const abilityData = await fetchJsonCached(ability.ability.url);

        abilityNameSet.add(abilityData.name);
        if (Number.isFinite(abilityData.id)) {
          abilityIdToName[String(abilityData.id)] = abilityData.name;
        } else {
          const fallbackAbilityId = parseIdFromResourceUrl(ability.ability.url);
          if (fallbackAbilityId !== null) {
            abilityIdToName[String(fallbackAbilityId)] = abilityData.name;
          }
        }

        await ensureAbilityFile(abilityData);

        const description = extractEnglishDescription(abilityData.effect_entries ?? []);
        const effectChanges = (abilityData.effect_changes ?? [])
          .map((change) => {
            const changeDescription = extractEnglishDescriptionOrNull(change.effect_entries ?? []);
            if (!changeDescription) {
              return null;
            }
            return {
              versionGroup: change.version_group.name,
              description: changeDescription,
            };
          })
          .filter((entry) => entry !== null);

        return {
          name: abilityData.name,
          hidden: ability.is_hidden,
          introducedIn: generationNameToNumber(abilityData.generation?.name),
          description,
          effectChanges,
        };
      })
    );
  }

  async function loadMovesMetadata(moves) {
    const uniqueMoves = new Map();
    moves.forEach((move) => uniqueMoves.set(move.name, move));

    const entries = await Promise.all(
      [...uniqueMoves.values()].map(async (move) => [move.name, await loadMoveMetadata(move)] )
    );

    return entries.reduce((acc, [name, metadata]) => {
      acc[name] = metadata;
      return acc;
    }, {});
  }

  let processed = 0;

  await runWithConcurrency(pokemonEntries, options.concurrency, async (pokemonEntry) => {
    const pokemon = await fetchJsonCached(`${API_BASE}/pokemon/${pokemonEntry.name}`);
    const species = await fetchJsonCached(pokemon.species.url);
    const evolutionChain = await fetchJsonCached(species.evolution_chain.url);

    pokemonNameSet.add(pokemon.name);
    pokemonIdToName[String(pokemon.id)] = pokemon.name;

    const defaultVariety = species.varieties.find((entry) => entry.is_default);
    if (defaultVariety?.pokemon?.name) {
      speciesIdToDefaultName[String(species.id)] = defaultVariety.pokemon.name;
    }

    const [abilities, speciesInfoByName, movesMetadata] = await Promise.all([
      loadAbilities(pokemon.abilities),
      (async () => {
        const speciesNames = new Set();
        collectSpeciesNames(evolutionChain.chain, speciesNames);

        const infoPairs = await Promise.all(
          [...speciesNames].map(async (name) => {
            const chainSpecies = await fetchSpeciesByName(name);
            const defaultVarietyName = chainSpecies.varieties.find((entry) => entry.is_default)?.pokemon?.name ?? name;
            speciesIdToDefaultName[String(chainSpecies.id)] = defaultVarietyName;
            return [
              name,
              {
                generation: generationNameToNumber(chainSpecies.generation?.name),
                varieties: chainSpecies.varieties.map((entry) => entry.pokemon.name),
              },
            ];
          })
        );

        return infoPairs.reduce((acc, [name, info]) => {
          acc[name] = info;
          return acc;
        }, {});
      })(),
      loadMovesMetadata(pokemon.moves.map((entry) => entry.move)),
    ]);

    const types = pokemon.types
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name);

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
        pastValues: (movesMetadata[entry.move.name]?.pastValues ?? []).map((pastValue) => ({
          versionGroup: pastValue.versionGroup,
          type: pastValue.type,
          power: pastValue.power,
          accuracy: pastValue.accuracy,
          pp: pastValue.pp,
        })),
      }))
      .filter((entry) => entry.details.length > 0);

    const artwork = resolveArtwork(pokemon);

    const source = {
      id: pokemon.id,
      name: pokemon.name,
      image: artwork.image,
      shinyImage: artwork.shinyImage,
      types,
      stats,
      statTotal: stats.reduce((total, stat) => total + stat.value, 0),
      introducedGeneration: generationNameToNumber(species.generation?.name),
      abilities,
      moves,
      evolutionRoot: buildEvolutionTree(evolutionChain.chain, speciesInfoByName),
      alternativeForms: species.varieties
        .filter((entry) => !entry.is_default)
        .map((entry) => ({ name: entry.pokemon.name })),
    };

    await writeJson(path.join(OUTPUT_POKEMON_DIR, `${pokemon.name}.json`), source);

    processed += 1;
    if (processed % 25 === 0 || processed === pokemonEntries.length) {
      console.log(`Processed ${processed}/${pokemonEntries.length} Pokemon`);
    }
  });

  await Promise.all([...moveFileWrites.values()]);
  await Promise.all([...abilityFileWrites.values()]);

  console.log("Building localized search indexes...");
  const [pokemonLocalizedAlias, moveLocalizedAlias, abilityLocalizedAlias] = await Promise.all([
    loadLocalizedAliasMaps(SPECIES_NAMES_CSV_URL),
    loadLocalizedAliasMaps(MOVE_NAMES_CSV_URL),
    loadLocalizedAliasMaps(ABILITY_NAMES_CSV_URL),
  ]);

  const pokemonLookup = {
    names: toRecordFromSet(pokemonNameSet),
    idToName: pokemonIdToName,
    speciesIdToDefaultName,
    localizedToIds: pokemonLocalizedAlias.localizedToIds,
    normalizedLocalizedToIds: pokemonLocalizedAlias.normalizedLocalizedToIds,
  };

  const moveLookup = {
    names: toRecordFromSet(moveNameSet),
    idToName: moveIdToName,
    localizedToIds: moveLocalizedAlias.localizedToIds,
    normalizedLocalizedToIds: moveLocalizedAlias.normalizedLocalizedToIds,
  };

  const abilityLookup = {
    names: toRecordFromSet(abilityNameSet),
    idToName: abilityIdToName,
    localizedToIds: abilityLocalizedAlias.localizedToIds,
    normalizedLocalizedToIds: abilityLocalizedAlias.normalizedLocalizedToIds,
  };

  await writeJson(path.join(OUTPUT_INDEX_DIR, "pokemon-lookup.json"), pokemonLookup);
  await writeJson(path.join(OUTPUT_INDEX_DIR, "move-lookup.json"), moveLookup);
  await writeJson(path.join(OUTPUT_INDEX_DIR, "ability-lookup.json"), abilityLookup);

  const manifest = {
    generatedAt: new Date().toISOString(),
    totals: {
      pokemon: Object.keys(pokemonLookup.idToName).length,
      moves: Object.keys(moveLookup.idToName).length,
      abilities: Object.keys(abilityLookup.idToName).length,
    },
    options: {
      limit: options.limit,
      concurrency: options.concurrency,
      clean: options.clean,
    },
  };

  await writeJson(path.join(OUTPUT_INDEX_DIR, "manifest.json"), manifest);

  console.log("Build complete.");
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
