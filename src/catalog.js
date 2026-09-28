// @ts-check
// Game data: materials, items, stations and recipes.
// Everything the editor and (later) the planner know about the game lives here,
// so adjusting to the real game is a matter of editing this file only.

/** @typedef {import('./types.js').Dir} Dir */
/** @typedef {import('./types.js').DirInfo} DirInfo */
/** @typedef {import('./types.js').Entity} Entity */
/** @typedef {import('./types.js').EntitySpec} EntitySpec */
/** @typedef {import('./types.js').EntityKind} EntityKind */
/** @typedef {import('./types.js').StationType} StationType */
/** @typedef {import('./types.js').StationVariant} StationVariant */
/** @typedef {import('./types.js').StationDef} StationDef */
/** @typedef {import('./types.js').Item} Item */
/** @typedef {import('./types.js').Recipe} Recipe */
/** @typedef {import('./types.js').Extension} Extension */
/** @typedef {import('./types.js').Sprite} Sprite */
/** @typedef {import('./types.js').Cell} Cell */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {[number, number]} Offset */
/** @typedef {{ name: string, rotatable?: boolean, hasMaterial?: boolean }} EntityKindDef */
/** @typedef {{ name: string, icon: string }} TalentDef */
/** @typedef {{ name: string, slots: number, art: string }} ChestLevel */

// Directions, clockwise. Grid y grows downward, so "bottom of the layout" = high y.
export const N = 0, E = 1, S = 2, W = 3;
// In-game pixels per grid unit (units are not square on screen).
export const UNIT_PX = { w: 64, h: 48 };

/** @type {DirInfo[]} */
export const DIRS = [
  { id: N, name: 'N', dx: 0, dy: -1 },
  { id: E, name: 'E', dx: 1, dy: 0 },
  { id: S, name: 'S', dx: 0, dy: 1 },
  { id: W, name: 'W', dx: -1, dy: 0 },
];

// Raw materials: supplied by distribution stations or manually provisioned chests.
/** @type {Item[]} */
export const RAW_MATERIALS = [
  { id: 'stone', name: 'Stone', color: '#8d8d8d' },
  { id: 'iron_ore', name: 'Iron ore', color: '#b0643c' },
  { id: 'coal', name: 'Coal', color: '#2e2e2e' },
  { id: 'clay', name: 'Clay', color: '#c98a5a' },
  { id: 'sand', name: 'Sand', color: '#e2cb8a' },
  { id: 'marble', name: 'Marble', color: '#ece8df' },
  { id: 'wood_log', name: 'Log', color: '#7a5530' },
];

// Ingredients no factory recipe produces: they must be stocked in chests by hand.
/** @type {Item[]} */
export const EXTERNAL_ITEMS = [
  { id: 'bronze_nails', name: 'Bronze Nails', color: '#b8793b' },
  { id: 'special_wood', name: 'Special Wood', color: '#5e3b22' },
  { id: 'zombie_power', name: 'Zombie Power', color: '#7fc241' },
  { id: 'steel_ingot', name: 'Steel Ingot', color: '#7c8a99' },
  ...Object.entries({
    flax: 'Flax', wheat: 'Wheat', carrot: 'Carrot', beet: 'Beet', beer: 'Beer',
    cabbage_1: 'Cabbage ★', cabbage_2: 'Cabbage ★★', cabbage_3: 'Cabbage ★★★',
    onion_1: 'Onion ★', onion_2: 'Onion ★★', onion_3: 'Onion ★★★',
    pumpkin_1: 'Pumpkin ★', pumpkin_2: 'Pumpkin ★★', pumpkin_3: 'Pumpkin ★★★',
    wine_1: 'Wine ★', wine_2: 'Wine ★★', wine_3: 'Wine ★★★',
  }).map(([id, name]) => ({ id, name, color: hashColor(id) })),
];

