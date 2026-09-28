import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Layout, VOID } from '../src/model.js';
import { N, E, S, RECIPES } from '../src/catalog.js';
import { planProduction, chooseRecipe } from '../src/planner/production.js';
import { RouteGrid } from '../src/planner/router.js';
import { Planner, stationInstances } from '../src/planner/planner.js';

const byRecipe = (plan) => Object.fromEntries(plan.recipes.map((r) => [r.recipe, r]));
// The station-count and planner tests run every recipe at 1 craft per minute so
// their numbers don't move with the game's craft times.
const ONE_PER_MINUTE = { craftsPerMinute: Object.fromEntries(RECIPES.map((r) => [r.id, 1])) };
const plan1 = (targets, options = {}) => planProduction(targets, { ...ONE_PER_MINUTE, ...options });

test('production: Supply: Iron needs 8 smithies and one bench', () => {
  const plan = plan1([{ item: 'supply_iron', rate: 1 }]);
  const r = byRecipe(plan);
  assert.equal(r.iron_ingot.stations, 8);
  assert.equal(r.iron_ingot.level, 1);
  assert.equal(r.supply_iron.stations, 1);
  assert.deepEqual(plan.supply, { iron_ore: { rate: 8, source: 'distributor' }, coal: { rate: 8, source: 'distributor' } });
  assert.equal(plan.stations, 9);
  assert.deepEqual(plan.recipes.map((x) => x.recipe), ['iron_ingot', 'supply_iron']); // producers first
});

test('production: shared intermediates add up across targets', () => {
  const plan = plan1([{ item: 'supply_iron', rate: 1 }, { item: 'supply_cutlery_1', rate: 1 }]);
  const r = byRecipe(plan);
  // 8 ingots for Supply: Iron + 1 for the Iron Kit I batch behind Cutlery I.
  assert.equal(r.iron_ingot.output, 9);
  assert.equal(r.iron_kit_1.stations, 1);
  assert.equal(r.supply_cutlery_1.level, 2); // Assembly bench II or better
});

test('production: batch outputs round stations up but keep exact rates', () => {
  const plan = plan1([{ item: 'brick', rate: 3 }]);
  const r = byRecipe(plan);
  assert.equal(r.brick.crafts, 1.5); // 2 bricks per craft
  assert.equal(r.brick.stations, 2);
  assert.deepEqual(plan.supply, { clay: { rate: 3, source: 'distributor' }, coal: { rate: 1.5, source: 'distributor' } });
});

test('production: craft times come from the recipes', () => {
  // Iron Ingot takes 8 s: 7.5 crafts per minute per smithy.
  const r = byRecipe(planProduction([{ item: 'iron_ingot', rate: 15 }]));
  assert.equal(r.iron_ingot.craftsPerStation, 7.5);
  assert.equal(r.iron_ingot.stations, 2);
});

test('production: recipe choice, hand-stocked items and level limits', () => {
  assert.equal(chooseRecipe('wooden_kit_1').id, 'wooden_kit_1'); // log only, no Bronze Nails
  const nails = planProduction([{ item: 'wooden_kit_1', rate: 4 }], { recipeChoice: { wooden_kit_1: 'wooden_kit_1_nails' } });
  assert.equal(nails.supply.bronze_nails.source, 'chest');
  const noDist = planProduction([{ item: 'stone_kit', rate: 1 }], { distributors: new Set() });
  assert.equal(noDist.supply.stone.source, 'chest');
  const capped = planProduction([{ item: 'clay_molds', rate: 1 }], { maxLevel: { smithy: 1 } });
  assert.match(capped.errors[0], /No station level available for Clay Molds/);
});

function grid(w, h) {
  const g = new RouteGrid(w, h);
  g.floor.fill(1);
  return g;
}

