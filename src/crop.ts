// Pure crop math, shared by preview and PDF. Units are whatever the caller passes (px for images, mm for cells).

export type Rotation = 0 | 90 | 180 | 270;

export type Crop = { rotation: Rotation; zoom: number; offsetX: number; offsetY: number };

export const NO_CROP: Crop = { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 };

export type Rect = { x: number; y: number; w: number; h: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Image size after rotation. */
export const rotated = (iw: number, ih: number, r: Rotation) => (r % 180 ? { w: ih, h: iw } : { w: iw, h: ih });

/**
 * Visible source rect, in the rotated image's pixel frame, for a cell of size cw×ch.
 * zoom 1 = cover fit; offsets -1..1 slide across the overflow, so the cell is always covered.
 */
export function cropRect(iw: number, ih: number, cw: number, ch: number, c: Crop): Rect {
  const { w: rw, h: rh } = rotated(iw, ih, c.rotation);
  const s = Math.max(cw / rw, ch / rh) * Math.max(1, c.zoom);
  const w = cw / s;
  const h = ch / s;
  return {
    x: ((rw - w) / 2) * (1 + clamp(c.offsetX, -1, 1)),
    y: ((rh - h) / 2) * (1 + clamp(c.offsetY, -1, 1)),
    w,
    h,
  };
}
