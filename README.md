# Mirror Wall Studio

**[Live demo → agasy18.github.io/mirror-wall-studio](https://agasy18.github.io/mirror-wall-studio/)**

A browser app to design an organic full-length mirror shape and export a
**1:1 multi-page A4 PDF** you print, tape together, and use as a physical
cutting/tracing template on the wall. Everything runs client-side — your photo
never leaves your machine.

The mirror is sized by the wall area you mark during calibration: every preset
is placed to fill that area (minus a safe margin) and takes its proportions, so
a tall alcove gives tall mirrors and a wide one gives wide mirrors.

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
   of the rectangle ("rack") onto a real rectangular region of the wall — or
   drag from anywhere inside it to slide the whole rectangle without changing
   its shape — and type that region's true size in cm. Click **Done** — the photo is
   automatically straightened (perspective + rotation corrected via a homography
   → CSS `matrix3d`) so you design on a head-on wall at true scale.
2. **Step 2 · Design & export** —
   - Drag the control points to reshape the mirror; **double-click** to add a
     point; select a point and press **Delete** to remove it.
   - Pick a silhouette from the catalog — each is placed to fill the area you
     marked, so the thumbnails and the mirror share the marked area's
     proportions.
   - Toggle the glassy backlit **mirror effect**, the **cm grid**, the
     straightened **wall backdrop** and the **A4 page overlay**, or change the
     **safe margin** kept clear inside the marked area.
   - **Preview** drops the straightening and puts the mirror back into the
     original photo: the outline is pushed through the calibration homography,
     so it sits on the wall at the angle the room was shot from. Editing still
     happens on the straightened wall, because that is the only place
     centimetres are square.
   - **Export tiled PDF** → a 1:1 portrait PDF (~4×7 = 28 sheets for a
     68×173 cm mirror, fewer once the blank ones are dropped) with 10 mm
     overlap bands, join ticks, page labels, and a cover sheet.
   - **Save file / Open file** — the whole design as one JSON: the wall photo,
     the calibration rectangle and its real size, and the outline.

## Printing the template

- Print at **100%** — turn OFF "fit to page" / "shrink to fit".
- Measure the 10 cm ruler on the cover sheet with a real ruler to confirm scale.
- Each sheet names the edges to trim. Cut those, lay the sheet on top of its
  left and upper neighbours so its cut edge follows their dotted line and the
  short ticks meet end to end, and tape the seam.

### How the sheets join

Each sheet is trimmed on its **leading** edges — left if it has a neighbour to
the left, top if it has one above — and laid **on top** of those neighbours. Its
first column of ink starts exactly at the cut, so the outline runs straight off
one sheet and onto the next.

Trimming the *trailing* edge instead, which is what this did originally and what
it looks like the overlap band is for, quietly destroys the template: the next
sheet still carries its own 10 mm unprintable margin on its leading edge, so
laying it down covers the last 10 mm of the sheet underneath with blank paper. A
white band at every seam, straight through the line you are supposed to cut
along — about 6% of the outline, in stretches up to 13 mm.

`assembly.test.ts` exports a real PDF, reads the pages back
(`pdfPages.ts`), lays the sheets out the way the cover tells the user to and
checks the outline is still one unbroken curve. Paper is treated as opaque, so
a sheet that covers its neighbour's ink fails the test — page-by-page geometry
was always right, and only stacking the sheets shows the bug.

Every seam carries marks on **both** sheets: a dotted "the next sheet's edge
goes here" line on the one underneath, a dashed "cut here" line on the one on
top, and a pair of ticks running up to the seam from each side that form one
straight line only when the two are aligned. Two ticks per seam pin down
rotation as well as position. (Before, the only marks were registration crosses
at each sheet's own printable corners: the trailing ones were cut off and the
leading ones ended up underneath the next sheet, so there was nothing left to
line up against.)

### Blank sheets

By default, a sheet whose kept area the outline never crosses is left out — the
corners of the grid on a rounded mirror, and the middle of a big one. For a
68×173 cm mirror on A4 that is 28 sheets down to 20. The cover's overview map
shades the ones that were dropped so the grid still reads. Turn the option off
in the print dialog to get a solid sheet of paper with no holes in the middle.

The cover sheet opens with what you are about to print: finished size, glass
area, outline length, paper, sheet count and grid, then the scale ruler, the
assembly steps, and a scale drawing of the mirror laid over the sheet map.

The optional QR goes **inside the outline on the template sheets**, not on the
cover — the cover is read once and binned, while the paper inside the outline is
cut out and becomes the stencil that gets taped to a wall and photographed. A
few codes are placed (roughly one per six sheets, capped at four), spread apart
by farthest-point selection so they do not clump into one column of a tall
mirror. Each is positioned so its whole block sits inside the curve *and* inside
one sheet's kept area — never across an overlap band, where it would only scan
if the tape lined up perfectly. If no such spot exists (a very narrow mirror),
no code is drawn rather than a clipped one.

## On a phone

The shape catalog is a horizontal strip docked under the canvas rather than a
bottom sheet behind a FAB: one tap picks a shape and you are looking at the
result, with nothing to dismiss. The move/scale pad starts collapsed behind a
single key so the canvas keeps its height, and the wordmark drops to its glyph.

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
- `src/export/tilePdf.ts` — jsPDF 1:1 tiled export; `sheets.ts` (which sheets
  are worth printing, kept without jsPDF so the print dialog can count them),
  `pdfPages.ts` (read a built PDF back, for the assembly test).
- `src/state/project.ts` — the save/open file format. Everything a file carries
  becomes app state, so it is validated rather than trusted, and the photo is
  only accepted as an inline `data:` URL — a project that could point the app at
  a remote image would let whoever sent it learn when it was opened.
- `src/render/warpPhoto.ts` — the straightening. Canvas 2D has no projective
  transform, so the photo is redrawn as a mesh of affine triangles. The mesh
  must be **fine**: an affine map matches the homography only at the three
  corners it was solved from, so a two-triangle mesh lined up only at the
  photo's corners and put the straightened wall 68 px out of place on average
  (123 px worst) for a typical off-axis shot. A 48×48 mesh brings that to ~2 px,
  costing ~40 ms once per calibration. `warpMesh.test.ts` measures the error
  directly and would fail if the mesh were coarsened.

## Deploying

Every push to `main` triggers `.github/workflows/deploy.yml`, which typechecks,
runs the unit tests, builds, and publishes `dist/` to GitHub Pages.

The production build is served from a subpath, so `vite.config.ts` sets
`base` to `/mirror-wall-studio/` for builds and `/` for the dev server. Assets
loaded from `public/` at runtime must be referenced as
`` `${import.meta.env.BASE_URL}file.png` `` — a bare `/file.png` works locally
but 404s on Pages.


## Languages

The UI ships in 13 languages (`src/i18n/locales/`). Each one is a **real URL**,
not a client-side mode: English at `/`, everything else at `/de/`, `/zh-Hans/`,
`/pt-BR/` and so on. `scripts/inject-prerender.mjs` renders the landing page
once per language into its own `index.html`, with a translated `<title>` and
description, a self-referencing canonical, and reciprocal `hreflang` links — so
each language is separately indexable by crawlers that never run JavaScript.

The language is read off the path, so the page that was served and the language
React renders can never disagree. A first-time visitor on `/` is redirected once
to their browser's language; after that the URL wins. Switching language from
the picker does not reload — it swaps the bundle and rewrites the URL, so you
do not lose your design mid-edit.

Only English is bundled; the other twelve are lazy chunks (8–18 kB each).
`src/i18n/locales.test.ts` guards the set: every bundle must cover every key,
keep every `{{placeholder}}` and inline tag, and use exactly the CLDR plural
categories its language actually has (Russian's four, Arabic's six, Japanese's
one) — checked against `Intl.PluralRules`.

The **PDF is English-only**. jsPDF's built-in fonts are Latin-1; Cyrillic, CJK,
Devanagari and Arabic would need an embedded font file (megabytes for CJK), so
the template's instructions stay in English and the UI says so.

## Search engines

`dist/sitemap.xml` is generated at build time and lists every language URL with
its full set of `xhtml:link` alternates. There is deliberately no
`robots.txt`: it is a per-origin file, so one served from
`/mirror-wall-studio/` would be ignored by every crawler — it would have to live
at the `agasy18.github.io` root. A missing `robots.txt` means "allow all", so
nothing is blocked.

`public/<key>.txt` is an [IndexNow](https://www.indexnow.org/) key, which lets
Bing, Yandex, Seznam and Naver be notified of changes without an account.
Google retired its sitemap ping endpoint in 2023 and needs the sitemap submitted
through Search Console by hand.

## License

[MIT](LICENSE) © 2026 Aghasi Poghosyan