test('router: straight route into a station port', () => {
  const g = grid(10, 3);
  const P = g.key(9, 1); // port cell, entered moving east
  g.block(P);
  const res = g.route({ starts: [{ k: g.key(0, 1), d: E, cost: 0, origin: { type: 'port' } }], targets: new Map([[P, { mask: 1 << E, end: { type: 'port' } }]]), allow: new Set(), goalCells: [P] });
  assert.equal(res.steps.length, 9);
  assert.ok(res.steps.every((s) => s.act === E));
});

test('router: crosses a belt line with an underground conveyor', () => {
  const g = grid(12, 7);
  for (let y = 0; y < 7; y++) { const k = g.key(5, y); g.occ[k] = 2; g.rot[k] = S; } // wall of belts
  const P = g.key(11, 3);
  g.block(P);
  const res = g.route({ starts: [{ k: g.key(0, 3), d: E, cost: 0, origin: { type: 'port' } }], targets: new Map([[P, { mask: 1 << E, end: { type: 'port' } }]]), allow: new Set(), goalCells: [P] });
  assert.ok(res, 'route found');
  const ug = res.steps.find((s) => s.act >= 4);
  assert.ok(ug, 'uses an underground');
  assert.equal(g.xy(ug.k)[0] + 2, 5, 'its gap sits on the belt line');
});

test('router: flags a route that runs into itself', () => {
  const g = grid(8, 8);
  // Hand-made path: a belt at (3,3), then an underground whose body covers (3,3).
  const path = { start: { origin: { type: 'port' } }, goal: { type: 'port' }, steps: [
    { k: g.key(3, 3), din: E, act: N },
    { k: g.key(3, 1), din: S, act: 4 + S },
  ] };
  assert.deepEqual(path.steps.length, 2);
  assert.ok(g.conflicts(path).includes(g.key(3, 3)));
});

test('router: chests feed neighbouring belts on the sides they output from', () => {
  const g = grid(6, 6);
  const q = g.key(2, 2);
  const east = g.key(3, 2);
  g.occ[east] = 2; g.rot[east] = S;                            // runs alongside the chest
  assert.equal(g.chestOk(q, null, new Set()), false);         // an unfiltered chest would feed it
  assert.equal(g.chestOk(q, null, new Set(), true), true);    // a chest filtered to other sides wouldn't
  g.rot[east] = 3;                                             // points into the chest (W)
  assert.equal(g.chestOk(q, null, new Set()), true);
  g.occ[east] = 0; g.rot[east] = -1;
  g.addChestAt(q);                                             // no filters: outputs on every side
  assert.equal(g.beltOk(east, S, new Set()), false);
  assert.equal(g.beltOk(east, E, new Set()), false);
  assert.equal(g.beltOk(east, 3, new Set()), true);
  const h = grid(6, 6);
  h.addChestAt(q, 1 << N);                                     // filtered to its north side only
  assert.equal(h.beltOk(east, S, new Set()), true);
  assert.equal(h.beltOk(h.key(2, 1), E, new Set()), false);
});

function smallFactory() {
  const l = Layout.blank(20, 14);
  for (let x = 0; x < 20; x++) l.setTerrain(x, 13, VOID);
  ['stone', 'clay', 'coal', 'iron_ore'].forEach((m, i) => l.add({ kind: 'distributor', x: 2 + i * 4, y: 12, rot: N, material: m }));
  return l;
}

function outLayoutPort(station) {
  const l = Layout.blank(40, 40);
  return l.ports(station).find((p) => p.kind === 'out');
}

const distributorsOf = (l) => new Set(l.entities.filter((e) => e.kind === 'distributor').map((e) => e.material));

function runPlan(layout, targets, iterations, seed = 1) {
  const prod = plan1(targets, { distributors: distributorsOf(layout) });
  const pl = new Planner(layout, prod, { seed });
  pl.init();
  for (let i = 0; i < iterations; i += 50) pl.step(50, i / iterations);
  const res = pl.result();
  const out = layout.clone();
  for (const e of res.entities) out.add(e);
  return { res, out, prod };
}

