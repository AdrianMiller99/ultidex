export interface GenerationOption {
  value: number;
  label: string;
  apiName: string;
  versionGroups: string[];
}

export const GENERATIONS: GenerationOption[] = [
  { value: 1, label: "Gen I", apiName: "generation-i", versionGroups: ["red-blue", "yellow"] },
  { value: 2, label: "Gen II", apiName: "generation-ii", versionGroups: ["gold-silver", "crystal"] },
  {
    value: 3,
    label: "Gen III",
    apiName: "generation-iii",
    versionGroups: ["ruby-sapphire", "emerald", "firered-leafgreen", "colosseum", "xd"],
  },
  {
    value: 4,
    label: "Gen IV",
    apiName: "generation-iv",
    versionGroups: ["diamond-pearl", "platinum", "heartgold-soulsilver"],
  },
  {
    value: 5,
    label: "Gen V",
    apiName: "generation-v",
    versionGroups: ["black-white", "black-2-white-2"],
  },
  {
    value: 6,
    label: "Gen VI",
    apiName: "generation-vi",
    versionGroups: ["x-y", "omega-ruby-alpha-sapphire"],
  },
  {
    value: 7,
    label: "Gen VII",
    apiName: "generation-vii",
    versionGroups: ["sun-moon", "ultra-sun-ultra-moon", "lets-go-pikachu-lets-go-eevee"],
  },
  {
    value: 8,
    label: "Gen VIII",
    apiName: "generation-viii",
    versionGroups: ["sword-shield", "brilliant-diamond-and-shining-pearl", "legends-arceus"],
  },
  { value: 9, label: "Gen IX", apiName: "generation-ix", versionGroups: ["scarlet-violet"] },
];

export const VERSION_GROUPS_BY_GENERATION: Record<number, string[]> = GENERATIONS.reduce(
  (acc, generation) => {
    acc[generation.value] = generation.versionGroups;
    return acc;
  },
  {} as Record<number, string[]>
);

const GENERATION_NAME_TO_NUMBER: Record<string, number> = GENERATIONS.reduce(
  (acc, generation) => {
    acc[generation.apiName] = generation.value;
    return acc;
  },
  {} as Record<string, number>
);

export function generationNameToNumber(name?: string | null): number {
  if (!name) {
    return 1;
  }
  return GENERATION_NAME_TO_NUMBER[name] ?? 1;
}

export const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
  unknown: "#6C8A8B",
  shadow: "#4A4060",
};

export const TYPE_PILL_CH = Math.max(...Object.keys(TYPE_COLORS).map((type) => type.length));

export const GENERATION_ROMAN: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
};
