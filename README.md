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
- Ability tooltips with generation-aware descriptions.
- Multilingual Pokemon/move/ability search fallback using localized aliases.
- Dark-first theme with light mode option, both persisted locally.
- Desktop and mobile responsive layouts.

## Tech stack

- React
- TypeScript
- React Router
- Vite
- Plain CSS (no UI framework)
- Build-time PokeAPI data generation script (`scripts/build-local-data.mjs`)
- Local static JSON dataset (`public/data/*`) with optional live PokeAPI fallback

## Architecture

This is a pure frontend architecture:

- Presentation layer: reusable React components + page-level composition.
- Domain/data layer: `src/api/pokeapi.ts` loads local static JSON first and falls back to live PokeAPI if local data is missing.
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
scripts/
  build-local-data.mjs
public/
  data/
    pokemon/
    moves/
    abilities/
    index/
```

## Data flow and modeling

The core data pipeline is intentionally explicit.

1. Route/search input is normalized in `utils/format.ts`.
2. `npm run build:data` pre-generates Pokemon, move, ability, and lookup JSON into `public/data`.
3. `loadPokemonSource` in `api/pokeapi.ts` loads local JSON first.
4. If local assets are missing, the app falls back to live PokeAPI endpoints.
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

Search resolves in this order:

- Local static lookup indexes (`public/data/index/*`)
- Live PokeAPI fallback (including CSV alias fallback) when local indexes are absent

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

- Local-first loading removes the runtime fan-out of move/ability/species API requests.
- Local lookup indexes are cached in-memory after first load.
- Live PokeAPI remains as fallback to keep behavior resilient when local data is unavailable.
- Generation derivation happens in-memory from a normalized source object instead of repeated network fetches per generation switch.

## Local development

Prerequisites:

- Node.js 18+
- npm

Run:

```bash
npm install
npm run build:data
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

Generate a smaller local dataset for quick iteration:

```bash
npm run build:data:sample
```

## Routes

- `/` landing page
- `/pokemon/:name` Pokemon detail view

`/pokemon/:name` accepts canonical names, numeric IDs, and mapped localized names via fallback resolution.


## Limitations

- No test suite yet (unit/integration/e2e).
- No offline cache/persistence beyond browser storage for preferences.
- Full local data generation can take time due PokeAPI source size; the app keeps a live fallback path for missing local assets.

## Attribution

- Data source: [PokeAPI](https://pokeapi.co/)
- Pokemon names and related game data belong to Nintendo / Game Freak / Creatures.
