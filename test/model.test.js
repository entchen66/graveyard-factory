import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Layout, FLOOR, VOID } from '../src/model.js';
import {
  N, E, S, W, RECIPES, ITEM_BY_ID, STATIONS, EXTENSIONS, CONVEYOR_ART, CHEST_LEVELS, TALENTS, CAROUSEL_ART, BELT_MASTER_ICON, POWER_ICON, stationVariants, extensionsFor, extensionArt,
} from '../src/catalog.js';
import { factoryFloor, DISTRIBUTORS } from '../src/floor.js';

const portsOf = (l, e) => l.ports(e).map((p) => `${p.kind}:${p.nx},${p.ny}`).sort();

test('each station layout variant has 2 inputs and 1 output where described', () => {
  const l = Layout.blank(10, 10);
  const at = (variant) => portsOf(l, { kind: 'station', type: 'smithy', level: 1, variant, x: 3, y: 3, rot: N });
  // Footprint is x 3..5, y 3..5.
  assert.deepEqual(at('out_top_left'), ['in:3,6', 'in:5,6', 'out:3,2']);
  assert.deepEqual(at('out_top_right'), ['in:3,6', 'in:5,6', 'out:5,2']);
  assert.deepEqual(at('in_left'), ['in:2,4', 'in:2,5', 'out:6,4']);
  assert.deepEqual(at('in_right'), ['in:6,4', 'in:6,5', 'out:2,4']);
});

test('stations ignore rotation and default to out_top_left', () => {
  const l = Layout.blank(10, 10);
  const st = l.add({ kind: 'station', type: 'smithy', level: 1, x: 3, y: 3, rot: E });
  assert.equal(st.variant, 'out_top_left');
  assert.equal(st.rot, undefined);
  assert.deepEqual(portsOf(l, st), ['in:3,6', 'in:5,6', 'out:3,2']);
});

test('underground conveyor: 1x5, crossable gap, ports at the ends', () => {
  const l = Layout.blank(10, 10);
  const u = l.add({ kind: 'underground', x: 2, y: 4, rot: E }); // cells 2..6, gap at 4
  assert.deepEqual(l.footprint(u), [[2, 4], [3, 4], [5, 4], [6, 4]]);
  assert.equal(l.entityAt(4, 4), null);
  assert.equal(l.gapAt(4, 4), u);
  assert.deepEqual(portsOf(l, u), ['in:1,4', 'out:7,4']);
  // A belt may cross the gap; nothing else may.
  assert.equal(l.canPlace({ kind: 'belt', x: 4, y: 4 }).ok, true);
  assert.equal(l.canPlace({ kind: 'chest', x: 4, y: 4 }).ok, false);
  assert.equal(l.canPlace({ kind: 'splitter', x: 4, y: 4 }).ok, false);
  assert.equal(l.canPlace({ kind: 'belt', x: 3, y: 4 }).ok, false);
  // Crossing belt line north -> south through the gap is valid.
  for (let y = 2; y <= 6; y++) l.add({ kind: 'belt', x: 4, y, rot: S });
  l.add({ kind: 'belt', x: 1, y: 4, rot: E });
  assert.deepEqual(l.validate(), []);
  // Overlapping existing pieces is rejected.
  assert.equal(l.canPlace({ kind: 'underground', x: 0, y: 0, rot: E }).ok, true);
  assert.equal(l.canPlace({ kind: 'underground', x: 4, y: 7, rot: N }).ok, false);
  // Feeding the underground from the side warns.
  l.add({ kind: 'belt', x: 3, y: 5, rot: N });
  assert.ok(l.validate().some((i) => /Belt at 3,5 feeds Underground conveyor .* from a side with no input/.test(i.message)));
});

test('underground gap must be floor; off-floor cells under the body block placement', () => {
  const l = Layout.blank(10, 3);
  l.setTerrain(4, 1, VOID);
  assert.equal(l.canPlace({ kind: 'underground', x: 2, y: 1, rot: E }).ok, false); // gap off the floor
  l.setTerrain(4, 1, FLOOR);
  l.setTerrain(6, 1, VOID);
  assert.equal(l.canPlace({ kind: 'underground', x: 2, y: 1, rot: E }).ok, false); // body off the floor
});