// Factory products (intermediate and final). Names are the game's English ones.
const PRODUCT_NAMES = {
  iron_ingot: 'Iron Ingot', iron_kit_1: 'Iron Kit I', iron_kit_2: 'Iron Kit II',
  brick: 'Brick', glass: 'Glass', tableware: 'Tableware', glass_containers: 'Glass Containers',
  clay_molds: 'Clay Molds', engineering_kit: 'Engineering Kit', lens: 'Lens',
  wooden_kit_1: 'Wooden Kit I', wooden_kit_2: 'Wooden Kit II', stone_kit: 'Stone Kit', marble_kit: 'Marble Kit',
  crate: 'Crate', building_kit_1: 'Building Kit I', building_kit_2: 'Building Kit II',
  furniture_kit_1: 'Furniture Kit I', furniture_kit_2: 'Furniture Kit II',
  sculpture_kit_1: 'Sculpture Kit I', sculpture_kit_2: 'Sculpture Kit II', zombie_mechanism: 'Zombie Mechanism',
  supply_iron: 'Supply: Iron', supply_building_materials_1: 'Supply: Building materials I',
  supply_building_materials_2: 'Supply: Building materials II', supply_iron_tools: 'Supply: Iron Tools',
  supply_steel_tools: 'Supply: Steel Tools', supply_cutlery_1: 'Supply: Cutlery I', supply_cutlery_2: 'Supply: Cutlery II',
  supply_kitchen_utensils: 'Supply: Kitchen Utensils', supply_furniture_1: 'Supply: Furniture I',
  supply_furniture_2: 'Supply: Furniture II', supply_appliances_1: 'Supply: Appliances I',
  supply_appliances_2: 'Supply: Appliances II', supply_engineering_mechanism: 'Supply: Engineering Mechanism',
  fabric: 'Fabric', supply_fabric: 'Supply: Fabric', supply_clothes_1: 'Supply: Clothes I', supply_clothes_2: 'Supply: Clothes II',
  supply_vegetables: 'Supply: Vegetables', supply_beer: 'Supply: Beer', supply_wine: 'Supply: Wine',
  supply_flour: 'Supply: Flour Sack', supply_preserves_1: 'Supply: Preserves I', supply_preserves_2: 'Supply: Preserves II',
};
/** @type {Item[]} */
export const PRODUCTS = Object.entries(PRODUCT_NAMES).map(([id, name]) => ({ id, name, color: hashColor(id) }));

// Other items that can sit in chests but aren't used by factory recipes (yet).
const OTHER_NAMES = {
  wood_wedge: 'Wood Wedge', wooden_plank: 'Wooden Plank', oiled_plank: 'Oiled Plank',
  reinforced_plank: 'Reinforced Plank', wooden_beam: 'Wooden Beam', piece_of_stone: 'Piece of Stone',
  carved_stone: 'Carved Stone', polished_marble: 'Polished Marble', bronze_detail: 'Bronze Detail',
  polished_bronze: 'Polished Bronze', bronze_gear: 'Bronze Gear', iron_nails: 'Iron Nails',
  iron_detail: 'Iron Detail', advanced_detail: 'Advanced Detail',
};
/** @type {Item[]} */
export const OTHER_ITEMS = Object.entries(OTHER_NAMES).map(([id, name]) => ({ id, name, color: hashColor(id) }));

/** @type {Item[]} */
export const ITEMS = [...RAW_MATERIALS, ...EXTERNAL_ITEMS, ...PRODUCTS, ...OTHER_ITEMS];

// In-game icons (76x76, extracted from the game files) in assets/items/<id>.webp.
// Every item has one; a new item needs its icon added too (see README "Assets").
for (const item of ITEMS) item.icon = `assets/items/${item.id}.webp`;
/** @type {Record<string, Item>} */
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// Port layouts of a 3x3 station, before rotation. (x, y) is the footprint cell
// holding the port, dir is the side it faces. Inputs accept items from a belt in
// the neighbouring cell pointing into the station; the output pushes items into
// the neighbouring cell.
//
//   out_top_left   out_top_right   in_left        in_right
//    ^ . .          . . ^           . . .          . . .
//    . . .          . . .          >. . .>        <. . .<
//    . . .          . . .          >. . .          . . .<
//    ^   ^          ^   ^
/** @type {Record<string, StationVariant>} */
export const STATION_VARIANTS = {
  out_top_left: {
    name: 'Inputs bottom, output top-left',
    ports: [
      { kind: 'in', x: 0, y: 2, dir: S }, { kind: 'in', x: 2, y: 2, dir: S },
      { kind: 'out', x: 0, y: 0, dir: N },
    ],
  },
  out_top_right: {
    name: 'Inputs bottom, output top-right',
    ports: [
      { kind: 'in', x: 0, y: 2, dir: S }, { kind: 'in', x: 2, y: 2, dir: S },
      { kind: 'out', x: 2, y: 0, dir: N },
    ],
  },
  in_left: {
    name: 'Inputs left, output right',
    ports: [
      { kind: 'in', x: 0, y: 1, dir: W }, { kind: 'in', x: 0, y: 2, dir: W },
      { kind: 'out', x: 2, y: 1, dir: E },
    ],
  },
  in_right: {
    name: 'Inputs right, output left',
    ports: [
      { kind: 'in', x: 2, y: 1, dir: E }, { kind: 'in', x: 2, y: 2, dir: E },
      { kind: 'out', x: 0, y: 1, dir: W },
    ],
  },
};
export const DEFAULT_VARIANT = 'out_top_left';

