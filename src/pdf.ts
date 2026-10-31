// PDF assembly. DOM-free: the caller rasterises each photo crop to JPEG bytes.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { cutLines, type Cell, type Page, type Size } from "./layout.ts";

export const DPIS = [300, 600, 1200];
const PT = 72 / 25.4;

/** Raster px for a length in mm at `dpi`. */
export const dots = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

/** Cell in PDF points; PDF origin is bottom-left, so y flips. */
export const place = (c: Cell, page: Size) => ({ x: c.x * PT, y: (page.h - c.y - c.h) * PT, width: c.w * PT, height: c.h * PT });

/** `jpeg(photoId, wPx, hPx)` renders that photo's crop at the given pixel size. Called once per photo × cell size. */
export async function buildPdf(
  pages: Page[],
  size: Size,
  cuts: boolean,
  dpi: number,
  jpeg: (photoId: string, w: number, h: number) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const embedded = new Map<string, Awaited<ReturnType<typeof doc.embedJpg>>>();
  for (const cells of pages) {
    const p = doc.addPage([size.w * PT, size.h * PT]);
    // Full-page lines beneath the photos, so only the parts in gaps and margins show (same as the preview).
    if (cuts) {
      const line = { thickness: 0.25, color: rgb(0.73, 0.73, 0.73) };
      const { xs, ys } = cutLines(cells);
      for (const x of xs) p.drawLine({ ...line, start: { x: x * PT, y: 0 }, end: { x: x * PT, y: size.h * PT } });
      for (const y of ys) p.drawLine({ ...line, start: { x: 0, y: (size.h - y) * PT }, end: { x: size.w * PT, y: (size.h - y) * PT } });
    }
    for (const c of cells) {
      const [w, h] = [dots(c.w, dpi), dots(c.h, dpi)];
      const key = `${c.photoId}:${w}x${h}`;
      let img = embedded.get(key);
      if (!img) embedded.set(key, (img = await doc.embedJpg(await jpeg(c.photoId, w, h))));
      p.drawImage(img, place(c, size));
    }
  }
  return doc.save();
}

/** One page: 100 mm horizontal and vertical rulers (1 mm ticks, 10 mm labels), drawn at printer scale `k` about the page centre. */
export async function calibrationPdf(size: Size, k: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([size.w * PT, size.h * PT]);
  const X = (x: number) => (size.w / 2 + (x - size.w / 2) * k) * PT;
  const Y = (y: number) => (size.h / 2 - (y - size.h / 2) * k) * PT; // flipped
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    p.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: 0.5 });
  const [x0, y0] = [(size.w - 100) / 2, (size.h - 100) / 2]; // rulers share the top-left corner
  line(x0, y0, x0 + 100, y0);
  line(x0, y0, x0, y0 + 100);
  for (let i = 0; i <= 100; i++) {
    const t = i % 10 ? (i % 5 ? 2 : 3.5) : 5;
    line(x0 + i, y0, x0 + i, y0 + t);
    line(x0, y0 + i, x0 + t, y0 + i);
    if (i % 10) continue;
    const label = String(i);
    p.drawText(label, { x: X(x0 + i) - font.widthOfTextAtSize(label, 7) / 2, y: Y(y0 + 8), size: 7, font });
    if (i) p.drawText(label, { x: X(x0 + 7), y: Y(y0 + i) - 2.5, size: 7, font });
  }
  const pct = +(k * 100).toFixed(2);
  [
    "Print at \"Actual size\" / 100%, not \"Fit to page\". Each ruler should measure exactly 100 mm.",
    `If not, set Printer scale to ${pct} x 100 / measured mm (now ${pct}%).`,
  ].forEach((t, i) => p.drawText(t, { x: 20 * PT, y: (size.h - 20 - i * 6) * PT, size: 10, font }));
  return doc.save();
}
