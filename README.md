# Factory layout optimizer

A layout tool for the factory in Graveyard Keeper 2.

> **Disclaimer.** This is an unofficial fan-made tool. I own none of the game content it uses and have no relation to, affiliation with, or endorsement from the copyright holders. *Graveyard Keeper 2*, its art (including the images in `assets/`, extracted from the game files), names and game data are © their respective owners: developer **Lazy Bear Games**, publisher **tinyBuild**. All trademarks belong to their owners. The game material is used under a claim of **fair use**: this is a free, non-commercial planning tool for players who own the game, using small portions (sprites, icons, names and recipe data) for the transformative purpose of planning factory layouts, and it is not a substitute for the game or its assets. If you are a rights holder and want anything removed, please open an issue.

- **Step 1 (done):** a floor-plan editor for the factory's irregular floor, belts, stations, chests and distribution stations.
- **Step 2 (in progress):** a planner that works out the stations needed for target outputs per minute and lays them out with belts automatically.

## Run

```sh
npm start        # python3 -m http.server 8000, then open http://localhost:8000
npm test         # model unit tests (Node 22+)
npm run typecheck # JSDoc types, checked by TypeScript (fetched by npx; not a dependency)
```

Or with Docker/Podman: `docker compose up -d` → http://localhost:8080 (nginx, project folder mounted read-only; stop with `docker compose down`).

Or in the dev container (`.devcontainer/`, e.g. VS Code "Reopen in Container"): Node 22 and Python 3 on Debian, no Docker inside, so use `npm start` there (port 8000 is forwarded) rather than compose. The project is bind-mounted with `:z` for SELinux hosts.

No build step and no dependencies. ES modules need to be served over HTTP; opening `index.html` directly won't work.

The code is plain JavaScript with JSDoc types: every module starts with `// @ts-check`, and `jsconfig.json` has TypeScript check `src/` in strict mode (except null checks). Shared types (entities, recipes, items, stations, ports, issues, plans) live in `src/types.js`. Editors and agents get the types; the browser runs the files as they are.

### Publishing as a static site (GitHub Pages)

