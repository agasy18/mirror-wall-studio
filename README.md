# Mirror Wall Studio

**[Live demo → agasy18.github.io/mirror-wall-studio](https://agasy18.github.io/mirror-wall-studio/)**

A browser app to design an organic full-length mirror shape and export a
**1:1 multi-page A4 PDF** you print, tape together, and use as a physical
cutting/tracing template on the wall. Everything runs client-side — your photo
never leaves your machine.

Target mirror size: **68 × 173 cm** (from the reference photo).

## Run

```bash
npm install      # once
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm test         # pure-math unit tests (geometry, tiling, homography)
npm run build    # typecheck + production build
```

## The flow

1. **Step 1 · Calibrate wall** — load a photo of your wall. Drag the 4 corners
   of the rectangle ("rack") onto a real rectangular region of the wall, and
   type that region's true size in cm. Click **Done** — the photo is
   automatically straightened (perspective + rotation corrected via a homography
   → CSS `matrix3d`) so you design on a head-on wall at true scale.
2. **Step 2 · Design & export** —
   - Drag the control points to reshape the mirror; **double-click** to add a
     point; select a point and press **Delete** to remove it.
   - Toggle the glassy backlit **mirror effect**, the **cm grid**, the
     straightened **wall backdrop**, the **A4 page overlay**, and
     **Lock to 68×173 cm** (normalizes the bounding box exactly).
   - **Export tiled PDF** → a 1:1 A4 portrait PDF (~4×7 = 28 pages for
     68×173 cm) with 10 mm overlap bands, registration crosses, page labels,
     and a 10 cm verification ruler on page 1.

## Printing the template

- Print at **100%** — turn OFF "fit to page" / "shrink to fit".
- Measure the 10 cm ruler on page 1 with a real ruler to confirm scale.
- Trim along the dashed overlap lines and tape sheets together using the
  registration crosses.

## Dev shortcuts

- `http://localhost:5173/?demo` — loads the bundled wall photo and jumps
  straight to the editor.
- `http://localhost:5173/?democal` — loads the photo on the calibration screen.

## Structure

- `src/model/` — pure, tested math: `geometry.ts` (smooth closed path, bbox,
  normalize), `tiling.ts` (A4 page grid), `homography.ts` (perspective).
- `src/state/` — Zustand stores (`useShapeStore`, `useCalibrationStore`), Immer
  middleware, edits via actions.
- `src/components/` — `PhotoCalibration`, `CalibrationRect`, `ShapeEditor`,
  `MirrorDefs`, `ExportPanel`.
- `src/export/tilePdf.ts` — jsPDF 1:1 tiled export.

## Deploying

Every push to `main` triggers `.github/workflows/deploy.yml`, which typechecks,
runs the unit tests, builds, and publishes `dist/` to GitHub Pages.

The production build is served from a subpath, so `vite.config.ts` sets
`base` to `/mirror-wall-studio/` for builds and `/` for the dev server. Assets
loaded from `public/` at runtime must be referenced as
`` `${import.meta.env.BASE_URL}file.png` `` — a bare `/file.png` works locally
but 404s on Pages.

## License

[MIT](LICENSE) © 2026 Aghasi Poghosyan

## Search engines

`public/sitemap.xml` lists the single canonical URL. There is deliberately no
`robots.txt`: it is a per-origin file, so one served from
`/mirror-wall-studio/` would be ignored by every crawler — it would have to live
at the `agasy18.github.io` root. A missing `robots.txt` means "allow all", so
nothing is blocked.

`public/<key>.txt` is an [IndexNow](https://www.indexnow.org/) key, which lets
Bing, Yandex, Seznam and Naver be notified of changes without an account.
Google retired its sitemap ping endpoint in 2023 and needs the sitemap submitted
through Search Console by hand.
