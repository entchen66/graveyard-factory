// @ts-check
// The real factory floor: the game's floor sections (FLOOR_SECTIONS) and its
// fixed distribution stations (FACTORY_DISTRIBUTORS), aligned with the
// background image. Used on first launch; Clear keeps it.

import { Layout } from './model.js';
import { FLOOR_GRID } from './catalog.js';

// Sections repaired on the user's floor (factory.json).
export const DEFAULT_REPAIRED = [5, 8];

/** @param {number[]} [repaired] @returns {Layout} */
export function factoryFloor(repaired = DEFAULT_REPAIRED) {
  const layout = Layout.blank(FLOOR_GRID.width, FLOOR_GRID.height);
  layout.name = 'Factory';
  layout.setRepaired(repaired); // also puts the distributors in
  return layout;
}