// The kitchen is 2x2 in the game (its prefab's colliders and connectors), with
// the inputs on top and the output at the bottom, or on the sides.
//
//   out_bottom_left   out_bottom_right   in_left    in_right
//    v v               v v                >. .>      <. .<
//    . .               . .                >. .        . .<
//    v                   v
/** @type {Record<string, StationVariant>} */
export const KITCHEN_VARIANTS = {
  out_bottom_left: {
    name: 'Inputs top, output bottom-left',
    ports: [
      { kind: 'in', x: 0, y: 0, dir: N }, { kind: 'in', x: 1, y: 0, dir: N },
      { kind: 'out', x: 0, y: 1, dir: S },
    ],
  },
  out_bottom_right: {
    name: 'Inputs top, output bottom-right',
    ports: [
      { kind: 'in', x: 0, y: 0, dir: N }, { kind: 'in', x: 1, y: 0, dir: N },
      { kind: 'out', x: 1, y: 1, dir: S },
    ],
  },
  in_left: {
    name: 'Inputs left, output right',
    ports: [
      { kind: 'in', x: 0, y: 0, dir: W }, { kind: 'in', x: 0, y: 1, dir: W },
      { kind: 'out', x: 1, y: 0, dir: E },
    ],
  },
  in_right: {
    name: 'Inputs right, output left',
    ports: [
      { kind: 'in', x: 1, y: 0, dir: E }, { kind: 'in', x: 1, y: 1, dir: E },
      { kind: 'out', x: 0, y: 0, dir: W },
    ],
  },
};

// Worker talents a station uses. A recipe's `talent` is the level of it the
// station's worker needs (the game's craft talentLock).
/** @type {Record<StationDef['talent'], TalentDef>} */
export const TALENTS = {
  gear: { name: 'Gear', icon: 'assets/ui/talent_red.webp' },
  hammer: { name: 'Hammer', icon: 'assets/ui/talent_orange.webp' },
  wheat: { name: 'Wheat', icon: 'assets/ui/talent_green.webp' },
};

// sprites[level][variant]: in-game art at 64x48 px per unit, rendered from the
// game's station prefabs (see README "Assets"). dx/dy is the sprite's top-left
// relative to the footprint's top-left in image pixels, from the prefab geometry;
// the overhang beyond the footprint (hoppers, chimney) is purely cosmetic.
// Offsets are listed in the order of the station's variants.
/**
 * @param {StationType} type
 * @param {Record<string, StationVariant>} variants
 * @param {Record<number, Offset[]>} offsets
 * @returns {Record<number, Record<string, Sprite>>}
 */
const stationSprites = (type, variants, offsets) => Object.fromEntries(Object.entries(offsets).map(([level, byVariant]) => [
  level,
  Object.fromEntries(Object.keys(variants).map((v, i) => [v, { src: `assets/stations/${type}_${level}_${v}.webp`, dx: byVariant[i][0], dy: byVariant[i][1] }])),
]));
/** @type {Record<StationType, StationDef>} */
export const STATIONS = {
  assembly_bench: {
    name: 'Assembly bench', short: 'ASM', color: '#4f7fd1', size: 3, levels: [1, 2, 3], talent: 'hammer',
    variants: STATION_VARIANTS,
    sprites: stationSprites('assembly_bench', STATION_VARIANTS, {
      1: [[-9, -9], [-2, -9], [-22, 26], [-22, 26]],
      2: [[-2, 20], [-2, 20], [-22, 26], [-22, 26]],
      3: [[-2, 20], [-2, 20], [-22, 26], [-22, 26]],
    }),
  },
  smithy: {
    name: 'Smithy', short: 'SMI', color: '#c9573b', size: 3, levels: [1, 2], talent: 'gear',
    variants: STATION_VARIANTS,
    sprites: stationSprites('smithy', STATION_VARIANTS, {
      1: [[-9, -14], [-4, -14], [-22, -14], [-22, -14]],
      2: [[-9, -40], [-4, -40], [-22, -40], [-22, -40]],
    }),
  },
  kitchen: {
    name: 'Kitchen', short: 'KIT', color: '#3d9d6a', size: 2, levels: [1, 2], talent: 'wheat',
    variants: KITCHEN_VARIANTS, defaultVariant: 'out_bottom_left',
    sprites: stationSprites('kitchen', KITCHEN_VARIANTS, {
      1: [[-7, -57], [-9, -57], [-22, -24], [-22, -24]],
      2: [[-7, -57], [-9, -57], [-22, -22], [-22, -22]],
    }),
  },
};
/** @type {(type: StationType) => Record<string, StationVariant>} */
export const stationVariants = (type) => STATIONS[type]?.variants ?? STATION_VARIANTS;
/** @type {(type: StationType) => string} */
export const defaultVariant = (type) => STATIONS[type]?.defaultVariant ?? DEFAULT_VARIANT;