test('splitter takes from behind and outputs to both sides', () => {
  const l = Layout.blank(5, 5);
  const sp = l.add({ kind: 'splitter', x: 2, y: 2, rot: N });
  assert.deepEqual(portsOf(l, sp), ['in:2,3', 'out:1,2', 'out:3,2']);
  l.add({ kind: 'belt', x: 2, y: 3, rot: N });
  l.add({ kind: 'belt', x: 2, y: 1, rot: S }); // feeds splitter from the front
  const msgs = l.validate().map((i) => i.message);
  assert.ok(msgs.some((m) => /Belt at 2,1 feeds Conveyor splitter/.test(m)), msgs.join('\n'));
  assert.equal(msgs.length, 1);
});

test('chests accept from and output to any side', () => {
  const l = Layout.blank(5, 5);
  l.add({ kind: 'chest', x: 2, y: 2, stock: ['coal'], filters: { E: 'coal', W: 'iron_ore' } });
  l.add({ kind: 'belt', x: 2, y: 1, rot: S });  // into chest from the north
  l.add({ kind: 'belt', x: 2, y: 3, rot: N });  // into chest from the south
  l.add({ kind: 'belt', x: 3, y: 2, rot: E });  // out east
  l.add({ kind: 'belt', x: 1, y: 2, rot: W });  // out west
  assert.deepEqual(l.validate(), []);
  l.add({ kind: 'chest', x: 0, y: 0, filters: { Q: 'coal' } });
  assert.ok(l.validate().some((i) => /unknown filter side "Q"/.test(i.message)));
});

test('station output can push straight into a chest; chest cannot feed a station input', () => {
  const l = Layout.blank(8, 8);
  // out_top_left at (2,2): inputs below (2,5) and (4,5), output above (2,1).
  l.add({ kind: 'station', type: 'smithy', level: 1, x: 2, y: 2, recipe: 'iron_ingot' });
  l.add({ kind: 'chest', x: 2, y: 1 });
  assert.deepEqual(l.validate(), []);
  l.add({ kind: 'chest', x: 4, y: 5, stock: ['coal'] });
  const msgs = l.validate().map((i) => i.message);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Chest \(Coal\) at 4,5 can't feed Smithy I at 2,2 directly/);
});

test('older files migrate: chest material -> stock, station rotation dropped', () => {
  const l = Layout.fromJSON({ terrain: ['.....'], entities: [
    { id: 1, kind: 'chest', x: 0, y: 0, rot: 1, material: 'coal' },
    { id: 2, kind: 'belt', x: 4, y: 0 },
  ] });
  assert.deepEqual(l.getEntity(1), { id: 1, kind: 'chest', x: 0, y: 0, level: 1, stock: ['coal'], filters: {}, locked: true });
  assert.equal(l.getEntity(2).rot, 0);
});

test('recipe data is consistent', () => {
  for (const r of RECIPES) {
    for (const id of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) assert.ok(ITEM_BY_ID[id], `${r.id}: unknown item ${id}`);
    assert.ok(Object.keys(r.inputs).length <= 2, `${r.id} needs more than 2 input types`);
    assert.ok(r.levels.every((lv) => STATIONS[r.station].levels.includes(lv)), `${r.id}: bad level`);
  }
  assert.equal(RECIPES.length, 67);
  for (const r of RECIPES) {
    assert.ok(r.time > 0 && r.talent > 0, `${r.id}: time and talent from the game data`);
    if (r.extension) assert.equal(EXTENSIONS[r.extension]?.station, r.station, `${r.id}: extension ${r.extension}`);
  }
});

test('kitchen is 2x2 with inputs on top or on a side', () => {
  const l = Layout.blank(8, 8);
  const k = l.add({ kind: 'station', type: 'kitchen', level: 1, x: 2, y: 2 });
  assert.equal(k.variant, 'out_bottom_left');
  assert.equal(l.footprint(k).length, 4);
  const at = (p) => [p.kind, p.nx, p.ny];
  assert.deepEqual(l.ports(k).map(at), [['in', 2, 1], ['in', 3, 1], ['out', 2, 4]]);
  l.update(k.id, { variant: 'in_right' });
  assert.deepEqual(l.ports(k).map(at), [['in', 4, 2], ['in', 4, 3], ['out', 1, 2]]);
});

