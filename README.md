# Photo Printer

Desktop app for macOS, Windows and Linux that lays out photos on A4 paper and prints them.

- Grid presets (1/2/4/6/8/9 per page) or physical photo sizes (passport, wallet, 4x6, 5x7 ...). Copies fill the sheet; overflow spills onto extra pages.
- Margins, gaps, cut lines, and per-photo crop (pan/zoom) and rotate.
- Output is a single PDF. **Export** saves it; **Print** opens it in your default PDF viewer so you print from there.

Built with Tauri 2, React 19, TypeScript and Vite.

## Prerequisites

- Node.js ≥ 23 (the tests use Node's built-in type stripping)
- Rust (stable), via [rustup](https://rustup.rs)
- Tauri's OS dependencies: see [Tauri prerequisites](https://tauri.app/start/prerequisites/)
  - macOS: Xcode Command Line Tools
  - Windows: Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 11)
  - Linux: `webkit2gtk-4.1`, `libappindicator3` / `libayatana-appindicator3`, `librsvg2`, build-essential, and the other packages listed for your distro

## Develop

```sh
npm install
npm run tauri dev
```

Checks:

```sh
npm run build   # type-check + bundle the frontend
npm test        # node --test on src/*.test.ts
```

## Build installers

Run this on each target OS. There is no cross-compilation and no CI.

```sh
npm run tauri build
```

Output goes to `src-tauri/target/release/bundle/`:

| OS      | Installers                         |
|---------|------------------------------------|
| macOS   | `macos/Photo Printer.app`, `dmg/*.dmg` |
| Windows | `msi/*.msi`, `nsis/*-setup.exe`    |
| Linux   | `deb/*.deb`, `appimage/*.AppImage`, `rpm/*.rpm` |

To regenerate the icons from `logo.png`, run `npm run tauri icon logo.png`.

## Printing

Physical sizes (passport, 4x6 ...) only come out right if the PDF prints unscaled.

1. In the print dialog choose **Actual size** / **100%**, not **Fit to page** / **Shrink to fit**.
2. Print the **calibration page** (sidebar button). It has two 100 mm rulers.
3. Measure them. If your printer still scales slightly, set **Printer scale (%)** to compensate. For example, if 100 mm measures 98 mm, enter `102`. The value is saved per machine (range 90–110%).
