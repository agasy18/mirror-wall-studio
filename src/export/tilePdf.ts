import { jsPDF } from "jspdf";
import {
  clipPolylineToRect,
  curveBounds,
  rectInPolygon,
  sampleClosedSpline,
} from "../model/geometry";
import type { ShapePoint } from "../model/shape";
import { DEFAULT_TILE_CONFIG, planTiles, type TileConfig, type TilePlan, type Tile } from "../model/tiling";
import { keptRect, outlineStats, readableRect, sheetsToPrint } from "./sheets";
import { APP_NAME, APP_URL, APP_URL_LABEL } from "../model/brand";
import { encodeQr, qrRuns } from "../model/qr";

const CM_TO_MM = 10;

/**
 * Export the mirror outline as a 1:1 tiled PDF at the configured paper size.
 * Page 1 is a cover sheet (overview, metrics, scale check, assembly map); every
 * page after it is a template tile.
 *
 * ## How the sheets join
 *
 * Each sheet is trimmed along its LEADING edges — the left one if it has a
 * neighbour to its left, the top one if it has a neighbour above — and then
 * laid ON TOP of those neighbours. Its first column of ink starts exactly at
 * the cut, so the outline runs straight off one sheet and onto the next.
 *
 * Trimming the trailing edge instead (the obvious-looking choice) quietly
 * destroys the template: the next sheet still carries its own unprintable
 * margin on its leading edge, so laying it down covers the last `margin` mm of
 * the sheet underneath with blank paper — a white band at every seam, right
 * through the line you are supposed to cut along.
 */
export interface ExportOptions {
  /** Print a QR to the app inside the mirror outline, on the template sheets. */
  watermark?: boolean;
  /** Leave out sheets the outline never crosses. Defaults to true. */
  skipBlank?: boolean;
}

export function exportTiledPdf(
  points: ShapePoint[],
  cfg: TileConfig = DEFAULT_TILE_CONFIG,
  opts: ExportOptions = {},
) {
  const built = buildTiledPdf(points, cfg, opts);
  built.doc.save(built.filename);
  return built.plan;
}

export interface BuiltPdf {
  doc: jsPDF;
  plan: TilePlan;
  /** Indices into `plan.tiles`, in print order, of the sheets actually output. */
  printed: number[];
  filename: string;
}

/**
 * Build the document without saving it. Kept separate from `exportTiledPdf` so
 * the sheets can be reassembled and measured in a test — the only way to know
 * that what comes out of the printer still joins up.
 */