test('station art covers every level and layout, and the files exist', () => {
  for (const [type, def] of Object.entries(STATIONS)) {
    if (!def.sprites) continue;
    assert.deepEqual(Object.keys(def.sprites).map(Number), def.levels, `${type}: art per level`);
    for (const byVariant of Object.values(def.sprites)) {
      assert.deepEqual(Object.keys(byVariant).sort(), Object.keys(stationVariants(type)).sort(), `${type}: art per layout`);
      for (const s of Object.values(byVariant)) assert.ok(fs.existsSync(new URL(`../${s.src}`, import.meta.url)), `missing ${s.src}`);
    }
  }
});

test('every item has an icon file', () => {
  for (const item of Object.values(ITEM_BY_ID)) {
    assert.ok(fs.existsSync(new URL(`../${item.icon}`, import.meta.url)), `${item.id}: missing ${item.icon}`);
  }
});

test('canPlace rejects off-floor cells, overlap and out of bounds', () => {
  const l = Layout.blank(6, 6);
  l.setTerrain(2, 2, VOID);
  l.setTerrain(5, 5, VOID);
  l.add({ kind: 'belt', x: 0, y: 0, rot: E });
  assert.equal(l.canPlace({ kind: 'belt', x: 2, y: 2 }).ok, false);
  assert.equal(l.canPlace({ kind: 'belt', x: 5, y: 5 }).ok, false);
  assert.equal(l.canPlace({ kind: 'belt', x: 0, y: 0 }).ok, false);
  assert.equal(l.canPlace({ kind: 'station', type: 'smithy', x: 4, y: 0 }).ok, false);
  assert.equal(l.canPlace({ kind: 'station', type: 'smithy', x: 3, y: 3 }).ok, false); // covers 5,5 void
  assert.equal(l.canPlace({ kind: 'station', type: 'smithy', x: 3, y: 0 }).ok, true);
});

test('JSON round trip preserves terrain and entities', () => {
  const l = factoryFloor();
  l.add({ kind: 'station', type: 'smithy', level: 1, variant: 'in_left', x: 10, y: 20, recipe: 'iron_ingot' });
  l.add({ kind: 'chest', x: 5, y: 20, stock: ['coal'], filters: { E: 'coal' } });
  l.add({ kind: 'underground', x: 5, y: 25, rot: E });
  const copy = Layout.fromJSON(JSON.stringify(l.toJSON()));
  assert.equal(copy.terrainToText(), l.terrainToText());
  assert.deepEqual(copy.entities, l.entities);
  assert.equal(copy.nextId, l.nextId);
});

test('terrain text: short rows are padded; old walls and columns load as outside', () => {
  const l = Layout.blank(1, 1);
  l.setTerrainFromText('...#\n._oO\n\n');
  assert.equal(l.width, 4);
  assert.equal(l.height, 2);
  assert.equal(l.terrainToText(), '... \n.   ');
  assert.throws(() => l.setTerrainFromText('..?'), /Unknown terrain/);
});

test('resize shifts entities and drops those outside', () => {
  const l = Layout.blank(5, 5);
  const a = l.add({ kind: 'belt', x: 0, y: 0 });
  const b = l.add({ kind: 'belt', x: 4, y: 4 });
  l.resize({ left: 2, top: 1, right: -3 });
  assert.equal(l.width, 4);
  assert.equal(l.height, 6);
  assert.deepEqual([l.getEntity(a.id).x, l.getEntity(a.id).y], [2, 1]);
  assert.equal(l.getEntity(b.id), null);
  assert.equal(l.getTerrain(0, 0), VOID);
  assert.equal(l.getTerrain(2, 1), FLOOR);
});

