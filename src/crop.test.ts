import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_CROP, cropRect } from "./crop.ts";

test("cover fit centres the overflow", () => {
  // 400×200 image in a square cell: full height, middle 200 px wide.
  assert.deepEqual(cropRect(400, 200, 10, 10, NO_CROP), { x: 100, y: 0, w: 200, h: 200 });
});

test("rotation swaps the effective aspect", () => {
  // Rotated 90°, the 400×200 image is 200×400: full width, middle 200 px tall.
  assert.deepEqual(cropRect(400, 200, 10, 10, { ...NO_CROP, rotation: 90 }), { x: 0, y: 100, w: 200, h: 200 });
});

test("zoom and offset stay inside the image", () => {
  const r = cropRect(400, 200, 10, 10, { rotation: 0, zoom: 2, offsetX: 5, offsetY: -5 });
  assert.deepEqual(r, { x: 300, y: 0, w: 100, h: 100 });
  // Zoom below 1 would expose edges; it's treated as 1.
  assert.deepEqual(cropRect(400, 200, 10, 10, { ...NO_CROP, zoom: 0.5 }), cropRect(400, 200, 10, 10, NO_CROP));
});