test('planner: builds a valid layout for a small plan', () => {
  const { res, out } = runPlan(smallFactory(), [{ item: 'building_kit_1', rate: 1 }], 300);
  assert.deepEqual(res.failures, []);
  assert.deepEqual(out.validate().filter((i) => i.severity !== 'info').map((i) => i.message), []);
  assert.equal(res.stats.stations, 3); // stone kit + brick + building kit
  assert.ok(res.entities.every((e) => e.planned && !e.locked));
  // The output lands in a chest, and each station records its port assignment.
  assert.ok(res.entities.some((e) => e.kind === 'chest' && e.role === 'output'));
  const kit = res.entities.find((e) => e.recipe === 'building_kit_1');
  // The output chest sits directly against the station's output: no belt in between.
  const outChest = res.entities.find((e) => e.kind === 'chest' && e.role === 'output');
  const port = outLayoutPort(kit);
  assert.deepEqual([outChest.x, outChest.y], [port.nx, port.ny]);
  assert.deepEqual([...kit.inputs].filter(Boolean).sort(), ['brick', 'stone_kit']);
});

test('planner: Supply: Iron on the real factory floor routes everything', () => {
  const layout = Layout.fromJSON(fs.readFileSync(new URL('../factory.json', import.meta.url), 'utf8'));
  // The search is seeded and noisy: the better of two seeds must route everything.
  const runs = [1, 2].map((seed) => runPlan(layout, [{ item: 'supply_iron', rate: 1 }], 1500, seed));
  const { res, out } = runs.find((r) => !r.res.failures.length) ?? runs[0];
  assert.deepEqual(res.failures, []);
  assert.deepEqual(out.validate().filter((i) => i.severity !== 'info').map((i) => i.message), []);
  assert.equal(res.stats.stations, 9);
  // Over the built-in 112 power, so the plan brings its own carousels.
  assert.ok(res.stats.power > 112 && res.stats.carousels > 0 && res.stats.carouselsNotPlaced === 0, JSON.stringify(res.stats));
});

test('planner: stationInstances splits fractional crafts over stations', () => {
  const prod = plan1([{ item: 'brick', rate: 3 }]);
  const st = stationInstances(prod);
  assert.equal(st.length, 2);
  assert.deepEqual(st.map((s) => s.outRate), [2, 1]);
});

test('planner: places a 2x2 kitchen and routes it', () => {
  const l = smallFactory();
  l.entities.find((e) => e.material === 'stone').material = 'sand';
  const { res, out } = runPlan(l, [{ item: 'supply_preserves_1', rate: 1 }], 300);
  assert.deepEqual(res.failures, []);
  assert.deepEqual(out.validate().filter((i) => i.severity !== 'info').map((i) => i.message), []);
  assert.ok(res.entities.some((e) => e.kind === 'station' && e.type === 'kitchen'));
});

test('planner: a "Supply: ..." output ends in a supply station near the top-right corner', () => {
  const layout = Layout.fromJSON(fs.readFileSync(new URL('../factory.json', import.meta.url), 'utf8'));
  const { res, out } = runPlan(layout, [{ item: 'supply_iron', rate: 1 }], 600);
  const ss = res.entities.filter((e) => e.kind === 'supply_station');
  assert.equal(ss.length, 1);
  assert.ok(!res.entities.some((e) => e.kind === 'chest' && e.role === 'output'), 'no output chest');
  const corner = new Planner(layout, plan1([{ item: 'supply_iron', rate: 1 }]), {}).corner;
  assert.ok(Math.abs(corner.x - ss[0].x) + Math.abs(corner.y - ss[0].y) <= 6, `supply station at ${ss[0].x},${ss[0].y}`);
  assert.deepEqual(out.validate().filter((i) => i.severity !== 'info').map((i) => i.message), []);
});

test('model: a supply station takes items on its input side only', () => {
  const l = Layout.blank(5, 5);
  const ss = l.add({ kind: 'supply_station', x: 2, y: 2, rot: S });
  assert.equal(l.acceptsFrom(ss, 2, 3), true);
  assert.equal(l.acceptsFrom(ss, 1, 2), false);
});
