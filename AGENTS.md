# AGENTS.md

Instructions for coding agents working on this repo. **[README.md](README.md) is the main documentation**: file map, editor behaviour, file format, piece rules, game data and assets. Read it first, and keep it up to date. When behaviour, rules, data or assets change, update README.md. **Keep this file up to date too** as you work: when a ground rule, workflow, command or something an agent needs to know changes (or turns out wrong), fix it here in the same change.

## Commands

```sh
npm test     # node --test test/*.test.js (Node 22+); must pass before you finish
npm run typecheck  # JSDoc types via TypeScript (npx); must pass before you finish
npm start    # serve on http://localhost:8000 (python3 -m http.server)
```

Docker alternative: `docker compose up -d` (port 8080). The dev container (`.devcontainer/devcontainer.json`) has Node 22 and Python 3 but no Docker inside: use `npm start` there. Keep it free of a build step and of docker-in-docker.

## Ground rules

- **No build step and no runtime dependencies.** Plain ES modules loaded directly by the browser. Don't add bundlers, frameworks or npm packages to the app. Throwaway tooling (e.g. image processing) belongs outside the repo.
- **Game knowledge lives in `src/catalog.js`**: items, recipes, stations, port layouts, piece kinds, rule switches, the floor sections (`FLOOR_SECTIONS`, `FLOOR_GRID`), the Zombie Supply Porter (`PORTER`, `portersFor`), the fixed distributors (`FACTORY_DISTRIBUTORS`, and the garden's `FACTORY_GARDEN_DISTRIBUTORS` with `GARDEN_ITEMS`) and the cellar (`FACTORY_CELLAR`, `CELLAR_ITEMS`). Don't hard-code game facts elsewhere.
- **`src/model.js` must stay DOM-free.** The planner (also in a Web Worker) and the tests use it outside the page. Placement (`canPlace`), connectivity (`ports`, `acceptsFrom`) and `validate()` are the source of truth for the rules. The UI and planner should call them rather than reimplement them.
- **The planner must agree with the model.** `src/planner/router.js` has its own fast grid rules (placement, chest contact, underground gaps and belt cells, port access). Any layout it produces must pass `Layout.validate()` with no errors or warnings, and `test/planner.test.js` checks that. When a game rule changes, update the model and the router together.
- **Planner quality changes need numbers.** Tuning placement or search (costs, moves, spacing) is noisy, so compare several seeds on the same targets (unrouted connections, belts) before and after, and don't judge from a single run.
- **Layout JSON is user data.** When you change the format, bump `FORMAT_VERSION`, migrate older files (entity fields in `normalizeEntity`, layout-level changes in `Layout.fromJSON`, both in model.js) and add a test, rather than breaking old exports. Format 2 added 12 rows on top (42×55) and `repaired`; format 1 factory files (42×43) are moved down on load.
- **The floor comes from the game's sections.** `src/floor.js` builds it from `FLOOR_SECTIONS` (`setRepaired`, `sectionFloor` in model.js): a cell is floor only when the sections in use cover all of it. `setRepaired` also keeps the fixed distributors in step. Pieces marked `fixed` in `ENTITY_KINDS` (distributors, the cellar) sit off the floor and the editor never adds, moves or removes them; the cellar is even off the grid (x = −1), so `entityAt` finds fixed pieces outside the bounds and `validate` doesn't flag them. `factory.json` is the user's real floor (format 1) and the test reference for that, so don't overwrite it. The floor plan is fixed: the only floor UI is the repaired-section toggles (turning one off clears the setup), no resizing or rewriting.
- **Rules:** README.md's "Piece rules → Confirmed vs assumed" separates what the user confirmed from what was guessed. Don't turn an assumption into a confirmed rule without the user saying so. Ask when a game rule is unclear.
- **Coordinates:** grid cells are square in the editor, but the game's are 64×48 px. Any art or background work has to respect `UNIT_PX`. World to grid: column = (x + 120) / 0.64, row = (−392.7 − z) / 0.6; the background's grid origin is image pixel (226, 72) (`src/background.js`).
- **Reading the game files** (UnityPy, outside the repo, in the gitignored `Graveyard Keeper 2/` install): bundles under `StreamingAssets/aa/StandaloneWindows64` have their Unity version stripped, so set `UnityPy.config.FALLBACK_UNITY_VERSION = '6000.3.9f1'` (from `globalgamemanagers`). Game data (GameBalance, `lng_en`) is in `resources.assets`, icons in `sharedassets0.assets`; README "Game data" and "Assets" say where each fact came from. The factory floor tiles are generated at runtime, so there's no floor art to extract; the background is the user's screenshot plus a pattern fill (README "Assets").
- **Keep it typed.** Every module in `src/` starts with `// @ts-check`; give new functions and data JSDoc types, and put shared shapes in `src/types.js`. Types are comments only: never add a build step for them.
- **Art is WebP.** Sprites lossless (pixel-exact), photographic backgrounds lossy; lossless masters that shouldn't be published go in `art-src/` The exceptions are the social preview `assets/og-image.jpg` and the favicons in `assets/icons/` (link previews and Safari don't all accept WebP). When features change, keep the About section in `index.html` and `llms.txt` accurate.
- Match the existing style: small modules, 2-space indent, single quotes, sparse comments that explain *why*.

## Testing notes

- Unit tests cover the model and game data (`test/model.test.js`) and the planner (`test/planner.test.js`). Add tests for new rules, pieces, migrations and data invariants, and keep the whole-plan tests validating cleanly.
- There are no automated UI tests. For UI changes, at least run `node --check` on changed files. Ideally, drive the `Editor` under jsdom or render `drawLayout` with a headless canvas (e.g. `@napi-rs/canvas`) outside the repo, and look at the result.
