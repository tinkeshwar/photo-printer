import { test } from "node:test";
import assert from "node:assert/strict";
import { A4, PRESETS, cutLines, layout, slots, type Mode, type PerPage } from "./layout.ts";

const base = { page: A4, margin: 5, gap: 3 };
const preset = (id: string): Mode => {
  const p = PRESETS.find((p) => p.id === id)!;
  return { kind: "size", w: p.w, h: p.h };
};
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("grid presets give the right cell counts", () => {
  for (const n of [1, 2, 4, 6, 8, 9] as PerPage[])
    assert.equal(slots({ ...base, mode: { kind: "grid", perPage: n } }).length, n);
});

test("landscape page swaps grid columns and rows", () => {
  const s = slots({ ...base, page: { w: A4.h, h: A4.w }, mode: { kind: "grid", perPage: 6 } });
  assert.equal(new Set(s.map((c) => c.x)).size, 3);
  assert.equal(new Set(s.map((c) => c.y)).size, 2);
});

test("grid cells honour margin and gap", () => {
  const s = slots({ ...base, mode: { kind: "grid", perPage: 4 } });
  close(s[0].x, 5);
  close(s[0].y, 5);
  close(s[0].w, (200 - 3) / 2);
  close(s[0].h, (287 - 3) / 2);
  close(s[1].x, 5 + s[0].w + 3);
  close(s[3].x + s[3].w, 205);
  close(s[3].y + s[3].h, 292);
});

test("5x7 fits 2 per A4, rotated", () => {
  const s = slots({ ...base, mode: preset("5x7") });
  assert.equal(s.length, 2);
  close(s[0].w, 7 * 25.4);
  close(s[0].h, 5 * 25.4);
  // Centred horizontally.
  close(s[0].x, (210 - 7 * 25.4) / 2);
});

test("passport fits 30 per A4 upright with 5mm margin", () => {
  const s = slots({ ...base, mode: preset("passport") });
  assert.equal(s.length, 30);
  assert.equal(s[0].w, 35);
});

test("copies overflow onto a second page", () => {
  const pages = layout({ ...base, mode: preset("5x7"), photos: [{ id: "a", copies: 2 }, { id: "b", copies: 1 }] });
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].map((c) => c.photoId), ["a", "a"]);
  assert.deepEqual(pages[1].map((c) => c.photoId), ["b"]);
});

test("a size bigger than the page lays out nothing", () => {
  assert.deepEqual(layout({ ...base, mode: { kind: "size", w: 300, h: 300 }, photos: [{ id: "a", copies: 1 }] }), []);
});

test("cut lines sit on every distinct cell edge", () => {
  const [page] = layout({ ...base, mode: { kind: "grid", perPage: 4 }, photos: [{ id: "a", copies: 4 }] });
  const { xs, ys } = cutLines(page);
  assert.equal(xs.length, 4);
  assert.equal(ys.length, 4);
  close(xs[0], 5);
  close(xs[3], 205);
  close(ys[3], 292);
});
