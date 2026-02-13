export function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPokemonName(value: string): string {
  return titleCase(value.replace(/[^a-zA-Z0-9-]/g, ""));
}

function canonicalizeRegionalAlias(value: string): string {
  const regionalAliases: Array<{ prefix: string; suffix: string }> = [
    { prefix: "alolan-", suffix: "-alola" },
    { prefix: "galarian-", suffix: "-galar" },
    { prefix: "hisuian-", suffix: "-hisui" },
    { prefix: "paldean-", suffix: "-paldea" },
  ];

  for (const alias of regionalAliases) {
    if (value.startsWith(alias.prefix)) {
      return `${value.slice(alias.prefix.length)}${alias.suffix}`;
    }
  }

  return value;
}

function canonicalizeMegaAlias(value: string): string {
  if (!value.startsWith("mega-")) {
    return value;
  }

  const rest = value.slice("mega-".length);
  if (rest.endsWith("-x") || rest.endsWith("-y")) {
    const variant = rest.slice(-1);
    const baseName = rest.slice(0, -2);
    return `${baseName}-mega-${variant}`;
  }

  return `${rest}-mega`;
}

export function canonicalizePokemonIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  const regional = canonicalizeRegionalAlias(normalized);
  return canonicalizeMegaAlias(regional);
}

export function normalizePokemonInput(value: string): string {
  return canonicalizePokemonIdentifier(value);
}

export function formatVersionGroup(value: string): string {
  return titleCase(value);
}
