import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join, tempDir } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { A4, PRESETS, cutLines, layout, scaled, slots, type Mode, type PerPage } from "./layout";
import { NO_CROP, cropRect, rotated, type Crop, type Rotation } from "./crop";
import { DPIS, buildPdf, calibrationPdf } from "./pdf";
import "./App.css";

type Item = { id: string; path: string; name: string; url: string; w: number; h: number; copies: number; crop: Crop };

type Settings = { kind: Mode["kind"]; perPage: PerPage; sizeId: string; landscape: boolean; customW: number; customH: number; margin: number; gap: number; cuts: boolean; dpi: number };

const EXTS = ["jpg", "jpeg", "png", "webp"];
const PER_PAGE: PerPage[] = [1, 2, 4, 6, 8, 9];
const PX_PER_MM = 2; // preview scale
const THUMB = 1600; // longest edge of the preview image, px
const EDITOR = 480; // longest edge of the crop editor frame, px
const MAX_ZOOM = 5;
const SCALE_KEY = "printerScale"; // per-machine, so localStorage rather than the session

const initialScale = () => clamp(Number(localStorage.getItem(SCALE_KEY)) || 100, 90, 110);

const isImage = (p: string) => EXTS.includes(p.split(".").pop()!.toLowerCase());

// Decode with EXIF orientation applied, so preview and PDF see the same w×h.
const decode = async (path: string) =>
  createImageBitmap(await (await fetch(convertFileSrc(path))).blob(), { imageOrientation: "from-image" });