export function buildTiledPdf(
  points: ShapePoint[],
  cfg: TileConfig = DEFAULT_TILE_CONFIG,
  opts: ExportOptions = {},
): BuiltPdf {
  // Measured on the drawn curve, not the control points: the spline overshoots
  // them, and shifting/paginating by the control bbox pushed part of the
  // outline off the page and understated the finished size.
  const bb = curveBounds(points);
  if (bb.width <= 0 || bb.height <= 0) {
    throw new Error("Shape has no area to export");
  }

  // Shift points so the shape's top-left is the origin, then scale cm -> mm.
  const shifted = points.map((p) => ({
    ...p,
    x: (p.x - bb.minX) * CM_TO_MM,
    y: (p.y - bb.minY) * CM_TO_MM,
  }));
  const shapeWmm = bb.width * CM_TO_MM;
  const shapeHmm = bb.height * CM_TO_MM;

  const plan = planTiles(shapeWmm, shapeHmm, cfg);
  const m = cfg.pageMarginMm;
  const pw = cfg.paper.wmm;
  const ph = cfg.paper.hmm;

  // Sample once; every tile draws a clipped view of the same polyline.
  const outline = sampleClosedSpline(shifted, 24);
  const printed = sheetsToPrint(outline, plan, opts.skipBlank !== false);
  const printedSet = new Set(printed);

  // jsPDF accepts an explicit [w,h] mm format for any paper size.
  const doc = new jsPDF({ unit: "mm", format: [pw, ph], orientation: "portrait" });

  drawCoverPage(doc, { m, pw, ph, plan, printed, outline, bb, cfg });

  // A few QRs, inside the outline, spread across sheets that can hold one whole.
  const qrByTile = new Map<number, QrSpot>();
  if (opts.watermark) {
    for (const spot of findQrSpots(outline, plan, QR_BLOCK, printed, m)) qrByTile.set(spot.tile, spot);
  }

  printed.forEach((tileIndex, i) => {
    const tile = plan.tiles[tileIndex];
    doc.addPage([pw, ph], "portrait");

    // Map shape-mm coords -> page-mm coords for this tile.
    // Content region [tile.contentX .. +printableW] maps to [margin .. margin+printableW].
    const offsetX = m - tile.contentXmm;
    const offsetY = m - tile.contentYmm;

    // --- outline, clipped to THIS tile's printable area ---
    // The clip runs to the full printable area, overlap band included: that band
    // is deliberately printed twice, once on each side of the seam, so the sheet
    // laid on top has ink right up to its cut edge.
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(OUTLINE_MM);
    const runs = clipPolylineToRect(outline, {
      x: tile.contentXmm,
      y: tile.contentYmm,
      w: plan.printableWmm,
      h: plan.printableHmm,
    });
    for (const run of runs) {
      for (let k = 1; k < run.length; k++) {
        doc.line(
          run[k - 1].x + offsetX,
          run[k - 1].y + offsetY,
          run[k].x + offsetX,
          run[k].y + offsetY,
        );
      }
    }

    // Only mark seams where a sheet actually arrives: with the blank ones left
    // out, a bracket for a sheet that was never printed is ink on the stencil
    // pointing at nothing.
    const printedAt = (row: number, col: number) =>
      row < plan.rows &&
      col < plan.cols &&
      printedSet.has(row * plan.cols + col);

    drawSheetMarks(doc, {
      m,
      pw,
      ph,
      plan,
      tile,
      hasRight: printedAt(tile.row, tile.col + 1),
      hasBelow: printedAt(tile.row + 1, tile.col),
      hasDiagonal: printedAt(tile.row + 1, tile.col + 1),
    });
    drawSheetLabel(doc, { m, plan, tile, sheetNo: i + 1, total: printed.length });

    // --- QR, if one landed on this sheet ---
    const qrSpot = qrByTile.get(tileIndex);
    if (qrSpot) drawCredit(doc, qrSpot.x + offsetX, qrSpot.y + offsetY);
  });

  return {
    doc,
    plan,
    printed,
    filename: `mirror-template-${bb.width.toFixed(0)}x${bb.height.toFixed(0)}cm.pdf`,
  };
}

/** Stroke width of the outline, in mm. Nothing else on a sheet uses it. */
export const OUTLINE_MM = 0.4;
/** Length of one half of a join tick — 8 mm each side of a seam. */
const JOIN_TICK_MM = 8;

export { keptRect, outlineStats, readableRect, sheetsToPrint } from "./sheets";

/** Arm length of a corner target, in mm. */
const CORNER_ARM_MM = 20;

/**
 * Point size used only for the captions printed inside a shaded strip. They are
 * the one class of text allowed to be covered — the strip they name is what
 * covers them — so the size doubles as the marker that says so.
 */
export const STRIP_LABEL_PT = 5;

/**
 * Everything that tells you where this sheet goes and what goes on it.
 *
 * The governing fact is that **paper is opaque**. A mark can only help if it is
 * on the sheet already lying on the table, in the part of it that is still
 * showing — so every seam is described from below: the strip that will end up
 * hidden is hatched, the dotted line is where the next sheet's cut edge lands,
 * and a bold L-bracket marks the exact point its corner goes, labelled with
 * that sheet's name. You put the corner of the paper into the bracket that
 * carries its number; the arms stay visible afterwards, pointing at it, so you
 * can see whether it drifted.
 *
 * Every sheet is cut on its top and left, whether or not it has a neighbour
 * there. That makes the rule uniform — "cut the two solid lines" — and, more
 * importantly, makes every sheet's paper corner *be* its first corner of ink,
 * which is what the brackets on the sheet below are pointing at. Leaving the
 * first row and column untrimmed would have left their corners 10 mm of blank
 * margin away from the thing they are supposed to line up with.
 */
