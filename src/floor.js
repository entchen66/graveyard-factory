// @ts-check
// The real factory floor (walls, columns and distribution stations), aligned
// with the background image. Used on first launch; Clear keeps it.

import { Layout } from './model.js';
import { N } from './catalog.js';

const TERRAIN = [
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                                          ',
  '                      ###########         ',
  '                      #.........#         ',
  '                      #.........#         ',
  '##################### #.........#         ',
  '#...................###.........####      ',
  '#..................................#      ',
  '#..................................#      ',
  '#..................................#      ',
  '#..................................#      ',
  '#..................................#      ',
  '#..................................#      ',
  '#..................................#      ',
  '#..................................#      ',
  '####...............................#      ',
  '   #...............................#      ',
  '   #............................####      ',
  '   #............................#         ',
  '   #............................#         ',
  '####............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#...............................#         ',
  '#################################         ',
  '                                          ',
];

// Distribution stations along the bottom wall, all feeding north.
/** @type {{ x: number, y: number, material: string }[]} */
export const DISTRIBUTORS = [
  { x: 3, y: 40, material: 'marble' },
  { x: 7, y: 40, material: 'iron_ore' },
  { x: 11, y: 40, material: 'coal' },
  { x: 15, y: 40, material: 'clay' },
  { x: 19, y: 40, material: 'sand' },
  { x: 23, y: 40, material: 'stone' },
  { x: 27, y: 40, material: 'wood_log' },
];

/** @returns {Layout} */
export function factoryFloor() {
  const layout = new Layout({ name: 'Factory', width: 1, height: 1 });
  layout.setTerrainFromText(TERRAIN.join('\n'));
  layout.resize({ right: 42 - layout.width, bottom: 43 - layout.height });
  for (const dist of DISTRIBUTORS) layout.add({ kind: 'distributor', rot: N, ...dist });
  return layout;
}