const toJpeg = (canvas: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode failed"))), "image/jpeg", q));

// Downscale so the preview doesn't hold full-res bitmaps; the PDF step re-decodes `path` at full resolution.
async function load(path: string): Promise<Item> {
  const bmp = await decode(path);
  const k = Math.min(1, THUMB / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // transparent PNGs print on white paper
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const item = { w: bmp.width, h: bmp.height };
  bmp.close();
  const thumb = await toJpeg(canvas, 0.9);
  const name = path.split(/[\\/]/).pop()!;
  return { ...item, id: crypto.randomUUID(), path, name, url: URL.createObjectURL(thumb), copies: 1, crop: NO_CROP };
}

/** The photo's crop at w×h px from the full-res file, as JPEG bytes for the PDF. Mirrors Frame's CSS transform. */
async function render(item: Item, w: number, h: number) {
  const bmp = await decode(item.path);
  const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  const r = cropRect(bmp.width, bmp.height, w, h, item.crop);
  const rot = rotated(bmp.width, bmp.height, item.crop.rotation);
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / r.w, w / r.w);
  ctx.translate(rot.w / 2 - r.x - r.w / 2, rot.h / 2 - r.y - r.h / 2); // crop centre → canvas centre
  ctx.rotate((item.crop.rotation * Math.PI) / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close();
  return new Uint8Array(await (await toJpeg(canvas, 0.92)).arrayBuffer());
}

const num = (v: string) => Math.max(0, Number(v) || 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const turn = (r: Rotation) => ((r + 90) % 360) as Rotation;

/** A w×h px window onto the photo, cropped and rotated by `crop.ts`. */
function Frame({ item, w, h, style, ...rest }: { item: Item; w: number; h: number } & HTMLAttributes<HTMLDivElement>) {
  const r = cropRect(item.w, item.h, w, h, item.crop);
  const k = w / r.w; // display px per source px
  const rot = rotated(item.w, item.h, item.crop.rotation);
  return (
    <div className="frame" style={{ ...style, width: w, height: h }} {...rest}>
      <img
        src={item.url}
        alt=""
        draggable={false}
        style={{
          left: (rot.w / 2 - r.x) * k,
          top: (rot.h / 2 - r.y) * k,
          width: item.w * k,
          height: item.h * k,
          transform: `translate(-50%, -50%) rotate(${item.crop.rotation}deg)`,
        }}
      />
    </div>
  );
}

function Editor({ item, cw, ch, onCrop, onClose }: { item: Item; cw: number; ch: number; onCrop: (c: Partial<Crop>) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const e = EDITOR / Math.max(cw, ch);
  const [w, h] = [cw * e, ch * e];
  const c = item.crop;

  // Drag moves the image with the pointer; offsets span the overflow, so convert px to -1..1.
  function pan(ev: PointerEvent) {
    if (!ev.buttons) return;
    const r = cropRect(item.w, item.h, w, h, c);
    const rot = rotated(item.w, item.h, c.rotation);
    const k = w / r.w;
    const step = (d: number, over: number) => (over > 1e-9 ? -d / k / (over / 2) : 0);
    onCrop({
      offsetX: clamp(c.offsetX + step(ev.movementX, rot.w - r.w), -1, 1),
      offsetY: clamp(c.offsetY + step(ev.movementY, rot.h - r.h), -1, 1),
    });
  }

  return (
    <dialog ref={ref} className="editor" onClose={onClose}>
      <Frame
        item={item}
        w={w}
        h={h}
        className="frame grab"
        onPointerDown={(ev) => ev.currentTarget.setPointerCapture(ev.pointerId)}
        onPointerMove={pan}
        onWheel={(ev) => onCrop({ zoom: clamp(c.zoom * Math.exp(-ev.deltaY * 0.002), 1, MAX_ZOOM) })}
      />
      <label>
        Zoom
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={c.zoom} onChange={(ev) => onCrop({ zoom: Number(ev.target.value) })} />
      </label>
      <div className="row">
        <button onClick={() => onCrop({ rotation: turn(c.rotation) })}>Rotate ⟳</button>
        <button onClick={() => onCrop(NO_CROP)}>Reset</button>
        <button className="primary" onClick={() => ref.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(""); // label of the running action
  const [editing, setEditing] = useState<string | null>(null);
  const [s, setS] = useState<Settings>({ kind: "grid", perPage: 4, sizeId: "passport", landscape: false, customW: 50, customH: 50, margin: 5, gap: 3, cuts: true, dpi: 300 });
  const [scale, setScale] = useState(initialScale);
  useEffect(() => localStorage.setItem(SCALE_KEY, String(scale)), [scale]);
  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));

  async function add(paths: string[]) {
    const ok = paths.filter(isImage);
    const results = await Promise.allSettled(ok.map(load));
    const loaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = ok.filter((_, i) => results[i].status === "rejected");
    const skipped = paths.length - ok.length;
    setItems((prev) => [...prev, ...loaded]);
    setError(
      [failed.length && `Couldn't load: ${failed.map((p) => p.split(/[\\/]/).pop()).join(", ")}`, skipped && `${skipped} non-image file(s) ignored`]
        .filter(Boolean)
        .join(". "),
    );
  }

  async function pick() {
    const paths = await open({ multiple: true, filters: [{ name: "Images", extensions: EXTS }] });
    if (paths) add(paths);
  }

  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop") add(e.payload.paths);
    });
    return () => void un.then((f) => f());
  }, []);

  useEffect(() => {
    const un = listen("add-photos", pick); // File > Add Photos…
    return () => void un.then((f) => f());
  }, []);

  const patch = (id: string, f: (p: Item) => Partial<Item>) => setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...f(p) } : p)));
  const setCrop = (id: string, c: Partial<Crop>) => patch(id, (p) => ({ crop: { ...p.crop, ...c } }));
  const remove = (id: string) =>
    setItems((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });

  // Custom sizes floor at 1 mm: a 0 mm cell would "fit" infinitely many times.
  const preset = PRESETS.find((p) => p.id === s.sizeId) ?? { w: Math.max(1, s.customW), h: Math.max(1, s.customH) };
  const mode: Mode = s.kind === "grid" ? { kind: "grid", perPage: s.perPage } : { kind: "size", w: preset.w, h: preset.h };
  const page = s.landscape ? { w: A4.h, h: A4.w } : A4;
  const pages = layout({ page, margin: s.margin, gap: s.gap, mode, photos: items });
  const byId = new Map(items.map((p) => [p.id, p]));
  const cell = slots({ page, margin: s.margin, gap: s.gap, mode })[0]; // every cell is the same size
  const edit = editing ? byId.get(editing) : undefined;
  const px = (mm: number) => mm * PX_PER_MM;

  const k = clamp(scale, 90, 110) / 100; // clamped here, not on input, so typing "105" isn't blocked at "1"
  const pdf = () => buildPdf(scaled(pages, page, k), page, s.cuts, s.dpi, (id, w, h) => render(byId.get(id)!, w, h));

  async function run(label: string, f: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(`${label} failed: ${e}`);
    } finally {
      setBusy("");
    }
  }

  async function exportPdf() {
    const path = await save({ defaultPath: "photos.pdf", filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (path) run("Export", async () => writeFile(path, await pdf()));
  }

  // Unique name, so a viewer still showing the previous file doesn't block or cache it.
  const print = (label: string, name: string, bytes: () => Promise<Uint8Array>) =>
    run(label, async () => {
      const path = await join(await tempDir(), `${name}-${Date.now()}.pdf`);
      await writeFile(path, await bytes());
      await openPath(path);
    });

  return (
    <div className="app">
      <aside className="side">
        <section>
          <button className="primary" onClick={pick}>Add photos…</button>
          <p className="muted">or drop JPEG, PNG, WebP files anywhere</p>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="list">
          {items.map((p) => (
            <div className="item" key={p.id}>
              <Frame item={p} w={40} h={40} className="frame thumb" title="Crop" onClick={() => setEditing(p.id)} />
              <span className="name" title={p.path}>{p.name}</span>
              <input
                type="number"
                min={1}
                value={p.copies}
                aria-label={`Copies of ${p.name}`}
                onChange={(e) => patch(p.id, () => ({ copies: Math.max(1, Math.floor(num(e.target.value))) }))}
              />
              <button className="icon" aria-label={`Rotate ${p.name}`} onClick={() => setCrop(p.id, { rotation: turn(p.crop.rotation) })}>⟳</button>
              <button className="icon" aria-label={`Remove ${p.name}`} onClick={() => remove(p.id)}>×</button>
            </div>
          ))}
        </section>

        <section className="settings">
          <div className="seg" role="radiogroup" aria-label="Layout mode">
            {(["grid", "size"] as const).map((k) => (
              <button key={k} role="radio" aria-checked={s.kind === k} className={s.kind === k ? "on" : ""} onClick={() => set({ kind: k })}>
                {k === "grid" ? "Grid" : "Real size"}
              </button>
            ))}
          </div>
          <div className="seg" role="radiogroup" aria-label="Paper orientation">
            {[false, true].map((l) => (
              <button key={String(l)} role="radio" aria-checked={s.landscape === l} className={s.landscape === l ? "on" : ""} onClick={() => set({ landscape: l })}>
                {l ? "Landscape" : "Portrait"}
              </button>
            ))}
          </div>
          {s.kind === "grid" ? (
            <label>
              Per page
              <select value={s.perPage} onChange={(e) => set({ perPage: Number(e.target.value) as PerPage })}>
                {PER_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ) : (
            <label>
              Size
              <select value={s.sizeId} onChange={(e) => set({ sizeId: e.target.value })}>
                {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">Custom…</option>
              </select>
            </label>
          )}
          {s.kind === "size" && s.sizeId === "custom" && (
            <>
              <label>
                Width (mm)
                <input type="number" min={1} step={0.5} value={s.customW} onChange={(e) => set({ customW: num(e.target.value) })} />
              </label>
              <label>
                Height (mm)
                <input type="number" min={1} step={0.5} value={s.customH} onChange={(e) => set({ customH: num(e.target.value) })} />
              </label>
            </>
          )}
          <label>
            Margin (mm)
            <input type="number" min={0} step={0.5} value={s.margin} onChange={(e) => set({ margin: num(e.target.value) })} />
          </label>
          <label>
            Gap (mm)
            <input type="number" min={0} step={0.5} value={s.gap} onChange={(e) => set({ gap: num(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={s.cuts} onChange={(e) => set({ cuts: e.target.checked })} />
            Cut lines
          </label>
          <label>
            Resolution (DPI)
            <select value={s.dpi} onChange={(e) => set({ dpi: Number(e.target.value) })}>
              {DPIS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>
            Printer scale (%)
            <input type="number" min={90} max={110} step={0.1} value={scale} onChange={(e) => setScale(num(e.target.value))} />
          </label>
          <button className="primary" disabled={!!busy || !pages.length} onClick={() => print("Print", "photos", pdf)}>
            {busy === "Print" ? "Preparing…" : "Print…"}
          </button>
          <p className="muted">In the print dialog choose "Actual size" / 100%, not "Fit to page".</p>
          <button disabled={!!busy || !pages.length} onClick={exportPdf}>
            {busy === "Export" ? "Exporting…" : "Export PDF…"}
          </button>
          <button disabled={!!busy} onClick={() => print("Calibration", "calibration", () => calibrationPdf(A4, k))}>
            Print calibration page…
          </button>
        </section>
      </aside>

      <main className="preview">
        <div className="count muted">
          {pages.length} page{pages.length === 1 ? "" : "s"}
          {items.length > 0 && pages.length === 0 && " — nothing fits; reduce margin or pick a smaller size"}
        </div>
        <div className="pages">
          {pages.map((cells, i) => {
            const cuts = s.cuts ? cutLines(cells) : { xs: [], ys: [] };
            return (
              <div className="page" key={i} style={{ width: px(page.w), height: px(page.h) }}>
                {cuts.xs.map((x) => <div key={`x${x}`} className="cut v" style={{ left: px(x) }} />)}
                {cuts.ys.map((y) => <div key={`y${y}`} className="cut h" style={{ top: px(y) }} />)}
                {cells.map((c, j) => (
                  <Frame
                    key={j}
                    item={byId.get(c.photoId)!}
                    w={px(c.w)}
                    h={px(c.h)}
                    className="frame cell"
                    style={{ left: px(c.x), top: px(c.y) }}
                    onClick={() => setEditing(c.photoId)}
                  />
                ))}
              </div>
            );
          })}
        </div>
        {items.length === 0 && <div className="empty muted">Add photos to see the layout</div>}
      </main>
      {edit && cell && (
        <Editor key={edit.id} item={edit} cw={cell.w} ch={cell.h} onCrop={(c) => setCrop(edit.id, c)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