test('validation flags common problems', () => {
  const l = Layout.blank(8, 8);
  l.setTerrain(7, 0, VOID);
  l.add({ kind: 'belt', x: 6, y: 0, rot: E });            // runs off the floor
  l.add({ kind: 'belt', x: 0, y: 7, rot: E });
  l.add({ kind: 'belt', x: 1, y: 7, rot: W });            // head-on
  l.add({ kind: 'distributor', x: 0, y: 5, rot: N });     // no material
  l.add({ kind: 'station', type: 'smithy', level: 1, x: 2, y: 2, recipe: 'clay_molds' }); // needs level II
  l.add({ kind: 'belt', x: 3, y: 1, rot: S });            // feeds station top side (output only)
  l.add({ kind: 'station', type: 'smithy', level: 3, x: 5, y: 4 });                     // smithy has no level III
  const msgs = l.validate().map((i) => `${i.severity}: ${i.message}`);
  const has = (re) => assert.ok(msgs.some((m) => re.test(m)), `missing ${re}\n${msgs.join('\n')}`);
  has(/warning: Belt at 6,0 runs off the factory floor/);
  has(/warning: Belts at 0,7 and 1,7 face each other/);
  has(/warning: Distribution station at 0,5 has no material/);
  has(/error: Smithy I .* cannot run recipe "clay_molds"/);
  has(/error: Smithy has no level 3/);
  has(/warning: Belt at 3,1 feeds Smithy I .* from a side with no input/);
});

test('factory floor is valid and matches factory.json', () => {
  const floor = factoryFloor();
  assert.deepEqual(floor.validate(), []);
  assert.equal(floor.entities.length, DISTRIBUTORS.length);
  const exported = Layout.fromJSON(fs.readFileSync(new URL('../factory.json', import.meta.url), 'utf8'));
  assert.equal(floor.terrainToText(), exported.terrainToText());
});

