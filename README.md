# UltiDex

UltiDex is a client-only, no-login, no-database Pokedex built on top of [PokeAPI v2](https://pokeapi.co/docs/v2). I built this project end-to-end as a single-author implementation focused on three goals:

1. Fast exploration of Pokemon data by generation.
2. High information density without sacrificing usability.
3. Zero server-side infrastructure.

## What the app does

- Landing page with direct Pokemon search and an interactive preview pane.
- Dedicated Pokemon view with a bento-style information layout.
- Generation selector (Gen I-IX) that changes moves, abilities, and evolution visibility.
- Move learnset toggle between `Level-Up` and `TM/HM` methods.
- Evolutions toggle between `Evolutions` and `Alt Forms` (regional, mega, etc. when available).
- Clickable evolutions and forms that navigate to the corresponding Pokemon route.
- Type matchup panel showing `0x`, `0.25x`, `0.5x`, `1x`, `2x`, `4x` damage buckets.
- Shiny/default sprite toggle in the Pokemon summary card.
- Ability tooltips with descriptions loaded from PokeAPI ability data.
- Multilingual Pokemon search fallback using PokeAPI species-name CSV aliases.
- Dark-first theme with light mode option, both persisted locally.
- Desktop and mobile responsive layouts.

## Tech stack

- React
- TypeScript
- React Router
- Vite
- Plain CSS (no UI framework)
- PokeAPI REST endpoints + official PokeAPI CSV data file for localized species names

## Architecture

This is a pure frontend architecture:

- Presentation layer: reusable React components + page-level composition.
- Domain/data layer: `src/api/pokeapi.ts` transforms raw PokeAPI payloads into app-specific typed models.
- State layer: global app preferences (theme, generation) in `AppContext`, with local state per page for UI interactions.
- Styling system: custom CSS tokens, shared card primitives, generation-safe and form-safe data rendering.

No backend, no ORM, no server cache, and no database are used.

## Project structure

```text
src/
  api/
    pokeapi.ts
  components/
    BentoCard.tsx
    EvolutionTree.tsx
    Header.tsx
    StatBars.tsx
    TypePills.tsx
  constants/
    pokemon.ts
  context/
    AppContext.tsx
  pages/
    LandingPage.tsx
    PokemonPage.tsx
  types/
    pokemon.ts
  utils/
    format.ts
    typeEffectiveness.ts
  App.tsx
  main.tsx
  index.css
```

## Data flow and modeling

The core data pipeline is intentionally explicit.

1. Route/search input is normalized in `utils/format.ts`.
2. `loadPokemonSource` in `api/pokeapi.ts` fetches base Pokemon data.
3. Species and evolution-chain endpoints are fetched to enrich generation and evolution context.
4. Abilities and move metadata are loaded and normalized into typed app models.
5. A generation-specific derived view is computed with `derivePokemonForGeneration`.
6. UI renders only the derived generation-safe model, not raw API payloads.

I separate source data (`PokemonSourceData`) from generation-derived data (`PokemonGenerationData`) to keep transformations deterministic and easy to reason about.

## Generation logic

Generation filtering is based on explicit version-group mappings in `constants/pokemon.ts`.

- Moves are filtered by version group and learn method (`level-up` or `machine`).
- Level-up moves are sorted ascending by minimum learned level.
- Abilities are filtered by introduction generation.
- Evolution nodes are pruned if their species was introduced after the selected generation.
- If a Pokemon did not exist in that generation, the app shows a warning and empties generation-scoped sections.

## Forms and evolution behavior

- Alternate forms come from species varieties (`is_default === false`).
- Form selection swaps the active source dataset for stats, abilities, types, and sprite.
- Evolution rendering resolves regional variants where possible so chains remain contextually correct.
- Evolution and form items are interactive and route-aware.

## Multilingual search

If direct `/pokemon/:identifier` lookup fails, the app falls back to a localized name index built from:

- `pokemon_species_names.csv` in the official PokeAPI repository.

Normalization includes:

- Case-insensitive matching.
- Diacritic stripping.
- Symbol normalization for gendered names.

This allows searching by localized names while keeping UI language in English.

## UI and design decisions

The UI is intentionally dense but structured:

- `BentoCard` is the base primitive for all major content panels.
- Type pills use canonical Pokemon type colors and fixed-width logic for visual consistency.
- Base stats use color-coded bars and include total stat sum.
- Ability descriptions render in a portal tooltip layer to avoid clipping within scrollable cards.
- Desktop prioritizes single-view density; mobile prioritizes vertical readability with stacked cards.

## State management

Global state in `AppContext`:

- `theme` (`dark` or `light`)
- `generation` (`1..9`)

Both are persisted in `localStorage` and restored on load.

Page-local state handles:

- shiny toggle
- move mode toggle
- evolution/forms mode toggle
- selected alt form
- tooltip placement state
- loading/error state per page

## Performance considerations

- Move metadata is cached in-memory (`moveMetadataCache`) to avoid duplicate fetches.
- Localized species-name index is loaded lazily and cached after first use.
- Generation derivation happens in-memory from a normalized source object instead of repeated network fetches per generation switch.

## Local development

Prerequisites:

- Node.js 18+
- npm

Run:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Routes

- `/` landing page
- `/pokemon/:name` Pokemon detail view

`/pokemon/:name` accepts canonical names, numeric IDs, and mapped localized names via fallback resolution.


## Limitations

- No test suite yet (unit/integration/e2e).
- No offline cache/persistence beyond browser storage for preferences.
- Runtime data quality depends on upstream PokeAPI correctness and availability.

## Attribution

- Data source: [PokeAPI](https://pokeapi.co/)
- Pokemon names and related game data belong to Nintendo / Game Freak / Creatures.
