# AGENTS.md

Instructions for coding agents working on this repo. **[README.md](README.md) is the main documentation**: file map, editor behaviour, file format, piece rules, game data and assets. Read it first, and keep it up to date. When behaviour, rules, data or assets change, update README.md, not this file.

## Commands

```sh
npm test     # node --test test/*.test.js (Node 22+); must pass before you finish
npm run typecheck  # JSDoc types via TypeScript (npx); must pass before you finish
npm start    # serve on http://localhost:8000 (python3 -m http.server)
```

Docker alternative: `docker compose up -d` (port 8080).

## Ground rules

- **No build step and no runtime dependencies.** Plain ES modules loaded directly by the browser. Don't add bundlers, frameworks or npm packages to the app. Throwaway tooling (e.g. image processing) belongs outside the repo.
- **Game knowledge lives in `src/catalog.js`**: items, recipes, stations, port layouts, piece kinds and rule switches. Don't hard-code game facts elsewhere.
- **`src/model.js` must stay DOM-free.** The planner (also in a Web Worker) and the tests use it outside the page. Placement (`canPlace`), connectivity (`ports`, `acceptsFrom`) and `validate()` are the source of truth for the rules. The UI and planner should call them rather than reimplement them.
- **The planner must agree with the model.** `src/planner/router.js` has its own fast grid rules (placement, chest contact, underground gaps, port access). Any layout it produces must pass `Layout.validate()` with no errors or warnings, and `test/planner.test.js` checks that. When a game rule changes, update the model and the router together.
- **Planner quality changes need numbers.** Tuning placement or search (costs, moves, spacing) is noisy, so compare several seeds on the same targets (unrouted connections, belts) before and after, and don't judge from a single run.
- **Layout JSON is user data.** When you change the format, migrate older files in `normalizeEntity` (model.js) and add a test, rather than breaking old exports. `factory.json` is the user's real floor and the source of `src/floor.js`, so don't overwrite either. The floor plan is fixed now: no UI for resizing or rewriting it.
- **Rules:** README.md's "Piece rules → Confirmed vs assumed" separates what the user confirmed from what was guessed. Don't turn an assumption into a confirmed rule without the user saying so. Ask when a game rule is unclear.
- **Coordinates:** grid cells are square in the editor, but the game's are 64×48 px. Any art or background work has to respect `UNIT_PX`.
- **Keep it typed.** Every module in `src/` starts with `// @ts-check`; give new functions and data JSDoc types, and put shared shapes in `src/types.js`. Types are comments only: never add a build step for them.
- **Art is WebP.** Sprites lossless (pixel-exact), photographic backgrounds lossy; lossless masters that shouldn't be published go in `art-src/`.
- Match the existing style: small modules, 2-space indent, single quotes, sparse comments that explain *why*.

## Testing notes

- Unit tests cover the model and game data (`test/model.test.js`) and the planner (`test/planner.test.js`). Add tests for new rules, pieces, migrations and data invariants, and keep the whole-plan tests validating cleanly.
- There are no automated UI tests. For UI changes, at least run `node --check` on changed files. Ideally, drive the `Editor` under jsdom or render `drawLayout` with a headless canvas (e.g. `@napi-rs/canvas`) outside the repo, and look at the result.
