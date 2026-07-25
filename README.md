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
   of the rectangle ("rack") onto a real rectangular region of the wall, and
   type that region's true size in cm. Click **Done** — the photo is
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
   - **Export tiled PDF** → a 1:1 A4 portrait PDF (~4×7 = 28 pages for a
     68×173 cm mirror) with 10 mm overlap bands, registration crosses, page
     labels, and a 10 cm verification ruler on page 1.

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