function drawSheetMarks(
  doc: jsPDF,
  opts: {
    m: number;
    pw: number;
    ph: number;
    plan: TilePlan;
    tile: Tile;
    hasRight: boolean;
    hasBelow: boolean;
    hasDiagonal: boolean;
  },
) {
  const { m, pw, ph, plan, tile, hasRight, hasBelow, hasDiagonal } = opts;
  const seamX = m + plan.stepXmm;
  const seamY = m + plan.stepYmm;

  // --- the strips the next sheets cover ---
  // Measured by the next sheet's WHOLE footprint, not by the overlap band: it
  // arrives carrying its own unprintable margin, so if the trim is skipped — the
  // first thing that goes wrong — it lands a margin further over than the band
  // and buries a strip of this sheet. Shading only the band said that strip was
  // safe when it was not, and the labels sitting in it were cut in half.
  if (hasRight) hatch(doc, { x: seamX - m, y: m, w: pw - seamX, h: ph - 2 * m });
  if (hasBelow) hatch(doc, { x: m, y: seamY - m, w: pw - 2 * m, h: ph - seamY });
  // Named inside the shading, at the one size nothing else uses: these say which
  // sheet covers the strip, are read once before it is covered, and are gone
  // afterwards — unlike the corner captions, which have to survive.
  doc.setFontSize(STRIP_LABEL_PT);
  doc.setTextColor(165, 165, 165);
  if (hasRight) doc.text(label(tile.row, tile.col + 1), seamX - m + 1.2, m + 3.4);
  if (hasBelow) doc.text(`under ${label(tile.row + 1, tile.col)}`, m + 1.5, seamY - m + 3.4);

  // --- trim lines: cut along these first, on every sheet ---
  // 0.35, not 0.3: the join ticks own 0.3, and the tests tell the two apart by
  // stroke width alone.
  doc.setLineWidth(0.35);
  doc.setDrawColor(80, 80, 80);
  doc.setLineDashPattern([6, 2], 0);
  doc.line(m, m, m, ph - m);
  doc.line(m, m, pw - m, m);

  // --- seam lines: where the next sheet's cut edge lands ---
  doc.setLineWidth(0.2);
  doc.setDrawColor(175, 175, 175);
  doc.setLineDashPattern([0.7, 1.3], 0);
  if (hasRight) doc.line(seamX, m, seamX, ph - m);
  if (hasBelow) doc.line(m, seamY, pw - m, seamY);
  doc.setLineDashPattern([], 0);

  // --- corner targets ---
  // Each neighbour arrives top-left corner first, and lands on a corner of this
  // sheet's kept area. Arms point into the part that stays visible, and captions
  // sit a full margin clear of the shading so an untrimmed sheet cannot eat them.
  const clear = m + 3;
  cornerTarget(doc, m, m, 1, 1, "this corner", true, clear);
  if (hasRight) cornerTarget(doc, seamX, m, -1, 1, label(tile.row, tile.col + 1), false, clear);
  if (hasBelow) cornerTarget(doc, m, seamY, 1, -1, label(tile.row + 1, tile.col), false, clear);
  if (hasDiagonal) {
    cornerTarget(doc, seamX, seamY, -1, -1, label(tile.row + 1, tile.col + 1), false, clear);
  }

  // --- join ticks along each shared edge ---
  // The corners fix where a sheet starts; these confirm it has not rotated. Both
  // sheets of a seam share a row (or column), so they land on the same page
  // coordinate on each and meet end to end.
  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.3);
  const ys = [m + plan.printableHmm * 0.25, m + plan.printableHmm * 0.75];
  const xs = [m + plan.printableWmm * 0.25, m + plan.printableWmm * 0.75];
  if (tile.col > 0) for (const y of ys) doc.line(m, y, m + JOIN_TICK_MM, y);
  if (hasRight) for (const y of ys) doc.line(seamX - JOIN_TICK_MM, y, seamX, y);
  if (tile.row > 0) for (const x of xs) doc.line(x, m, x, m + JOIN_TICK_MM);
  if (hasBelow) for (const x of xs) doc.line(x, seamY - JOIN_TICK_MM, x, seamY);
}

/**
 * A bold L at (x, y) with its arms running in (dirX, dirY), and a caption
 * naming the sheet whose corner belongs in it.
 */
function cornerTarget(
  doc: jsPDF,
  x: number,
  y: number,
  dirX: 1 | -1,
  dirY: 1 | -1,
  caption: string,
  own: boolean,
  clear: number,
) {
  doc.setDrawColor(0, 0, 0);
  // Never OUTLINE_MM: the outline has to stay the only thing on a sheet drawn at
  // that width, or the assembly test cannot tell ink apart from instructions.
  doc.setLineWidth(own ? 0.5 : 0.7);
  doc.line(x, y, x + dirX * CORNER_ARM_MM, y);
  doc.line(x, y, x, y + dirY * CORNER_ARM_MM);

  doc.setFontSize(own ? 6 : 8);
  doc.setTextColor(own ? 150 : 40, own ? 150 : 40, own ? 150 : 40);
  // Inside the bracket, on the side the arms point to, and offset in BOTH axes by
  // more than a margin so it stays legible whichever neighbour overhangs.
  doc.text(caption, x + dirX * clear, y + dirY * (own ? CORNER_ARM_MM + 4 : clear), {
    align: dirX > 0 ? "left" : "right",
  });
}

