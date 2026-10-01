// @ts-check
// The real factory floor: the game's floor sections (FLOOR_SECTIONS) and the
// distribution stations, aligned with the background image. Used on first
// launch; Clear keeps it.

import { Layout, FLOOR } from './model.js';
import { N, FLOOR_GRID } from './catalog.js';

// Sections repaired on the user's floor (factory.json).
export const DEFAULT_REPAIRED = [5, 8];

// Distribution stations along the bottom wall, all feeding north.
/** @type {{ x: number, y: number, material: string }[]} */
export const DISTRIBUTORS = [
  { x: 3, y: 52, material: 'marble' },
  { x: 7, y: 52, material: 'iron_ore' },
  { x: 11, y: 52, material: 'coal' },
  { x: 15, y: 52, material: 'clay' },
  { x: 19, y: 52, material: 'sand' },
  { x: 23, y: 52, material: 'stone' },
  { x: 27, y: 52, material: 'wood_log' },
];

/** @param {number[]} [repaired] @returns {Layout} */
export function factoryFloor(repaired = DEFAULT_REPAIRED) {
  const layout = Layout.blank(FLOOR_GRID.width, FLOOR_GRID.height);
  layout.name = 'Factory';
  layout.setRepaired(repaired);
  syncDistributors(layout);
  return layout;
}

// Keep the floor plan's distribution stations in step with the floor: those on
// a section that isn't repaired are taken off, and the ones on floor that just
// came back (not floor in `before`) are put back, unless something is in the way.
/** @param {Layout} layout @param {string[]} [before] terrain before the change */
export function syncDistributors(layout, before = []) {
  for (const e of layout.entities.filter((x) => x.kind === 'distributor' && !layout.isFloor(x.x, x.y))) layout.remove(e.id);
  for (const d of DISTRIBUTORS) {
    if (before[d.y * layout.width + d.x] === FLOOR || !layout.isFloor(d.x, d.y)) continue;
    if (layout.entities.some((e) => e.kind === 'distributor' && e.x === d.x && e.y === d.y)) continue;
    /** @type {import('./types.js').EntitySpec} */
    const dist = { kind: 'distributor', rot: N, ...d };
    if (layout.canPlace(dist).ok) layout.add(dist);
  }
}
