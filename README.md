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
   - **Export tiled PDF** → a 1:1 portrait PDF (19 sheets of A4 for a
     64×169 cm mirror, once the blank ones are dropped) with 10 mm overlap
     bands, corner brackets, join ticks and a cover sheet.
   - **Save file / Open file** — the whole design as one JSON: the wall photo,
     the calibration rectangle and its real size, and the outline.

## Printing the template

- Print at **100%** — turn OFF "fit to page" / "shrink to fit".
- Measure the 10 cm ruler on the cover sheet with a real ruler to confirm scale.
- Cut every sheet along the two dashed lines down its left and across its top.
- Each sheet already on the table carries bold corner brackets labelled with a
  sheet number. Lay each sheet down with its cut corner in the bracket that
  carries its number, on top of what is already there.
- The hatched 10 mm strips are the parts that end up underneath — that is where
  the tape goes.

### How the sheets join

Each sheet is trimmed on its **leading** edges — left and top — and laid **on
top** of its left and upper neighbours. Its first column of ink starts exactly
at the cut, so the outline runs straight off one sheet and onto the next.

Every sheet is cut on both leading edges whether or not it has a neighbour
there. That makes the rule uniform, and — the real reason — it makes every
sheet's **paper corner** be its first corner of ink, which is the thing the
brackets on the sheet below are pointing at. Leave the first row and column
untrimmed and their corners sit 10 mm of blank margin away from what they are
supposed to line up with.

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

### Marks you can actually use

The governing fact is that **paper is opaque**. A mark only helps if it is on the
sheet already lying on the table, in the part of it that is still showing — so
every seam is described from below:

- the strip that will end up hidden is **hatched**, because "this part is
  covered" is the one thing about an overlap that is not obvious. It is measured
  by the next sheet's *whole footprint*, not by the overlap band: the sheet
  arrives carrying its own unprintable margin, so if the trim gets skipped — the
  first thing that goes wrong — it lands a margin further over than the band and
  buries a strip that the shading claimed was safe;
- everything that has to stay legible lives inside `readableRect`, the kept area
  pulled back by one margin wherever a sheet arrives, so an untrimmed neighbour
  cannot eat it. (It could, and did: in a photo of two real sheets the caption
  `R2-C2` had been cut down to `R2-`.) The QR obeys the same rule — a code flush
  against a seam scans until someone forgets to trim, then never again;
- a dotted line marks where the next sheet's cut edge lands;
- a **bold L-bracket** marks the exact point its corner goes, labelled with that
  sheet's number. You put the corner of the paper into the bracket that carries
  its number. The arms point into the part that stays visible, so after placing
  it they still point at the corner and you can see whether it drifted.
- a pair of ticks per seam runs up to it from both sides and forms one straight
  line only when the sheets are aligned, which pins rotation as well as position.

Before this, the only marks were registration crosses at each sheet's own
printable corners: the trailing ones were cut off and the leading ones ended up
*underneath* the next sheet, so nothing was left to line up against.

`assembly.test.ts` checks each bracket's vertex is exactly where the incoming
sheet's paper corner lands, that no arm runs into the strip that gets covered,
that the hatching covers exactly what an *untrimmed* sheet would hide, and that
no caption falls inside that footprint. The one exception is the tiny label
naming the strip itself, which has to be inside it — that is marked by being the
only text at `STRIP_LABEL_PT`, so the test can tell it apart from a caption that
was buried by accident.

The trim is the step everything else depends on, so it gets its own dark line at
the top of each sheet rather than a grey aside: *"FIRST: cut off the strips
beyond the dashed lines at the top and left."*

### Blank sheets

By default, a sheet whose kept area the outline never crosses is left out — the
corners of the grid on a rounded mirror, and the middle of a big one. A
64×169 cm mirror on A4 goes from 28 sheets to 19. The cover's overview map
shades the ones that were dropped so the grid still reads. Turn the option off
in the print dialog to get a solid sheet of paper with no holes in the middle.

### Margins

The page margin is 5 mm, not the 10 mm that looks safe. It is dead paper twice
over — thrown away on the two edges that get trimmed, and subtracted from the
step every sheet advances by — so halving it grows the step from 180×267 to
190×277 mm, 7% more usable paper per sheet, and drops a whole row or column
whenever the shape lands near a boundary (a 163 cm mirror goes 28 → 24 sheets).

5 mm clears the hardware margin of essentially every consumer laser and inkjet
printing plain A4 outside borderless mode, which is typically 3–4.3 mm. It
cannot go much lower: unlike "fit to page", a hardware margin does not scale the
page, it simply drops whatever falls inside it — and what sits closest to the
edge here is the trim line the whole assembly is aligned from.

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
