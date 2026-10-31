import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { A4, layout, scaled } from "./layout.ts";
import { buildPdf, calibrationPdf, dots, place } from "./pdf.ts";

// 2×2 px JPEG; buildPdf only needs valid bytes.
const JPEG = new Uint8Array(Buffer.from("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAgACAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/aUO+B8xpd7/AN40wdBS17Bof//Z", "base64")); // copy: pooled Buffers have a byteOffset pdf-lib ignores

test("4x6 cell is 101.6×152.4 mm and y flips to bottom-left", () => {
  const r = place({ x: 10, y: 20, w: 101.6, h: 152.4, photoId: "a" }, A4);
  assert.equal(r.width.toFixed(2), "288.00"); // 4 in
  assert.equal(r.height.toFixed(2), "432.00"); // 6 in
  assert.equal(r.y.toFixed(3), (((297 - 20 - 152.4) * 72) / 25.4).toFixed(3));
  assert.equal(dots(101.6, 300), 1200);
  assert.equal(dots(101.6, 1200), 4800);
});

test("one A4 page per layout page, one raster per photo", async () => {
  const pages = layout({ page: A4, margin: 5, gap: 3, mode: { kind: "grid", perPage: 4 }, photos: [{ id: "a", copies: 5 }, { id: "b", copies: 1 }] });
  const calls: string[] = [];
  const bytes = await buildPdf(pages, A4, true, 300, async (id) => (calls.push(id), JPEG));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  const { width, height } = doc.getPage(0).getSize();
  assert.deepEqual([width.toFixed(2), height.toFixed(2)], ["595.28", "841.89"]);
  assert.deepEqual(calls, ["a", "b"]);
});

test("printer scale grows cells about the page centre", () => {
  const [c] = scaled([[{ x: 5, y: 5, w: 100, h: 100, photoId: "a" }]], A4, 1.1)[0];
  const r = (n: number) => Math.round(n * 1000) / 1000;
  assert.deepEqual([c.x, c.y, c.w, c.h].map(r), [-5, -9.35, 110, 110]); // centre (105, 148.5) fixed
});

test("calibration page is one A4 page", async () => {
  const doc = await PDFDocument.load(await calibrationPdf(A4, 1));
  assert.equal(doc.getPageCount(), 1);
});
