// @ts-check
// Background image of the real factory floor, drawn under the grid.

import { UNIT_PX } from './catalog.js';

// offsetX/offsetY: image pixel under the top-left corner of grid cell (0, 0).
// unitW/unitH: image pixels per grid cell (game units are 64x48, not square).
export const BACKGROUND = {
  src: 'assets/factory_floor.webp',
  unitW: UNIT_PX.w,
  unitH: UNIT_PX.h,
  offsetX: 226,
  offsetY: -310,
  opacity: 1,
};

export class Background {
  /** @param {() => void} onLoad */
  constructor(onLoad) {
    this.visible = true;
    this.image = new Image();
    this.image.onload = () => onLoad();
    this.image.src = BACKGROUND.src;
  }

  get shown() {
    return this.visible && this.image.complete && this.image.naturalWidth > 0;
  }

  // Draw in grid space: `cell` screen pixels per grid cell (context already
  // translated to the grid origin).
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cell
   */
  draw(ctx, cell) {
    if (!this.shown) return;
    const { unitW, unitH, offsetX, offsetY, opacity } = BACKGROUND;
    const sx = cell / unitW, sy = cell / unitH;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = sx < 1;
    ctx.drawImage(this.image, -offsetX * sx, -offsetY * sy, this.image.naturalWidth * sx, this.image.naturalHeight * sy);
    ctx.restore();
  }
}