// Station extensions (the game's workbench extensions). Each station has one
// small and one big slot, so it takes at most one extension of each size. The
// icon is the game's build icon.
/** @type {Extension['slot'][]} */
export const EXTENSION_SLOTS = ['small', 'big'];
/** @type {Record<string, Extension>} */
export const EXTENSIONS = {
  bellows: { name: 'Bellows', station: 'smithy', slot: 'small' },
  hammer: { name: 'Hammer', station: 'smithy', slot: 'big' },
  press: { name: 'Press', station: 'smithy', slot: 'big' },
  grindstone: { name: 'Grindstone', station: 'smithy', slot: 'big' },
  auto_hammer: { name: 'Auto-hammer', station: 'assembly_bench', slot: 'small' },
  spinning_wheel: { name: 'Spinning wheel', station: 'assembly_bench', slot: 'small' },
  drill_press: { name: 'Drill press', station: 'assembly_bench', slot: 'big' },
  sewing_machine: { name: 'Sewing machine', station: 'assembly_bench', slot: 'big' },
  lathe: { name: 'Lathe', station: 'assembly_bench', slot: 'big' },
  millstone: { name: 'Millstone', station: 'kitchen', slot: 'small' },
  sealing_machine: { name: 'Sealing machine', station: 'kitchen', slot: 'small' },
  stove: { name: 'Stove', station: 'kitchen', slot: 'big' },
};
for (const [id, x] of Object.entries(EXTENSIONS)) x.icon = `assets/extensions/icons/${id}.webp`;
/** @type {(type: StationType) => string[]} */
export const extensionsFor = (type) => Object.keys(EXTENSIONS).filter((id) => EXTENSIONS[id].station === type);

// Extension art drawn over a station: one image per station level, layout and
// extension, rendered in the game's slot (and orientation) for that layout with
// the parts hidden behind the station removed. All share one frame whose
// top-left is (dx, dy) game pixels from the footprint's top-left.
export const EXTENSION_ART_FRAME = { dx: -32, dy: -80 };
/** @type {(e: Entity, id: string) => string} */
export const extensionArt = (e, id) => `assets/extensions/${e.type}_${e.level}_${e.variant}_${id}.webp`;
/** @type {Record<number, string>} */
export const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

// Factory recipes, from the game's craft definitions (conveyor crafts). levels:
// station levels that can run it. inputs/outputs: item id -> quantity per batch
// (outputs that scale with a worker perk use the base amount). time: seconds per
// batch. talent: worker talent level needed. tech: the tech that unlocks it.
// extension: the station extension it needs.
/**
 * @param {string} id
 * @param {StationType} station
 * @param {number[]} levels
 * @param {Record<string, number>} inputs
 * @param {Record<string, number>} outputs
 * @param {number | null} time
 * @param {number} talent
 * @param {string | null} tech
 * @param {string | null} [extension]
 * @returns {Recipe}
 */
const R = (id, station, levels, inputs, outputs, time, talent, tech, extension = null) =>
  ({ id, station, levels, inputs, outputs, time, talent, tech, extension });
