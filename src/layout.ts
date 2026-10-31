// Pure layout math, shared by preview and PDF. Everything is in mm.

export type Size = { w: number; h: number };

export const A4: Size = { w: 210, h: 297 };

const IN = 25.4;

export const PRESETS = [
  { id: "passport", label: "Passport 35×45 mm", w: 35, h: 45 },
  { id: "2x2", label: "2×2 in", w: 2 * IN, h: 2 * IN },
  { id: "wallet", label: "Wallet 2.5×3.5 in", w: 2.5 * IN, h: 3.5 * IN },
  { id: "3.5x5", label: "3.5×5 in", w: 3.5 * IN, h: 5 * IN },
  { id: "4x6", label: "4×6 in", w: 4 * IN, h: 6 * IN },
  { id: "5x7", label: "5×7 in", w: 5 * IN, h: 7 * IN },
];

export type PerPage = 1 | 2 | 4 | 6 | 8 | 9;

export type Mode = { kind: "grid"; perPage: PerPage } | { kind: "size"; w: number; h: number };

export type Photo = { id: string; copies: number };

export type Cell = { x: number; y: number; w: number; h: number; photoId: string };

export type Page = Cell[];

export type LayoutInput = { page: Size; margin: number; gap: number; mode: Mode; photos: Photo[] };

// [cols, rows] on a portrait page, so 2 per page stacks two landscape cells. Swapped on a landscape page.
const GRIDS: Record<PerPage, [number, number]> = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3] };

// How many cells of `size` fit along `avail` with `gap` between them. Epsilon absorbs float error on exact fits.
const fit = (avail: number, size: number, gap: number) => Math.floor((avail + gap) / (size + gap) + 1e-9);

/** Cell slots for one page, in reading order. */
export function slots({ page, margin, gap, mode }: Omit<LayoutInput, "photos">): Omit<Cell, "photoId">[] {
  const aw = page.w - 2 * margin;
  const ah = page.h - 2 * margin;
  let cols: number, rows: number, w: number, h: number;
  if (mode.kind === "grid") {
    [cols, rows] = GRIDS[mode.perPage];
    if (page.w > page.h) [cols, rows] = [rows, cols];
    w = (aw - (cols - 1) * gap) / cols;
    h = (ah - (rows - 1) * gap) / rows;
  } else {
    const up = fit(aw, mode.w, gap) * fit(ah, mode.h, gap);
    const rot = fit(aw, mode.h, gap) * fit(ah, mode.w, gap);
    [w, h] = rot > up ? [mode.h, mode.w] : [mode.w, mode.h];
    cols = fit(aw, w, gap);
    rows = fit(ah, h, gap);
  }
  if (w <= 0 || h <= 0) return [];
  // Centre the block; a no-op for grids, which fill the printable area.
  const x0 = margin + (aw - (cols * w + (cols - 1) * gap)) / 2;
  const y0 = margin + (ah - (rows * h + (rows - 1) * gap)) / 2;
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push({ x: x0 + c * (w + gap), y: y0 + r * (h + gap), w, h });
  return out;
}

/** Fill slots with photo instances (each photo repeated `copies` times); overflow goes to new pages. */
export function layout(input: LayoutInput): Page[] {
  const s = slots(input);
  if (!s.length) return [];
  const ids = input.photos.flatMap((p) => Array<string>(Math.max(0, p.copies)).fill(p.id));
  const pages: Page[] = [];
  for (let i = 0; i < ids.length; i += s.length)
    pages.push(ids.slice(i, i + s.length).map((photoId, j) => ({ ...s[j], photoId })));
  return pages;
}

/** Distinct cell edges on a page; cut lines run the full page at each, drawn beneath the photos. */
export function cutLines(page: Page): { xs: number[]; ys: number[] } {
  const uniq = (v: number[]) => [...new Set(v.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
  return { xs: uniq(page.flatMap((c) => [c.x, c.x + c.w])), ys: uniq(page.flatMap((c) => [c.y, c.y + c.h])) };
}

/** Scale cells by `k` about the page centre: the printer calibration, applied to PDF output only. */
export const scaled = (pages: Page[], page: Size, k: number): Page[] =>
  pages.map((cells) =>
    cells.map((c) => ({ ...c, x: page.w / 2 + (c.x - page.w / 2) * k, y: page.h / 2 + (c.y - page.h / 2) * k, w: c.w * k, h: c.h * k })),
  );