/** Diagonal shading, light enough to read the outline straight through it. */
function hatch(doc: jsPDF, r: { x: number; y: number; w: number; h: number }, stepMm = 5) {
  doc.setDrawColor(205, 205, 205);
  doc.setLineWidth(0.15);
  for (let d = stepMm; d < r.w + r.h; d += stepMm) {
    doc.line(
      r.x + Math.min(d, r.w),
      r.y + Math.max(0, d - r.w),
      r.x + Math.max(0, d - r.h),
      r.y + Math.min(d, r.h),
    );
  }
}

function label(row: number, col: number) {
  return `R${row + 1}-C${col + 1}`;
}

/**
 * Sheet name, position in the run, and the one instruction that has to land.
 *
 * The cut used to be a 6.5 pt aside at the end of a grey line, and it got
 * skipped — which puts the sheet a margin out of place and buries the marks on
 * whatever is underneath. It is the step the whole assembly depends on, so it
 * gets its own darker line. Everything sits clear of the corner bracket it
 * shares the top-left of the sheet with.
 */
function drawSheetLabel(
  doc: jsPDF,
  opts: { m: number; plan: TilePlan; tile: Tile; sheetNo: number; total: number },
) {
  const { m, tile, sheetNo, total } = opts;
  const x = m + CORNER_ARM_MM + 3;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(tile.label, x, m + 4.5);
  doc.setFontSize(6.5);
  doc.setTextColor(160, 160, 160);
  doc.text(`sheet ${sheetNo} of ${total}`, x, m + 9);
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  doc.text(
    "FIRST: cut off the strips beyond the dashed lines at the top and left.",
    x,
    m + 14.5,
  );
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Skip that and this sheet sits 5 mm out and hides part of the one beneath.",
    x,
    m + 18.5,
  );
}

/**
 * Cover sheet: what you are about to print, at a glance, then how to print and
 * assemble it. The 10 cm verification ruler lives here rather than on page 1 of
 * the template, where its 100 mm bar overprinted the outline the user traces.
 */