/** @type {Recipe[]} */
export const RECIPES = [
  R('supply_iron', 'assembly_bench', [1, 2, 3], { iron_ingot: 8 }, { supply_iron: 1 }, 10, 2, 'Check station access'),
  R('wooden_kit_1_nails', 'assembly_bench', [1, 2, 3], { wood_log: 1, bronze_nails: 4 }, { wooden_kit_1: 4 }, 12, 2, 'Assembly bench'),
  R('wooden_kit_1', 'assembly_bench', [1, 2, 3], { wood_log: 1 }, { wooden_kit_1: 4 }, 14, 3, 'Assembly bench: Auto-hammer', 'auto_hammer'),
  R('stone_kit', 'assembly_bench', [1, 2, 3], { stone: 2 }, { stone_kit: 1 }, 8, 2, 'Assembly bench'),
  R('crate', 'assembly_bench', [1, 2, 3], { wooden_kit_1: 1, iron_kit_1: 1 }, { crate: 2 }, 8, 3, 'Crate'),
  R('building_kit_1', 'assembly_bench', [1, 2, 3], { stone_kit: 1, brick: 1 }, { building_kit_1: 1 }, 8, 5, 'Building Kit I', 'auto_hammer'),
  R('supply_building_materials_1', 'assembly_bench', [1, 2, 3], { stone_kit: 1, brick: 1 }, { supply_building_materials_1: 1 }, 8, 5, 'Building Kit I', 'auto_hammer'),
  R('fabric', 'assembly_bench', [1, 2, 3], { flax: 16 }, { fabric: 1 }, 8, 4, 'Assembly bench: Spinning wheel', 'spinning_wheel'),
  R('supply_fabric', 'assembly_bench', [1, 2, 3], { flax: 16 }, { supply_fabric: 1 }, 8, 4, 'Assembly bench: Spinning wheel', 'spinning_wheel'),
  R('supply_iron_tools', 'assembly_bench', [2, 3], { crate: 1, iron_kit_1: 4 }, { supply_iron_tools: 1 }, 8, 5, 'Assembly bench II'),
  R('supply_cutlery_1', 'assembly_bench', [2, 3], { iron_kit_1: 4 }, { supply_cutlery_1: 1 }, 8, 5, 'Kitchen Supplies'),
  R('supply_kitchen_utensils', 'assembly_bench', [2, 3], { tableware: 4, glass_containers: 4 }, { supply_kitchen_utensils: 1 }, 8, 5, 'Kitchen Supplies'),
  R('furniture_kit_1', 'assembly_bench', [2, 3], { wooden_kit_1: 1, iron_kit_1: 1 }, { furniture_kit_1: 1 }, 6, 6, 'Furniture Kit I', 'drill_press'),
  R('supply_furniture_1', 'assembly_bench', [2, 3], { wooden_kit_1: 4, iron_kit_1: 4 }, { supply_furniture_1: 1 }, 12, 6, 'Furniture Kit I', 'drill_press'),
  R('supply_appliances_1', 'assembly_bench', [2, 3], { furniture_kit_1: 4, zombie_power: 1 }, { supply_appliances_1: 1 }, 12, 6, 'Appliances I'),
  R('marble_kit', 'assembly_bench', [2, 3], { marble: 2 }, { marble_kit: 1 }, 6, 6, 'Ways of Stone'),
  R('sculpture_kit_1', 'assembly_bench', [2, 3], { stone: 2 }, { sculpture_kit_1: 1 }, 6, 6, 'Ways of Stone'),
  R('supply_clothes_1', 'assembly_bench', [2, 3], { fabric: 12 }, { supply_clothes_1: 1 }, 12, 6, 'Clothes I', 'sewing_machine'),
  R('supply_clothes_2', 'assembly_bench', [3], { fabric: 16, iron_kit_2: 2 }, { supply_clothes_2: 1 }, 12, 8, 'Clothes II', 'sewing_machine'),
  R('wooden_kit_2', 'assembly_bench', [2, 3], { special_wood: 1 }, { wooden_kit_2: 3 }, 12, 7, 'Wooden Kit II', 'drill_press'),
  R('zombie_mechanism', 'assembly_bench', [2, 3], { engineering_kit: 1, zombie_power: 1 }, { zombie_mechanism: 1 }, 6, 7, 'Zombie Mechanisms', 'lathe'),
  R('supply_engineering_mechanism', 'assembly_bench', [2, 3], { engineering_kit: 2, zombie_power: 2 }, { supply_engineering_mechanism: 1 }, 12, 7, 'Zombie Mechanisms', 'lathe'),
  R('furniture_kit_2', 'assembly_bench', [3], { wooden_kit_2: 1, iron_kit_2: 1 }, { furniture_kit_2: 1 }, 8, 8, 'Furniture Kit II'),
  R('supply_furniture_2', 'assembly_bench', [3], { wooden_kit_2: 3, iron_kit_2: 3 }, { supply_furniture_2: 1 }, 12, 8, 'Furniture Kit II'),
  R('building_kit_2', 'assembly_bench', [3], { wooden_kit_2: 1, marble_kit: 1 }, { building_kit_2: 1 }, 6, 9, 'Building Kit II'),
  R('supply_building_materials_2', 'assembly_bench', [3], { wooden_kit_2: 4, marble_kit: 4 }, { supply_building_materials_2: 1 }, 12, 9, 'Building Kit II'),
  R('supply_appliances_2', 'assembly_bench', [3], { furniture_kit_2: 4, zombie_mechanism: 2 }, { supply_appliances_2: 1 }, 12, 9, 'Appliances II'),
  R('sculpture_kit_2', 'assembly_bench', [3], { marble: 4 }, { sculpture_kit_2: 1 }, 6, 9, 'Assembly bench III'),
  R('supply_cutlery_2', 'assembly_bench', [3], { iron_kit_2: 4 }, { supply_cutlery_2: 1 }, 12, 9, 'Assembly bench III'),
  R('iron_ingot', 'smithy', [1, 2], { iron_ore: 1, coal: 1 }, { iron_ingot: 1 }, 8, 2, 'Smithy: Hammer'),
  R('iron_kit_1', 'smithy', [1, 2], { iron_ingot: 1 }, { iron_kit_1: 4 }, 8, 3, 'Smithy: Hammer', 'hammer'),
  R('brick', 'smithy', [1, 2], { clay: 2, coal: 1 }, { brick: 2 }, 8, 2, 'Smithy I'),
  R('glass', 'smithy', [1, 2], { sand: 3, coal: 1 }, { glass: 1 }, 8, 2, 'Smithy I'),
  R('tableware', 'smithy', [1, 2], { clay: 2, coal: 1 }, { tableware: 1 }, 6, 4, 'Smithy: Bellows', 'bellows'),
  R('glass_containers', 'smithy', [1, 2], { sand: 2, coal: 1 }, { glass_containers: 1 }, 6, 4, 'Smithy: Bellows', 'bellows'),
  R('clay_molds', 'smithy', [2], { clay: 2, coal: 1 }, { clay_molds: 1 }, 6, 5, 'Smithy II'),
  R('iron_kit_2', 'smithy', [2], { iron_ingot: 1, clay_molds: 2 }, { iron_kit_2: 4 }, 12, 5, 'Smithy II', 'bellows'),
  R('engineering_kit', 'smithy', [2], { steel_ingot: 1, clay_molds: 2 }, { engineering_kit: 1 }, 6, 6, 'Steel Works', 'bellows'),
  R('supply_steel_tools', 'smithy', [2], { steel_ingot: 4, crate: 1 }, { supply_steel_tools: 1 }, 12, 6, 'Steel Works', 'bellows'),
  R('lens', 'smithy', [2], { sand: 3, coal: 2 }, { lens: 1 }, 6, 7, 'Lenses', 'press'),
  R('supply_vegetables_carrot', 'kitchen', [1, 2], { crate: 1, carrot: 16 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_beet', 'kitchen', [1, 2], { crate: 1, beet: 12 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_cabbage_1', 'kitchen', [1, 2], { crate: 1, cabbage_1: 10 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_cabbage_2', 'kitchen', [1, 2], { crate: 1, cabbage_2: 8 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_cabbage_3', 'kitchen', [1, 2], { crate: 1, cabbage_3: 6 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_onion_1', 'kitchen', [1, 2], { crate: 1, onion_1: 8 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_onion_2', 'kitchen', [1, 2], { crate: 1, onion_2: 6 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_onion_3', 'kitchen', [1, 2], { crate: 1, onion_3: 4 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_pumpkin_1', 'kitchen', [1, 2], { crate: 1, pumpkin_1: 3 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_pumpkin_2', 'kitchen', [1, 2], { crate: 1, pumpkin_2: 2 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_vegetables_pumpkin_3', 'kitchen', [1, 2], { crate: 1, pumpkin_3: 1 }, { supply_vegetables: 1 }, 8, 3, 'Vegetable Supplies'),
  R('supply_beer', 'kitchen', [1, 2], { beer: 12 }, { supply_beer: 1 }, 6, 3, 'Brewing'),
  R('supply_wine_1', 'kitchen', [1, 2], { wine_1: 8 }, { supply_wine: 1 }, 6, 5, 'Winemaking'),
  R('supply_wine_2', 'kitchen', [1, 2], { wine_2: 6 }, { supply_wine: 1 }, 6, 5, 'Winemaking'),
  R('supply_wine_3', 'kitchen', [1, 2], { wine_3: 4 }, { supply_wine: 1 }, 6, 5, 'Winemaking'),
  R('supply_flour', 'kitchen', [1, 2], { wheat: 16, fabric: 2 }, { supply_flour: 1 }, 10, 4, 'Flour Supplies', 'millstone'),
  R('supply_preserves_1_carrot', 'kitchen', [1, 2], { glass_containers: 1, carrot: 16 }, { supply_preserves_1: 1 }, 8, 6, 'Preservation Supplies', 'sealing_machine'),
  R('supply_preserves_1_beet', 'kitchen', [1, 2], { glass_containers: 1, beet: 12 }, { supply_preserves_1: 1 }, 8, 6, 'Preservation Supplies', 'sealing_machine'),
  R('supply_preserves_1_cabbage_1', 'kitchen', [1, 2], { glass_containers: 1, cabbage_1: 10 }, { supply_preserves_1: 1 }, 8, 6, 'Preservation Supplies', 'sealing_machine'),
  R('supply_preserves_1_cabbage_2', 'kitchen', [1, 2], { glass_containers: 1, cabbage_2: 8 }, { supply_preserves_1: 1 }, 8, 6, 'Preservation Supplies', 'sealing_machine'),
  R('supply_preserves_1_cabbage_3', 'kitchen', [1, 2], { glass_containers: 1, cabbage_3: 6 }, { supply_preserves_1: 1 }, 8, 6, 'Preservation Supplies', 'sealing_machine'),
  R('supply_preserves_2_onion_1', 'kitchen', [2], { glass_containers: 1, onion_1: 10 }, { supply_preserves_2: 1 }, 8, 8, 'Preservation Supplies II', 'sealing_machine'),
  R('supply_preserves_2_onion_2', 'kitchen', [2], { glass_containers: 1, onion_2: 8 }, { supply_preserves_2: 1 }, 8, 8, 'Preservation Supplies II', 'sealing_machine'),
  R('supply_preserves_2_onion_3', 'kitchen', [2], { glass_containers: 1, onion_3: 6 }, { supply_preserves_2: 1 }, 8, 8, 'Preservation Supplies II', 'sealing_machine'),
  R('supply_preserves_2_pumpkin_1', 'kitchen', [2], { glass_containers: 1, pumpkin_1: 4 }, { supply_preserves_2: 1 }, 8, 8, 'Preservation Supplies II', 'sealing_machine'),
  R('supply_preserves_2_pumpkin_2', 'kitchen', [2], { glass_containers: 1, pumpkin_2: 3 }, { supply_preserves_2: 1 }, 8, 8, 'Preservation Supplies II', 'sealing_machine'),
  R('supply_preserves_2_pumpkin_3', 'kitchen', [2], { glass_containers: 1, pumpkin_3: 2 }, { supply_preserves_2: 1 }, 8, 8, 'Preservation Supplies II', 'sealing_machine'),
];
/** @type {Record<string, Recipe>} */
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/**
 * @param {StationType} stationType
 * @param {number} level
 * @returns {Recipe[]}
 */
export function recipesFor(stationType, level) {
  return RECIPES.filter((r) => r.station === stationType && r.levels.includes(level));
}

// Stable, distinct-enough colour per item id.
/** @param {string} id */
function hashColor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 45%, ${45 + (h >> 9) % 20}%)`;
}

// Entity kinds that can be placed on the floor.
//   belt         1x1, moves items towards `rot`. Belts never cross.
//   underground  1x5 from its entry cell (x, y) towards `rot`: 2 cells, a gap, 2 cells.
//                Items enter from behind the entry cell and leave in front of the
//                exit cell. Only a plain belt may occupy the gap.
//   splitter     1x1, takes items from behind (travelling towards `rot`) and sends
//                them out to both sides.
//   chest        1x1, accepts items from any side (a distributor or a station's
//                top/bottom output can push straight into it; a side output needs a belt) and outputs, round-robin, onto every
//                neighbouring belt that doesn't point into it (alongside ones too) on
//                its filtered sides, or on every side when it has no filters,
//                and it never feeds a station input directly. `filters` picks the item sent out of each side
//                keyed N/E/S/W (unset = any); `stock` lists items the player provisions by hand.
//   distributor  1x1 raw-material source, outputs towards `rot`.
//   supply_station 1x1 sink for "Supply: ..." crates (the game's Supply Station),
//                taking items from the neighbouring cell on its `rot` side.
//   station      3x3, fixed orientation; `variant` picks the port layout.
/** @type {Record<EntityKind, EntityKindDef>} */
export const ENTITY_KINDS = {
  belt: { name: 'Conveyor belt', rotatable: true },
  underground: { name: 'Underground conveyor', rotatable: true },
  splitter: { name: 'Conveyor splitter', rotatable: true },
  chest: { name: 'Chest' },
  distributor: { name: 'Distribution station', rotatable: true, hasMaterial: true },
  supply_station: { name: 'Supply station', rotatable: true },
  station: { name: 'Station' },
};

// Conveyor art from the game's conveyor prefabs, at 64x48 px per unit:
// assets/conveyors/<kind>_<dir>_<shape>.webp, drawn with its top-left at [dx, dy]
// game pixels from the cell's top-left. Straight belts come as start, centre,
// end or single pieces (a line's caps overhang the cell); a turn is the start of
// the new line. An underground's art covers its first four cells (drawn from the
// entry cell); its exit cell is a plain belt, as in the game. Splitters show an
// end cap on each output with nothing attached; `vertical` has arms up and down
// (items travelling east or west).
/** @type {string[]} */
export const ART_DIRS = ['up', 'right', 'down', 'left']; // by rot: N E S W
/**
 * @type {{
 *   belt: Record<string, Record<string, Offset>>,
 *   underground: Record<string, Record<string, Offset>>,
 *   supply_station: Record<string, Offset>,
 *   splitter: Record<string, Record<string, Offset>>,
 * }}
 */
export const CONVEYOR_ART = {
  belt: {
    up: { start: [0, 0], centre: [0, 0], end: [0, -18], single: [0, -18] },
    right: { start: [-18, 0], centre: [0, 0], end: [0, 0], single: [-18, 0] },
    down: { start: [0, -14], centre: [0, 0], end: [0, 0], single: [0, -14] },
    left: { start: [0, 0], centre: [0, 0], end: [-22, 0], single: [-22, 0] },
  },
  underground: {
    up: { start: [0, -144], center: [0, -144] },
    right: { start: [-18, -24], center: [0, -24] },
    down: { start: [0, -14], center: [0, 0] },
    left: { start: [-192, -24], center: [-192, -24] },
  },
  supply_station: { up: [-2, -16], right: [-2, -26], down: [-2, -16], left: [0, -26] }, // input side
  splitter: {
    down: { centre: [0, 0], centreupend: [-2, -18], centredownend: [-2, 0], end: [-2, -18] },
    left: { centre: [0, -2], centreleftend: [-22, -2], centrerightend: [0, -2], end: [-22, -2] },
  },
};

// Conveyor chests: art, and stack slots from the game's inventory size.
/** @type {Record<number, ChestLevel>} */
export const CHEST_LEVELS = {
  1: { name: 'Conveyor Chest I', slots: 5, art: 'assets/chests/chest_1.webp' },
  2: { name: 'Conveyor Chest II', slots: 10, art: 'assets/chests/chest_2.webp' },
};
/** @type {Offset} */
export const CHEST_ART_OFFSET = [-4, -32];

// "Supply: ..." items are delivered to a supply station rather than a chest.
/** @type {(id: string) => boolean} */
export const isSupplyItem = (id) => id.startsWith('supply_');

// Factory power (the gear in the game's UI) each placed piece uses. Kinds not
// listed cost nothing. The icon is the game's power gear, tinted yellow.
/** @type {Partial<Record<import('./types.js').EntityKind, number>>} */
export const POWER_COST = { station: 1, belt: 1, chest: 1 };
export const POWER_ICON = 'assets/ui/power.webp';

// Belts can be fed from their sides (merging), confirmed in-game.
export const BELT_ACCEPTS_FROM_SIDES = true;
// Must the underground conveyor's gap cell be factory floor?
export const UNDERGROUND_GAP_MUST_BE_FLOOR = true;
export const UNDERGROUND_LENGTH = 5;
export const UNDERGROUND_GAP = 2; // index of the gap cell along the conveyor

// All cells of an entity's shape: [{x, y, gap}]. Gap cells are not occupied.
/**
 * @param {EntitySpec} e
 * @returns {Cell[]}
 */
export function entityCells(e) {
  if (e.kind === 'station') {
    const s = STATIONS[e.type].size;
    const cells = [];
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) cells.push({ x: e.x + dx, y: e.y + dy, gap: false });
    return cells;
  }
  if (e.kind === 'underground') {
    const d = DIRS[e.rot];
    return Array.from({ length: UNDERGROUND_LENGTH }, (_, i) => ({ x: e.x + d.dx * i, y: e.y + d.dy * i, gap: i === UNDERGROUND_GAP }));
  }
  return [{ x: e.x, y: e.y, gap: false }];
}

// Bounding box of an entity's shape.
/**
 * @param {EntitySpec} e
 * @returns {Bounds}
 */
export function entityBounds(e) {
  const cells = entityCells(e);
  const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}
