// @ts-check
// A layout as a URL query value: the shareable part of the layout JSON,
// deflated and base64url-encoded. No DOM, so tests can use it.

import { Layout } from './model.js';
import { FLOOR_GRID } from './catalog.js';

/** @typedef {import('./types.js').Entity} Entity */

export const SHARE_PARAM = 'f';

/** @param {Uint8Array} bytes @returns {string} */
function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text @returns {Uint8Array} */
function fromBase64Url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/**
 * @param {'compress' | 'decompress'} how
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
async function pipe(how, bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream();
  const out = how === 'compress' ? stream.pipeThrough(new CompressionStream('deflate-raw')) : stream.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// What the layout needs to be rebuilt. A factory-floor layout (it has `repaired`)
// gets its terrain and distribution stations back from the sections, so those are
// left out, except what the stations hold (a garden crop, the cellar's stock).
/** @param {Layout} layout */
export function shareData(layout) {
  const data = layout.toJSON();
  if (!data.repaired) return data;
  const { terrain, legend, width, height, ...rest } = data;
  const keep = (/** @type {Entity} */ e) => e.kind !== 'distributor' || e.garden;
  return { ...rest, entities: data.entities.filter(keep) };
}

/** @param {Layout} layout @returns {Promise<string>} */
export async function encodeLayout(layout) {
  const json = new TextEncoder().encode(JSON.stringify(shareData(layout)));
  return toBase64Url(await pipe('compress', json));
}

/** @param {string} text @returns {Promise<Layout>} */
export async function decodeLayout(text) {
  const json = new TextDecoder().decode(await pipe('decompress', fromBase64Url(text)));
  const data = JSON.parse(json);
  // No terrain rows means the sections give it; the size is the floor plan's.
  if (!data.terrain) Object.assign(data, { terrain: [' '], width: FLOOR_GRID.width, height: FLOOR_GRID.height });
  return Layout.fromJSON(data);
}