The app is entirely static (HTML, CSS, ES modules, a module Web Worker, WebP images; state in `localStorage`), and every path is relative, so any static host works, including a project page under `/<repo>/`. For GitHub Pages, `.github/workflows/pages.yml` runs the tests and the type check on every push to `main`, then publishes only `index.html`, `styles.css`, `src/` and `assets/`. Enable it once under Settings → Pages → Source: **GitHub Actions**. Deploying from the branch root also works, but that publishes everything in the repo. `.nojekyll` makes Pages serve the files as they are.
- Discoverability: `index.html` has a title and description, a canonical URL, Open Graph/Twitter tags with `assets/og-image.jpg` (1200×630, JPEG because link previews don't all take WebP), and JSON-LD `WebApplication` data about the game. The page also has a visible title and an About section, since the rest of the app is a canvas that crawlers and LLMs can't read. `llms.txt` is a plain-text summary for LLMs and agents, and `sitemap.xml` can be submitted to Google Search Console and Bing Webmaster Tools. No `robots.txt`: crawlers only read it at the domain root, not on a project page.
- Art: sprites are lossless WebP and the floor background is WebP at quality 90, about 0.6 MB in all. Brotli wouldn't help: WebP is already compressed, and Pages can't serve pre-compressed `.br` files (it gzips the text files itself). `.gitignore` keeps the local `Graveyard Keeper 2/` game install out of the repo. `compose.yaml` and `npm start` are only for local serving.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `styles.css` | The editor page. |
| `src/catalog.js` | All game data: items, recipes, stations and their port layouts, extensions, worker talents, conveyor/chest art tables, piece kinds and rule switches. |
| `src/model.js` | `Layout`: terrain grid, entities, placement rules, ports, validation, JSON load/save and migration. No DOM, so it also runs under Node. |
| `src/render.js` | Canvas drawing: terrain, background, entities, sprites, icons and overlays. |
| `src/editor.js` | Tools, mouse/keyboard input, side panels, undo/redo and autosave. |
| `src/background.js` | Background image and its alignment to the grid. |
| `src/floor.js` | The real factory floor: the game's floor sections (`FLOOR_SECTIONS` in the catalog) and the distribution stations. Used on first launch and kept by **Clear**. |
| `src/main.js` | Entry point. |
| `src/planner/production.js` | Production math: targets → recipes, station counts and levels, supply per minute. |
| `src/planner/router.js` | Belt routing on a grid (belts, undergrounds, splitters, chest hubs) and the per-item belt networks. |
| `src/planner/planner.js` | Station placement, who-feeds-whom, and the simulated-annealing search. |
| `src/planner/worker.js` | Web Worker running the search. |
| `src/planner/panel.js` | The Planner side panel. |
| `test/model.test.js` | Unit tests for the model and game data (`node:test`). |
| `test/planner.test.js` | Unit tests for production math, routing and whole plans. |
| `assets/` | In-game art as WebP (see [Assets](#assets)). |
| `art-src/` | Lossless masters that aren't published (the stitched floor screenshot). |
| `src/types.js` | Shared JSDoc types; `jsconfig.json` configures the type check. |
| `.github/workflows/pages.yml` | Test, type-check and publish to GitHub Pages. |
| `factory.json` | The user's factory floor as exported from the editor (format 1, before floor sections). A test checks the sections reproduce it. |
| `compose.yaml` | nginx container serving the folder. |

## Editor

- **Terrain tools**: Floor `F`, Outside `X`. A cell is either factory floor or not. Drag to paint, Shift+drag for a rectangle.
- **Place**: Belt `B` (dragging lays a line that follows the drag direction), Underground `U`, Splitter `P`, Station `S` (3×3, or 2×2 for the kitchen, centred on the cursor), Chest `H`, Supply station `L`, Zombie Supply Porter `O`.
- **Distribution stations** are fixed: the factory's 7, in the bottom wall one row below the floor (`FACTORY_DISTRIBUTORS`), each feeding north into the floor's bottom row. They can't be placed, moved, turned, restocked, erased or deleted; selecting one shows its material. Each works like a chest open on one side: the cell it feeds may stay empty, or hold a belt (going up, left or right) or any of an underground conveyor's four belt cells (any way but down), which it pushes into; nothing else can go there, including an underground's gap.
- **Garden distributors** (`FACTORY_GARDEN_DISTRIBUTORS`) are fixed too: three in the top wall at 1,−1, 3,−1 and 5,−1, one row above the floor, feeding south into 1,0, 3,0 and 5,0 of the North-west-most section (1), so they're there only while that section is repaired. Each serves one crop of the garden (`GARDEN_ITEMS`: Wheat, Carrot, Beet, and Onion, Pumpkin and Cabbage ★/★★/★★★). The crops float as a strip of icons at 1,−2 and on; select a garden distributor and click one to set it (click it again to clear it), and it shows inside the distributor. The planner sets the ones left empty to the crops the plan needs most (a crop beyond the free ones comes from a supply chest, as with the cellar), marks them `autoMaterial`, and resets those before each new plan.
- **The cellar** (`FACTORY_CELLAR`) is fixed too: in the west wall at −1,14, just off the grid, feeding east into the one-cell nook at 0,14 of the North-west section (3), so it's there only while that section is repaired. Its front takes the same pieces as a distributor's. It holds any of Beer and Wine ★/★★/★★★ (`CELLAR_ITEMS`; ticked in its inspector, saved as `stock`) and puts everything it holds onto that one belt, mixed: with more than one item, a chest with filters sorts them out.
- `R` rotates belts, undergrounds, splitters and supply stations. Stations can't rotate, so on a station `R` cycles through its 4 layouts.
- **Select** `V`: click to inspect/edit, drag to move, `R`/`Shift+R` rotate, `Del` delete. Erase `E`, or right-drag with any tool.
- Wheel to zoom, middle-drag or Space+drag to pan, `0` fits the layout, Ctrl+Z / Ctrl+Y for undo/redo.
- **Clear** removes everything placed on the floor; the floor and its distribution stations stay (undoable). The floor plan itself is fixed to the real factory and its background.
- **Floor sections** (left panel): one toggle per section of the floor that's repaired in the game (1–5 and 8; 6, 7, 9 and 10 are there from the start), with the repair materials as icons. Only repaired sections are floor, for the editor and the planner. Turning a section off clears the current setup (after a confirmation when there's anything to clear; one undo step). Distribution stations (and the cellar) feeding a section that isn't repaired are left out, and come back when it is. Sections that aren't repaired are hatched on the canvas with their number, and hovering a toggle outlines its section. A layout imported with its own floor (not the factory's) has no toggles.
- The grid is drawn only over usable floor cells.
- **Background**: the in-game factory floor is drawn under the grid, stretched so each 64×48 px game unit fills one cell. With the background on, the editor's own floor is only drawn (semi-transparent, with cyan edges) while a terrain tool is selected. Toggle it in the top bar.
- **Stations** are drawn with their in-game art for their level and layout, plus the art of any fitted extensions (always opaque), in front of a rounded square in the station colour (red smithy, blue assembly bench, green kitchen), which shows through the gaps in the art. They show `level · product` in the middle, and under it the worker talent the recipe needs, e.g. `5` with the gear icon. Each ingredient's icon is on its input port and the product's icon on the output, with quantities over 1. With one ingredient, it's shown on both inputs.
- **Extensions**: the station tool options and the station inspector show the station's extensions as icon toggles in two rows, one per slot (small, big). Clicking one fits it and replaces whatever was in that slot; clicking it again removes it. Picking a recipe fits the extension it needs; that button is outlined, in red while it's missing.
- **Recipe line** (under the recipe picker): ingredients → products, craft time, unlock tech, extension, and `needs N` with the worker talent icon.
- **Belts, undergrounds, splitters and chests** use the game's conveyor and chest art. A belt shows a line cap where nothing feeds it from behind or where the cell ahead doesn't take its items; a splitter caps each output with nothing attached. The chest inspector picks Conveyor Chest I or II.
- **Flow lines** (toggle **Flow** in the top bar): thin cyan lines over belts, splitters and undergrounds, from each side that actually feeds a piece (its back if nothing does) through its centre to where it sends items, dashed where an underground runs below. Arrowheads mark where a straight run ends, turns or hands over.
- **Chests, distributors, the cellar and the chest inspector** show item icons (a coloured dot if an icon is missing).
- **Power**: the Stats panel starts with the layout's factory power (the yellow gear) used / available: 1 per station and conveyor belt, 2 per underground conveyor, none for chests and porters (`POWER_COST` in `src/catalog.js`). Power comes from zombies on the factory's 5 zombie carousels, which are fixed (none can be built): 4 zombies each, so at most 20 zombies, each giving 7 power (10 with the **Belt Master** perk, a checkbox in Stats saved with the layout). That's a maximum of 140 power, or 200 with Belt Master. Stats also shows the zombies needed out of 20; going over the maximum is a warning. The planner shows its result's power against the maximum.
- Autosaves to localStorage. Import/Export JSON to keep files.
- The Issues panel lists validation problems: entities off the floor, ports facing off the floor, belts facing each other, pieces fed from a side with no input, chests placed against station inputs or against a station's side output, missing materials, invalid recipes, missing or clashing extensions. Errors and warnings are also outlined on the canvas; info notes such as "no recipe" appear only in the panel.
- **Locked** entities are ones the planner must keep. Unlocked entities (including everything the planner places) are drawn slightly faded, except station art.

## Planner

The **Planner** panel on the right takes one or more final outputs (item and rate per minute), works out the production, and searches for a layout.

1. **Production** (`production.js`): walks the recipe tree back from the targets and adds up the demand for every intermediate. Stations needed = crafts per minute ÷ crafts one station does per minute, rounded up. A station does 60 ÷ the recipe's `time` crafts per minute (the game's craft duration in seconds, e.g. 8 s → 7.5 per minute); `DEFAULT_CRAFTS_PER_MINUTE` (1) only applies to a recipe without a time. The planner tests pin every recipe to 1 per minute (`craftsPerMinute` option) so their numbers don't move with the data.
   - Each recipe uses the lowest station level that can run it, capped by the "up to" level set per station type.
   - Where an item has several recipes (e.g. Wooden Kit I), the one needing no hand-stocked ingredients is chosen by default; the panel lets you pick another.
   - Raw materials come from distribution stations when the floor has one for that material (a garden distributor with no crop set counts as one for every garden crop), and Beer and Wine from the cellar when it's there. Everything else without a recipe comes from hand-stocked supply chests.
   - The plan fills the cellar with just what it takes from it. One item goes straight onto the cellar's belt, like a distributor's. Several go along a belt at 0,14 into a chest at 1,14, filtered to send each out of its own side; that's three items at most (a fourth comes from a supply chest), and the cellar isn't used when 0,14 or 1,14 is taken.
   - Planned stations get the extension their recipe needs.
   - Power: the carousels are fixed, so each point of power a candidate plan uses over the maximum adds 20 to its score (`OVER_POWER_COST`, or the `overPowerCost` option): over the maximum, every belt saved counts 21 instead of 1 (and an underground 42). A plan still over the maximum is shown in red with how far over it is. On the real floor over 5 seeds at 1500 iterations (1 craft/min per recipe; undergrounds at 2 power), with a cost of 20 against none: Supply: Iron used 222 power instead of 226 (0.6 unrouted instead of 0.2), and with Belt Master 216 instead of 226 (16 over 200 instead of 28); Furniture I + Iron 253 instead of 290 (2.4 unrouted instead of 2.8), 266 with Belt Master; Building Kit I + Cutlery I about 71 either way (under the maximum, so no change).
2. **Placement:** stations (3×3, or 2×2 kitchens) are placed greedily near what feeds them, keeping at least one free row or column between stations and out of a 3×4 apron in front of each distributor the plan uses. Each used port keeps its access cell and the cell beyond it free until connected; used distributors keep two cells.
3. **Connections:** every station input is fed by a distributor, a supply chest, or producer stations (nearest producers first, split by rate). Every final output goes to an output chest, placed directly against the station output where possible (never against a side output, which needs a belt; the same goes for chest hubs), except "Supply: …" items, which end in a **supply station**. The route may end in a new supply station on one of the 40 free floor cells nearest the supply zone (row 27, x 23–31: `SUPPLY_ZONE`; outside distributor aprons), costing 1 per cell away from it, a weak pull to save power (`SUPPLY_CORNER_COST`, or the `supplyCornerCost` option), or in an existing supply station's input. Stations making a final "Supply: …" item start their greedy placement near the zone. **Chests in the line:** chests use no power, so the router may put a chest filtered to the one side it leaves from in place of a belt where the line turns or right after an underground (`COST.passChest`, `role: 'pass'`), never on a station's port access cell and never on a "Supply: …" line (chests can't take those). An underground's exit can also feed straight into another underground's entry. Over seeds 1–6 at 1500 iterations on the real floor: Supply: Iron 188 power instead of 201 (1.0 unrouted instead of 0.7), and Iron + Cutlery I + Furniture I 194 instead of 216 (8.7 instead of 6.8).
   **Porters:** one Zombie Supply Porter per 3 supply stations goes along 23,24 to 29,24 (the top cell; each also takes the row below). Room for the most the plan could need is held free while it routes, and only the ones the routed supply stations need are built. A second producer merges into the line or gets its own supply station, whichever is cheaper; a line that only leads to supply stations takes any "Supply: …" item, so different supply items share one belt (fewer belts, less power). No belt takes more than 3 stations (`MAX_STATIONS_PER_BELT`; distributors and supply chests don't count), for merges of the same item too. **Buffers:** a station's product that another station takes more than 1 of per craft (e.g. 8 ingots for Supply: Iron) leaves through a chest on the output, which builds up a stock for that station; a plain belt start costs 30 more (`BUFFER_MISS_COST`), so it's used only where a chest can't fit, and never on a side output, which can't feed a chest directly. Connections are routed shortest first. Each route can:
   - use belts, or underground conveyors to cross another belt (the planner doesn't cross one underground with another: over 10 seeds on the real floor that left Supply: Iron with 1.4 unrouted connections instead of 0.6);
   - branch off an existing line of the same item, with a splitter at a turn or a chest hub on a straight;
   - start with a chest hub right on a distributor or station output, sharing out to up to three belts;
   - merge into the side of a line already heading to the same station.
4. **Search:** simulated annealing moves stations, switches their layout, swaps which input takes which ingredient, and swaps stations. Every candidate is re-routed from scratch and scored by belts, turns, undergrounds, splitters and chests, plus 1000 per connection that couldn't be routed.
5. **Result:** the best layout so far is previewed on the canvas while the search runs (editing is paused). **Apply** adds it to the layout as unlocked `planned` pieces, replacing any previous plan in one undo step. **Continue** keeps improving the current result, **New search** starts over, and **Discard** drops it. Targets and options are saved with the layout under `planner`.

Locked and hand-placed entities are kept as obstacles; the planner doesn't reuse existing stations yet.

### Planner assumptions and limits

- Belt throughput is unlimited, and splitters and chest hubs (round-robin) share items out with back-pressure, so any connected layout delivers the rates. The search doesn't check belt capacity yet.
- Each input port takes a single item type. A one-ingredient recipe uses one input.
- Supply chests and chest hubs the planner places get a filter on each side they feed, so belts may pass right beside them. Output chests have no filters, so no planned belt sits next to one unless it points into it (`chestFeeds` in the router). Existing chests feed belts (and underground belt cells) on their filtered sides, or every side without filters, so the router keeps its undergrounds' belt cells away from them. A route from a chest always starts with a belt.
- Supply stations near the corner mean longer output lines than an output chest next to the station, so plans with "Supply: …" outputs route a little worse. On the real floor, over 5 seeds at 1500 iterations: Supply: Iron averaged 1.0 unrouted connections (0 with output chests), and Furniture I + Iron 3.2 (was 1.2). A corner cost of 1 brings that to 0.8 and 2.0, but the stations end up about 8 cells from the corner instead of 3.
- Large plans (15+ stations) don't always route every connection within the search time: a 17-station test plan usually ends with 1–2 unrouted after 20 s, occasionally more. Unrouted connections are listed in the panel. Running longer, or **Continue**, usually brings the count down.

## Layout file format

```json
{
  "format": "factory-layout", "version": 2, "name": "…", "width": 42, "height": 55,
  "repaired": [5, 8],
  "terrain": ["   ....", "  .....", "......."],
  "entities": [
    {"id":1,"kind":"distributor","rot":0,"x":3,"y":53,"material":"marble","locked":true},
    {"id":2,"kind":"belt","rot":1,"x":5,"y":3,"locked":true},
    {"id":3,"kind":"station","type":"smithy","level":1,"variant":"in_left","x":9,"y":2,"recipe":"iron_kit_1","extensions":["bellows","hammer"],"locked":true},
    {"id":4,"kind":"underground","rot":1,"x":2,"y":6,"locked":true},
    {"id":5,"kind":"splitter","rot":0,"x":8,"y":8,"locked":true},
    {"id":6,"kind":"chest","level":1,"x":4,"y":3,"stock":["iron_ore","coal"],"filters":{"E":"iron_ore","S":"coal"},"locked":true}
  ],
  "planner": {"targets": [{"item": "supply_iron", "rate": 1}], "timeSec": 30, "maxLevel": {}, "recipeChoice": {}}
}
```

- Terrain characters: `.` floor, space or `_` outside. Older files' `#` (wall) and `O` (column) load as outside.
- `repaired` lists the repaired floor sections. When it's there, the terrain is rebuilt from the sections on load (the saved rows are for reading), and the distributors and cellar are reset to the factory's fixed ones (the cellar keeps its `stock`, a garden distributor its `material`); without it, the terrain rows are the floor.
- `beltMaster: true` at the top level records the Belt Master perk.
- `extensions` on a station lists its fitted extensions (at most one per slot). `level` on a chest is 1 or 2 (Conveyor Chest I/II).
- `x`, `y` is the top-left cell (the entry cell for undergrounds). y grows downward, so the bottom of the factory is the highest y.
- `rot` is 0=N, 1=E, 2=S, 3=W: the travel direction for belts, undergrounds and splitters, the output side for distributors and the cellar, and the input side for supply stations. Stations and chests have no `rot`.
- Entities placed by the planner have `"planned": true`. Planned stations also record which ingredient each input port takes: `"inputs": ["iron_ingot", null]`. Planner chests have a `role` of `supply`, `output` or `hub`.
- Files saved by earlier versions are migrated on load: a format 1 file of the factory floor (42×43) moves down 12 rows onto the 42×55 grid and gets the sections its floor had in `repaired`, placed zombie carousels are dropped (the factory's are fixed), a chest's `material` becomes `stock`, station `rot` is dropped, a station without `extensions` gets the one its recipe needs, a chest without `level` is Chest I, and walls and columns become outside.

## Piece rules

| Piece | Size | Behaviour |
|---|---|---|
| Belt | 1×1 | Moves items towards `rot`. Belts never cross. Can be fed from behind or the sides (`BELT_ACCEPTS_FROM_SIDES`). |
| Underground conveyor | 1×5 | Extends 4 cells from its entry cell towards `rot`: 2 cells, a gap, 2 cells. Items leave in front of the exit. The four cells around the gap work like plain belts: each takes items from behind and from the sides (a belt merging, a chest or a distributor pushing in). Only a plain belt, a chest or one of another underground's belt cells may occupy the gap (`UNDERGROUND_GAP_KINDS`): a belt or underground crosses there, and a chest sits over it. |
| Splitter | 1×1 | Takes items from behind (travelling towards `rot`) and sends them out to both sides. |
| Chest | 1×1 | Conveyor Chest I (5 stack slots) or II (10), from the game data. Accepts from any belt pointing into it, and a distributor or a station's top (or kitchen bottom) output placed directly against it pushes straight in (no belt needed). A station output facing left or right can't: it needs a belt in between. Outputs, round-robin, onto neighbouring belts that don't point into it, leading away or running alongside. Filters choose the sides: when any side has a filter, only filtered sides output (their item) and the others output nothing; a chest with no filters outputs on every side. A chest directly against a station input does nothing. `filters` sets the item sent out of each side (N/E/S/W), so a chest can also cross two item streams. `stock` lists the items the player provisions by hand. |
| Cellar | 1×1 | Fixed at −1,14, off the grid, feeding east into 0,14 (front rules as a distributor's). Holds any of Beer and Wine ★/★★/★★★ (`stock`) and puts them all onto that belt, round-robin. |
| Distributor | 1×1 | Raw-material source that outputs towards `rot`, like a chest with only that side open. Fixed in the wall below the floor (not on it); the cell it feeds takes only a belt or an underground's belt cell (not its gap), neither pointing back (`DISTRIBUTOR_FRONT_KINDS`). |
| Zombie Supply Porter | 1×2 | The game's Zombie Supply Porter (`PORTER` in catalog.js; footprint and build cost from the user: 4 Wooden Plank, 8 Iron Nails, 2 Iron Detail). One is wanted for every 3 supply stations (an info note while there are fewer; `portersFor`). No ports and no link to the supply stations. No power (from the user). |
| Supply station | 1×1 | The game's Supply Station (`conveyor_cell_station`): a sink for "Supply: …" crates, taking items from the neighbouring cell on its `rot` side (one connector, from the prefab). |
| Station | 3×3 (kitchen 2×2) | Fixed orientation (no rotation). `variant` picks the port layout (see below). A station's output behaves like a belt, except that a side output (left or right) can't push straight into a chest. Up to two extensions: one small and one big (`EXTENSIONS`). |

### Confirmed vs assumed

Confirmed in-game: the four station layouts, stations never rotate, belts never cross, the underground gap can be crossed by a belt or another underground's belt cell or hold a chest (only the gap, not the rest of the underground), an underground's four non-gap cells work like plain belts (fed from behind or the side, by chests and distributors too), the factory has 5 fixed zombie carousels (none can be built; 20 zombies at most), the cellar sits at −1,14 feeding a belt at 0,14 and holds beer and wine of each quality (all onto the one belt, so several items need a filtered chest), distribution stations are fixed one row below the floor and a distributor works like a chest with one side open and the cell it feeds takes only a belt or an underground's belt cell (not pointing back; empty is fine), an underground conveyor uses 2 power, belts merge by feeding into another belt's side, splitters output to both sides, chests accept from any side and output round-robin onto every neighbouring belt not pointing into them (including belts running alongside), a station's side output can't feed a chest directly (top outputs can), "Supply: …" items can't enter chests (the editor draws a red arrow on every belt, underground end and splitter whose line carries one into a chest, and `validate()` reports the chest as an error; `Layout.supplyIntoChests`), filtered chests only output on their filtered sides (so an alongside belt on an unfiltered side gets nothing), a chest with no filters outputs on every side, and the station art's overhang being cosmetic.

Assumed, and easy to change in `src/catalog.js` or `src/model.js`:

- A station input takes one item type; ingredients are never mixed on one belt ("no for now").
- Splitters send nothing straight ahead.
- The underground's gap must be floor (`UNDERGROUND_GAP_MUST_BE_FLOOR`).
- A belt merging into the side of an underground's belt cell feeds it, as it would a plain belt ("they work as normal belts").

From the game files but not yet checked in-game:

- The kitchen is 2×2, levels I–II, and its four layouts (below) come from its prefab's colliders and connectors.
- Extension slots: each station has one small and one big slot (`customBuildAreaId` in the game's building data). Smithy: Bellows small; Hammer, Press, Grindstone big. Assembly bench: Auto-hammer, Spinning wheel small; Drill press, Sewing machine, Lathe big. Kitchen: Millstone, Sealing machine small; Stove big.
- Recipe `time` is the game's craft duration in seconds, and `talent` is its `talentLock`, read as the level of the station's worker talent (gear = smithy, hammer = assembly bench, wheat = kitchen) the recipe needs.
- Floor sections (`FLOOR_SECTIONS`): a cell is floor only when the rectangles of the sections in use cover all of it. That reproduces the floor the user confirmed (sections 5–10), except 4 cells by the east wall (33–34, 36–37) that the old floor had and the screenshot shows as wall; sections 1–4 haven't been checked in-game.
- Distribution stations (and the cellar) feeding a section that isn't repaired are assumed unusable, so the editor takes them off.
- The cellar holds only what the player puts in it, and puts it out round-robin like a chest.
- Belt line caps: a belt counts as fed when something outputs into it from directly behind (a turn is the start of a new line), and as continuing when the cell ahead accepts from it.

## Game data — `src/catalog.js`

- **Recipes**: 67, from the game's craft definitions (every conveyor craft except the Bioreactor's Zombie Power): station and levels, inputs and outputs per batch, craft `time` (seconds), worker `talent` level, unlock `tech` and required `extension`. Outputs that scale with a worker perk (Fabric, Clothes, Flour) use the base amount. The 36 recipe ids from the earlier wiki data are unchanged.
- How the data was read (UnityPy, outside the repo): the `GameBalance` MonoBehaviour in `resources.assets` holds the item, world-object, craft, building and tech definitions. Its type tree was generated from the game's `Managed/Assembly-CSharp.dll` (UnityPy's TypeTreeGenerator), and read with a small reader because string-array fields trip UnityPy's own; it decodes exactly to the object's last byte. Crafts with `isConveyorCraft` are the factory recipes; `craftsIn` gives station and levels, `extensionNeedId` the extension, `talentLock` the talent, `duration` the time. The unlock tech is the tech whose `craftsAfterUnlock` lists the craft. Station talents come from the world-object definitions, extension slots from the building definitions.
- **Items**: 7 raw materials (from distributors), 21 chest-only ingredients that no recipe makes (Bronze Nails, Special Wood, Zombie Power, Steel Ingot, Flax, Wheat, Beer, and the crops and wines, with quality tiers ★–★★★ as separate items; Beer and Wine can also come from the cellar, the game's `conveyor_wine_beer_pallet`, where wine is `grape_wine:1`–`:3` and beer has no tiers), 45 factory products, and 17 other items that can sit in chests (including Steel Detail, Engineering Details and Steel Screws, used to repair floor sections).
- **Floor sections** (`FLOOR_SECTIONS`, `FLOOR_GRID`): the factory floor is the `conveyor` world zone (`Assets/AddressableAssets/WorldZones/conveyor.prefab`), whose ten children `gd_conveyor_zone_build_area_<n>` each hold one or more `conveyor_place` BoxCollider build areas. Areas 6, 7, 9 and 10 are active in the prefab; 1–5 and 8 start inactive. In GameBalance the craft `conv_pins_repair_<n>` repairs `conveyor_place_pins_<n>_broken` ("Broken Conveyor Mechanism") and runs `EnableGDPointById("gd_conveyor_zone_build_area_<n>")`; its materials are `repair`. The zone's world origin is (−106.88, −413.1) (its `WorldZones/Data/conveyor.asset`), so grid column = (x + 120) / 0.64 and row = (−392.7 − z) / 0.6 in world units; the carousel build areas land on the carousel rugs in the screenshot, which checks the mapping. Section names are descriptive (the game has none).
- **Station levels**: Assembly bench I–III, Smithy I–II, Kitchen I–II.
- **Factory power** (`POWER_COST`, `ZOMBIE_POWER`): stations and conveyor belts cost 1 each, underground conveyors 2, and chests and Zombie Supply Porters none (from the user); the factory has 5 fixed carousels of 4 zombies (from the user), each zombie giving 7 power (10 with Belt Master, `perk_beltmaster` in the game data), so 140 power at most (200 with Belt Master). Splitters, distributors, the cellar and supply stations cost nothing for now; extensions aren't counted.
- **Worker talents** (`TALENTS`): gear (smithy), hammer (assembly bench), wheat (kitchen), with the game's talent icons.
- **Not modelled yet**: the Bioreactor (makes Zombie Power from 5 Wheat in 10 s). Its prefab is 2 cells wide, but its colliders sit half a cell off the grid the other stations use, so its port cells are unclear.
- **Station layouts** (`variant`), each with 2 inputs and 1 output. 3×3 stations:

```
 out_top_left   out_top_right   in_left       in_right
  ^ . .          . . ^           . . .         . . .
  . . .          . . .          >. . .>       <. . .<
  . . .          . . .          >. . .         . . .<
  ^   ^          ^   ^
```

Kitchen (2×2, `KITCHEN_VARIANTS`):

```
 out_bottom_left   out_bottom_right   in_left   in_right
  v v               v v               >. .>     <. .<
  . .               . .               >. .       . .<
  v                   v
```

## Assets

The floor background is stitched from in-game screenshots (not kept). Station, extension, conveyor and chest art and item and talent icons are extracted from the game files. All art is at the game's scale of 64×48 px per grid unit (`UNIT_PX`). Sprites are lossless WebP (pixel-identical to the extracted PNGs); only the floor background is lossy. Together `assets/` is about 0.6 MB (5.2 MB as PNGs).

- `assets/factory_floor.webp`: four screenshots of the whole factory, stitched into one (the lossless master is `art-src/factory_floor.png`, which isn't deployed), extended 958 px upwards for sections 1–4, which the screenshots show broken or not at all (lossy WebP, quality 90). Its alignment to the grid is fixed in `src/background.js`: grid cell (0,0)'s top-left corner is at image pixel (226, 72). The game builds the floor tiles at runtime, so there's no art to extract: sections 1–4 are drawn with the floor's own repeating pattern (96 × 192 px, the per-pixel median over 13 repeats of clean floor in sections 6, 9 and 10, which drops the hatches and evens out the lamps), phase-locked to the grid, over the sections' rectangles, plus the hazard stripe along the new outer edge (2 px yellow dashes, 8 on/8 off horizontally and 6/6 vertically, 5–6 px outside the edge, as in the screenshots). Done with a throwaway script outside the repo.
- `assets/stations/<type>_<level>_<variant>.webp`: station art (transparent) for every level and all four layouts, rendered from the game's station prefabs (`conveyor_furnace_t1/t2` = Smithy I–II, `conveyor_assemblybench_t1–t3` = Assembly bench I–III, `conveyor_kitchen_t1/t2`). The art is unlit albedo, so it looks brighter than the in-game lighting, and has no extensions attached. `sprites[level][variant].dx/dy` in `STATIONS` places the art relative to the footprint, in in-game pixels, computed from the prefab geometry. The hoppers and chimney that overhang the footprint are purely for looks.
  - How it was rendered (UnityPy, outside the repo): the prefabs live in the Addressables bundles under `StreamingAssets/aa/StandaloneWindows64`. A station body is a 3D mesh (`…-MERGE S_OBJ`) whose submesh *i* is textured with the `…_prt<i+1>` texture that its `Object3DMesh` script references. The meshes and the flat sprites were rasterised with an orthographic projection derived from the grid (1 unit = 100 px across, screen y = 60·height + 80·depth, so a 0.64 × 0.6 unit cell is 64 × 48 px), with a depth test. Skipped: the `_gnd`/`_sh` ground-shadow decals, `Decor Light` (glow and working animation), shadow casters and the blackout mesh.
  - The prefab's four layout roots map to the variants by their connector cells: `Left` = `out_top_left`, `Right` = `out_top_right`, `Up` = `in_left`, `Down` = `in_right`. Footprint cell (x, y) sits at world x = (x + 0.12)·0.64, z = (3 − y)·0.6.
  - Kitchen: its layout roots map the same way, with `Left` = `out_bottom_left` and `Right` = `out_bottom_right`; its 2×2 footprint is cells (1–2, 1–2) of the 3×3 frame.
- `assets/extensions/<type>_<level>_<variant>_<extension>.webp`: each extension as drawn on each station level and layout (116 images). The extension prefab is placed the way the game does it: its build collider is centred on the station's `BenchBuildArea` collider for that slot (`BuildArea.id` = `<station>_small`/`_big`), using the extension's `Left` or `Right` root as the slot's `rotationIndexRequirement` says. Station and extension were rendered together with a depth test, keeping only the extension pixels in front of the station, so the editor just draws them over the station art. All share one 256×200 frame at `EXTENSION_ART_FRAME` (−32, −80) from the footprint's top-left. Checked against a screenshot of a Smithy I with a Hammer: the wheel sits in the same place.
- `assets/extensions/icons/<extension>.webp`: the game's build icons (`i_b_conveyor_*`), used for the extension toggles.
- `assets/conveyors/`: belt pieces (`belt_<dir>_{start,centre,end,single}`), splitters (`splitter_down_*` with arms up and down, `splitter_left_*` with arms left and right; `centre`, one arm capped, or `end`), and undergrounds (`underground_<dir>_{start,center}`, covering the first four cells from the entry). Rendered from the `conveyor_cell`, `conveyor_splitter` and `conveyor_cell_underground` prefabs; offsets in `CONVEYOR_ART`. The belt sprites are packed at half resolution in the game's `Conveyors` atlas, so they are placed by their texture-rect offset. The underground's fifth cell is a plain belt in the game (the prefab builds one there), so it's drawn as one.
- `assets/conveyors/supply_station_<dir>.webp`: the supply station in each input direction, rendered from `conveyor_cell_station` (`CONVEYOR_ART.supply_station`).
- `assets/chests/chest_{1,2}.webp`: Conveyor Chest I and II with all doors closed (`CHEST_LEVELS`, `CHEST_ART_OFFSET`).
- `assets/icons/`: favicons made from the game's red skull (`rskull`, 11×10): `favicon.ico` (16, 32, 48 px), `favicon-32.png` and a 180 px `apple-touch-icon.png` on the app's dark background, scaled nearest-neighbour by whole factors. PNG/ICO rather than WebP for browser support.
- `assets/ui/perk_beltmaster.webp`: the game's Belt Master perk icon (`i_p-beltmaster`).
- `assets/ui/power.webp`: the factory power icon: the game's `gear` text-sprite glyph (grey, from the `FontIcons LazyAtlas` of its TextMeshPro sprite asset, which draws `<sprite name="gear">` in "Factory power" texts), recoloured yellow to match how it appears in-game.
- `assets/ui/talent_{red,orange,green}.webp`: the game's 15 px worker talent icons (gear, hammer, wheat).
- `assets/items/<id>.webp`: one icon per item in `ITEMS` (76×76: the ~32 px game sprite centred in a 38 px slot and scaled 2× nearest-neighbour). Extracted from the game install (Unity 6000.3) with UnityPy, outside the repo:
  - Icon sprites are the `i_*` Sprites in `GraveyardKeeper2_Data/sharedassets0.assets`.
  - The game's item id → English name comes from the `lng_en` localisation MonoBehaviour in `resources.assets`. The item id → icon sprite comes from the item database MonoBehaviour there, where the icon is the last `i_*` string in each item record. Catalog items were matched to game items by English name, e.g. Iron ore = `iron_ore` → `i_1h_ore_metal`, Log = `wood` → `i_wood`, Wood Wedge = `wood_wedge` → `i_spike_1`.
  - Sprites draw their outline in pure blue (`#0000ff`) as a shader marker. The game renders it as `rgb(31,25,24)`, measured against chest screenshots, so it is baked in as that colour. The earlier screenshot cut-outs matched the extracted art pixel for pixel.
  - Items without an icon still fall back to a coloured dot, and a test checks that every item has its file.
  - Quality tiers (Cabbage ★ … Wine ★★★) use the base crop's icon with the game's star-tier badge (`comm-header_2-type_icon-star_tier_<n>`) in the corner.