function drawCoverPage(
  doc: jsPDF,
  opts: {
    m: number;
    pw: number;
    ph: number;
    plan: TilePlan;
    printed: number[];
    outline: { x: number; y: number }[];
    bb: { width: number; height: number };
    cfg: TileConfig;
  },
) {
  const { m, pw, ph, plan, printed, outline, bb, cfg } = opts;
  const stats = outlineStats(outline);
  let y = m + 12;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.text("1:1 cutting template", m, y);

  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(`${bb.width.toFixed(1)} × ${bb.height.toFixed(1)} cm mirror`, m, y);

  // --- metrics, two columns ---
  y += 9;
  const omitted = plan.pageCount - printed.length;
  const rowsOfMetrics: Array<[string, string]> = [
    ["Finished size", `${bb.width.toFixed(1)} × ${bb.height.toFixed(1)} cm`],
    ["Glass area", `${(stats.areaMm2 / 1e6).toFixed(2)} m² · ${Math.round(stats.areaMm2 / 100)} cm²`],
    ["Outline length", `${(stats.perimeterMm / 10).toFixed(0)} cm`],
    ["Paper", `${cfg.paper.name} portrait · ${cfg.paper.wmm} × ${cfg.paper.hmm} mm`],
    [
      "Sheets to print",
      omitted > 0
        ? `${printed.length} of ${plan.pageCount} (${omitted} blank, left out)`
        : `${printed.length}`,
    ],
    ["Sheet grid", `${plan.cols} across × ${plan.rows} down`],
    ["Seam overlap", `${cfg.overlapMm} mm · ${cfg.pageMarginMm} mm trim margin`],
    ["Print scale", "1:1 — 100%, no fitting"],
  ];
  const colX = [m, m + 95];
  doc.setFontSize(9);
  for (let i = 0; i < rowsOfMetrics.length; i++) {
    const [k, v] = rowsOfMetrics[i];
    const x = colX[i % 2];
    const yy = y + Math.floor(i / 2) * 5.2;
    doc.setTextColor(140, 140, 140);
    doc.text(k, x, yy);
    doc.setTextColor(0, 0, 0);
    doc.text(v, x + 30, yy);
  }
  y += Math.ceil(rowsOfMetrics.length / 2) * 5.2 + 8;

  // --- scale check ---
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("1 · Check the scale before you cut anything", m, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text('Print at 100%. Turn off "fit to page" and "shrink oversized pages".', m, y);
  y += 5;
  doc.text("This bar must measure exactly 10 cm with a real ruler:", m, y);

  y += 9;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(m, y, m + 100, y);
  for (let c = 0; c <= 10; c++) {
    const tx = m + c * 10;
    const tall = c % 5 === 0;
    doc.line(tx, y - (tall ? 3 : 1.8), tx, y + (tall ? 3 : 1.8));
  }
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("10 cm", m + 103, y + 1.5);
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text("If it measures short, the print was scaled — fix it and print again.", m, y);

  // --- assembly ---
  y += 12;
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("2 · Assemble the sheets", m, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  for (const line of [
    "1. Cut every sheet along the two dashed lines down its left and across its top.",
    `   Do this first. A sheet laid down uncut sits ${cfg.pageMarginMm} mm out of place and hides a`,
    "   strip of the sheet beneath it, including the marks that position it.",
    "2. The cut corner is marked on the sheet itself. Every sheet already on the",
    "   table carries bold corner brackets labelled with a sheet number: lay that",
    "   sheet down with its cut corner in the bracket that has its number.",
    "3. Shaded strips are covered by the next sheet — the whole of it, margin",
    "   included. That is where the tape goes. Left to right, then row by row.",
    "4. Finally cut along the outline: that paper shape is your template.",
  ]) {
    doc.text(line, m, y);
    y += 5;
  }

  // --- overview map ---
  y += 7;
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("3 · What you are printing", m, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text(
    omitted > 0 ? "Shaded sheets are blank and are not in this PDF." : "Every sheet in this PDF is shown.",
    m,
    y,
  );
  y += 4;

  drawOverview(doc, {
    x: m,
    y,
    maxW: pw - 2 * m,
    maxH: ph - m - y,
    plan,
    printed,
    outline,
  });
}

/** Assembled size of the finished poster: the union of every sheet's kept area. */
function assembledSize(plan: TilePlan) {
  return {
    w: (plan.cols - 1) * plan.stepXmm + plan.printableWmm,
    h: (plan.rows - 1) * plan.stepYmm + plan.printableHmm,
  };
}

/** The sheet grid with the real outline drawn across it, to scale. */
function drawOverview(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    maxW: number;
    maxH: number;
    plan: TilePlan;
    printed: number[];
    outline: { x: number; y: number }[];
  },
) {
  const { plan, printed, outline } = opts;
  const total = assembledSize(plan);
  const s = Math.min(opts.maxW / total.w, opts.maxH / total.h);
  const ox = opts.x;
  const oy = opts.y;
  const kept = new Set(printed);

  doc.setFontSize(5);
  for (let i = 0; i < plan.tiles.length; i++) {
    const tile = plan.tiles[i];
    const r = keptRect(plan, tile);
    const x = ox + r.x * s;
    const yy = oy + r.y * s;
    const w = r.w * s;
    const h = r.h * s;
    if (!kept.has(i)) {
      doc.setFillColor(238, 238, 238);
      doc.rect(x, yy, w, h, "F");
    }
    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.15);
    doc.rect(x, yy, w, h);
    doc.setTextColor(kept.has(i) ? 120 : 190, kept.has(i) ? 120 : 190, kept.has(i) ? 120 : 190);
    doc.text(tile.label, x + w / 2, yy + h / 2, { align: "center", baseline: "middle" });
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  for (let i = 1; i < outline.length; i++) {
    doc.line(
      ox + outline[i - 1].x * s,
      oy + outline[i - 1].y * s,
      ox + outline[i].x * s,
      oy + outline[i].y * s,
    );
  }
}

/**
 * Where to put the QR inside the mirror outline, in shape-mm.
 *
 * It belongs on a template sheet, not the cover: the cover is read once and
 * thrown away, while the paper inside the outline is cut out and IS the
 * stencil — the part that survives, gets taped to a wall and photographed.
 *
 * The block must land wholly inside one sheet's kept area, never straddling an
 * overlap band: a QR split across a seam only scans if the sheets are taped
 * perfectly, and a code that scans sometimes is worse than one that always does.
 */
export interface QrSpot {
  x: number;
  y: number;
  tile: number;
}

/** Roughly one code per six sheets, and never more than a handful. */
export function qrCountFor(pageCount: number): number {
  return Math.min(4, Math.max(1, Math.floor(pageCount / 6)));
}

export function findQrSpots(
  outline: { x: number; y: number }[],
  plan: TilePlan,
  block: { w: number; h: number },
  printed?: number[],
  marginMm = 0,
): QrSpot[] {
  const STEP = 6; // mm between candidate positions
  const candidates: Array<QrSpot & { cx: number; cy: number }> = [];
  const eligible = printed ?? plan.tiles.map((_, i) => i);
  const set = new Set(eligible);

  for (const index of eligible) {
    const tile = plan.tiles[index];
    // The readable area, not merely the kept one: a code flush against a seam
    // scans until someone forgets to trim the next sheet, and then never again.
    const k = readableRect(
      plan,
      tile,
      marginMm,
      set.has(index + 1) && tile.col < plan.cols - 1,
      set.has(index + plan.cols),
    );
    const x1 = k.x + k.w - block.w;
    const y1 = k.y + k.h - block.h;
    // Prefer the middle of the sheet, so a code is never crowded against a seam.
    const midX = k.x + k.w / 2 - block.w / 2;
    const midY = k.y + k.h / 2 - block.h / 2;

    let best: (QrSpot & { cx: number; cy: number; d: number }) | null = null;
    for (let x = k.x; x <= x1; x += STEP) {
      for (let y = k.y; y <= y1; y += STEP) {
        const d = Math.hypot(x - midX, y - midY);
        if (best && d >= best.d) continue; // cheaper than the polygon test
        if (!rectInPolygon(outline, { x, y, w: block.w, h: block.h })) continue;
        best = { x, y, tile: index, cx: x + block.w / 2, cy: y + block.h / 2, d };
      }
    }
    if (best) candidates.push({ x: best.x, y: best.y, tile: best.tile, cx: best.cx, cy: best.cy });
  }

  if (candidates.length === 0) return [];

  // Spread them out: start at the middle of the mirror, then repeatedly take
  // whichever remaining sheet is farthest from everything already chosen. A
  // simple "every Nth sheet" would clump them down one column on a tall mirror.
  const mx = outline.reduce((a, p) => a + p.x, 0) / outline.length;
  const my = outline.reduce((a, p) => a + p.y, 0) / outline.length;
  const pool = [...candidates];
  const chosen: typeof candidates = [];
  const wanted = Math.min(qrCountFor(eligible.length), pool.length);

  let seed = 0;
  for (let i = 1; i < pool.length; i++) {
    if (Math.hypot(pool[i].cx - mx, pool[i].cy - my) < Math.hypot(pool[seed].cx - mx, pool[seed].cy - my)) {
      seed = i;
    }
  }
  chosen.push(...pool.splice(seed, 1));

  while (chosen.length < wanted) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let i = 0; i < pool.length; i++) {
      const nearest = Math.min(
        ...chosen.map((c) => Math.hypot(pool[i].cx - c.cx, pool[i].cy - c.cy)),
      );
      if (nearest > bestDist) {
        bestDist = nearest;
        bestIdx = i;
      }
    }
    chosen.push(...pool.splice(bestIdx, 1));
  }

  return chosen.map(({ x, y, tile }) => ({ x, y, tile }));
}