test('extensions: one per slot, only for their station, and recipes need theirs', () => {
  const l = Layout.blank(12, 6);
  const msgs = () => l.validate().filter((i) => i.severity === 'error').map((i) => i.message);
  const s = l.add({ kind: 'station', type: 'smithy', level: 1, x: 1, y: 1, recipe: 'iron_kit_1' });
  assert.deepEqual(s.extensions, ['hammer']); // added for the recipe
  l.update(s.id, { extensions: [] });
  assert.match(msgs()[0], /needs the Hammer extension/);
  l.update(s.id, { extensions: ['bellows', 'hammer'] });
  assert.deepEqual(msgs(), []);
  l.update(s.id, { extensions: ['hammer', 'press'] });
  assert.match(msgs()[0], /Hammer and Press need the same big slot/);
  l.update(s.id, { extensions: ['hammer', 'lathe'] });
  assert.match(msgs()[0], /can't take the Lathe extension/);
});

test('older files migrate: stations get the extension their recipe needs', () => {
  const l = Layout.fromJSON({ terrain: ['....', '....', '....'], entities: [
    { id: 1, kind: 'station', type: 'assembly_bench', level: 2, x: 0, y: 0, recipe: 'zombie_mechanism' },
  ] });
  assert.deepEqual(l.getEntity(1).extensions, ['lathe']);
});

test('conveyor, chest, talent and extension art files exist', () => {
  const exists = (src) => assert.ok(fs.existsSync(new URL(`../${src}`, import.meta.url)), `missing ${src}`);
  for (const [kind, byDir] of Object.entries(CONVEYOR_ART)) {
    for (const [dir, shapes] of Object.entries(byDir)) {
      if (Array.isArray(shapes)) exists(`assets/conveyors/${kind}_${dir}.webp`); // one piece per direction
      else for (const shape of Object.keys(shapes)) exists(`assets/conveyors/${kind}_${dir}_${shape}.webp`);
    }
  }
  for (const c of Object.values(CHEST_LEVELS)) exists(c.art);
  for (const t of Object.values(TALENTS)) exists(t.icon);
  exists(CAROUSEL_ART.src);
  exists(BELT_MASTER_ICON);
  exists(POWER_ICON);
  for (const [type, def] of Object.entries(STATIONS)) {
    for (const id of extensionsFor(type)) {
      exists(EXTENSIONS[id].icon);
      for (const level of def.levels) for (const variant of Object.keys(stationVariants(type))) exists(extensionArt({ type, level, variant }, id));
    }
  }
});

test('render order: conveyors first, then the rest, each top to bottom', async () => {
  const { drawOrder } = await import('../src/render.js');
  const st = { id: 1, kind: 'station', type: 'smithy', level: 1, variant: 'out_top_left', x: 2, y: 2 }; // rows 2-4
  const above = { id: 2, kind: 'belt', x: 3, y: 1, rot: 1 };
  const beside = { id: 3, kind: 'belt', x: 5, y: 3, rot: 1 };
  const below = { id: 4, kind: 'belt', x: 3, y: 5, rot: 1 };
  const chestTop = { id: 5, kind: 'chest', x: 0, y: 0 };
  const chestLow = { id: 6, kind: 'chest', x: 0, y: 6 };
  assert.deepEqual(drawOrder([chestLow, below, st, beside, chestTop, above]).map((e) => e.id), [2, 3, 4, 5, 1, 6]);
});

test('a station side output needs a belt before a chest; a top output does not', () => {
  const warns = (l) => l.validate().filter((i) => i.severity === 'warning').map((i) => i.message);
  const side = Layout.blank(8, 6);
  side.add({ kind: 'station', type: 'smithy', level: 1, variant: 'in_left', x: 1, y: 1, recipe: 'brick' }); // output E at (3,2)
  side.add({ kind: 'chest', x: 4, y: 2 });
  assert.ok(warns(side).some((m) => /side output can't push straight into Chest/.test(m)), warns(side).join('\n'));
  const top = Layout.blank(8, 6);
  top.add({ kind: 'station', type: 'smithy', level: 1, variant: 'out_top_left', x: 1, y: 2, recipe: 'brick' }); // output N at (1,2)
  top.add({ kind: 'chest', x: 1, y: 1 });
  assert.ok(!warns(top).some((m) => /side output/.test(m)));
});

test('factory power: 1 per station, belt and chest', () => {
  const l = Layout.blank(12, 8);
  l.add({ kind: 'station', type: 'smithy', level: 1, x: 1, y: 1 });
  l.add({ kind: 'belt', x: 5, y: 1, rot: E });
  l.add({ kind: 'belt', x: 6, y: 1, rot: E });
  l.add({ kind: 'chest', x: 7, y: 1 });
  l.add({ kind: 'splitter', x: 8, y: 3, rot: E });       // no power listed
  l.add({ kind: 'distributor', x: 0, y: 7, rot: N, material: 'coal' });
  assert.equal(l.power(), 4);
});

test('power supply: 4 built-in carousels of 4 zombies, 7 power each (10 with Belt Master)', async () => {
  const { powerSupply } = await import('../src/model.js');
  assert.deepEqual(powerSupply(112, 0, false), { used: 112, perZombie: 7, carousels: 4, available: 112, zombies: 16, carouselsNeeded: 4, missingCarousels: 0 });
  assert.equal(powerSupply(113, 0, false).missingCarousels, 1);
  assert.equal(powerSupply(113, 1, false).missingCarousels, 0);
  assert.equal(powerSupply(160, 0, true).missingCarousels, 0);
  assert.equal(powerSupply(161, 0, true).zombies, 17);
});

test('carousels are 3x3 with no ports; too much power is a warning', () => {
  const l = Layout.blank(40, 40);
  const c = l.add({ kind: 'carousel', x: 1, y: 1 });
  assert.equal(l.footprint(c).length, 9);
  assert.deepEqual(l.ports(c), []);
  for (let x = 0; x < 40; x++) for (let y = 10; y < 13; y++) l.add({ kind: 'belt', x, y, rot: E }); // 120 power
  const warn = () => l.validate().filter((i) => i.severity === 'warning' && /carousel/.test(i.message));
  assert.equal(warn().length, 0);                     // 4 built in + 1 placed = 140 power
  l.remove(c.id);
  assert.match(warn()[0].message, /add 1 carousel/);  // 112 < 120
  l.beltMaster = true;
  assert.equal(warn().length, 0);                     // 160 with Belt Master
});
