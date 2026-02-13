# Ultimate Pokedex

A no-login, no-database web app powered entirely by [PokeAPI v2](https://pokeapi.co/docs/v2). It includes:

- Landing page with Pokemon search
- Pokemon detail page with a bento-box layout
- Generation selector (Gen I to Gen IX) that filters moves, abilities, and evolution visibility
- Dark mode first UI with optional light mode toggle
- Type pills with canonical type colors, fixed pill widths, white text, and black outline
- Base stat bars with color coding + total stat value
- Shiny sprite toggle in the Pokemon summary card
- Single-screen desktop layout with internal scrolling inside cards when content overflows

## Tech Stack

- React + TypeScript
- Vite
- React Router
- Plain CSS (custom design system)

## Run

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Notes on Generation Behavior

- `Moves`: filtered by version groups belonging to the selected generation.
- `Abilities`: filtered by ability introduction generation.
- `Evolutions`: species introduced after the selected generation are hidden from the evolution tree.
- If the viewed Pokemon did not exist in the selected generation, a warning banner is shown and generation-specific sections become empty.