const QR_SIDE_MM = 30;
const QR_CAPTION_MM = 8;
export const QR_BLOCK = { w: QR_SIDE_MM, h: QR_SIDE_MM + QR_CAPTION_MM };

/** QR to the app plus a one-line credit, drawn into the block at (x, y). */
function drawCredit(doc: jsPDF, x: number, y: number) {
  const code = encodeQr(APP_URL);
  // 4 modules of quiet zone, as the QR spec requires — scanners use it to find
  // the code's edge, and printed on a busy sheet it is not optional.
  const QUIET = 4;
  const mod = QR_SIDE_MM / (code.size + QUIET * 2);

  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, QR_SIDE_MM, QR_SIDE_MM, "F");
  doc.setFillColor(0, 0, 0);
  for (const run of qrRuns(code)) {
    doc.rect(x + (run.col + QUIET) * mod, y + (run.row + QUIET) * mod, run.len * mod, mod, "F");
  }

  // Sits on the stencil the user traces around, so the caption stays light —
  // readable if the code is scuffed, never mistaken for a cut line.
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(APP_NAME, x + QR_SIDE_MM / 2, y + QR_SIDE_MM + 3.4, { align: "center" });
  doc.setFontSize(5.5);
  doc.setTextColor(150, 150, 150);
  doc.text(APP_URL_LABEL, x + QR_SIDE_MM / 2, y + QR_SIDE_MM + 7, { align: "center" });
}
