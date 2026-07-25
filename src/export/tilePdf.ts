import { jsPDF } from "jspdf";
import {
  clipPolylineToRect,
  curveBounds,
  rectInPolygon,
  sampleClosedSpline,
} from "../model/geometry";
import type { ShapePoint } from "../model/shape";
import { DEFAULT_TILE_CONFIG, planTiles, type TileConfig, type TilePlan } from "../model/tiling";
import { APP_NAME, APP_URL, APP_URL_LABEL } from "../model/brand";
import { encodeQr, qrRuns } from "../model/qr";

const CM_TO_MM = 10;

/**
 * Export the mirror outline as a 1:1 tiled PDF at the configured paper size.
 * Page 1 is a cover sheet (scale check, finished size, assembly map); every
 * page after it is a template tile carrying registration crosses, an overlap
 * cut line and a label.
 */
export interface ExportOptions {
  /** Print a QR to the app inside the mirror outline, on the template sheets. */
  watermark?: boolean;
}

export function exportTiledPdf(
  points: ShapePoint[],
  cfg: TileConfig = DEFAULT_TILE_CONFIG,
  opts: ExportOptions = {},
) {
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
  const shapeCm = `${bb.width.toFixed(1)} × ${bb.height.toFixed(1)} cm`;

  // Sample once; every tile draws a clipped view of the same polyline.
  const outline = sampleClosedSpline(shifted, 24);

  // jsPDF accepts an explicit [w,h] mm format for any paper size.
  const doc = new jsPDF({ unit: "mm", format: [pw, ph], orientation: "portrait" });

  drawCoverPage(doc, {
    m,
    pw,
    ph,
    plan,
    shapeCm,
    paperName: cfg.paper.name,
    cfg,
  });

  // A few QRs, inside the outline, spread across sheets that can hold one whole.
  const qrByTile = new Map<number, QrSpot>();
  if (opts.watermark) {
    for (const spot of findQrSpots(outline, plan, QR_BLOCK)) qrByTile.set(spot.tile, spot);
  }

  plan.tiles.forEach((tile, i) => {
    doc.addPage([pw, ph], "portrait");

    // Map shape-mm coords -> page-mm coords for this tile.
    // Content region [tile.contentX .. +printableW] maps to [margin .. margin+printableW].
    const offsetX = m - tile.contentXmm;
    const offsetY = m - tile.contentYmm;

    // --- outline, clipped to THIS tile's printable area ---
    // Without the clip every sheet carries the whole outline, so ink from the
    // neighbouring tile lands in the overlap band and "cut on the dashed line"
    // becomes ambiguous.
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
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

    // --- overlap cut line (dashed) on the trailing edges that overlap a neighbor ---
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([2, 2], 0);
    // right overlap line if not last column
    if (tile.col < plan.cols - 1) {
      const x = m + plan.stepXmm;
      doc.line(x, m, x, ph - m);
    }
    // bottom overlap line if not last row
    if (tile.row < plan.rows - 1) {
      const y = m + plan.stepYmm;
      doc.line(m, y, pw - m, y);
    }
    doc.setLineDashPattern([], 0);

    // --- registration crosses at printable corners ---
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    const corners: Array<[number, number]> = [
      [m, m],
      [pw - m, m],
      [m, ph - m],
      [pw - m, ph - m],
    ];
    for (const [cx, cy] of corners) cross(doc, cx, cy, 4);

    // --- label ---
    // Deliberately small and light: it sits inside the printable area (the
    // margin band is the printer's dead zone, so nothing can be put there), and
    // must never be mistaken for the cut line.
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`${tile.label} · sheet ${i + 1} of ${plan.pageCount}`, m + 1.5, m + 3.2);

    // --- QR, if one landed on this sheet ---
    const qrSpot = qrByTile.get(i);
    if (qrSpot) drawCredit(doc, qrSpot.x + offsetX, qrSpot.y + offsetY);
  });

  doc.save(`mirror-template-${bb.width.toFixed(0)}x${bb.height.toFixed(0)}cm.pdf`);
  return plan;
}

/**
 * Cover sheet. The 10 cm verification ruler lives here rather than on page 1 of
 * the template, where its 100 mm bar overprinted the outline the user traces.
 */
function drawCoverPage(
  doc: jsPDF,
  opts: {
    m: number;
    pw: number;
    ph: number;
    plan: TilePlan;
    shapeCm: string;
    paperName: string;
    cfg: TileConfig;
  },
) {
  const { m, pw, plan, shapeCm, paperName, cfg } = opts;
  let y = m + 12;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.text("1:1 cutting template", m, y);

  y += 9;
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(`Finished mirror: ${shapeCm}`, m, y);
  y += 6;
  doc.text(
    `${plan.pageCount} sheets · ${paperName} portrait · ${plan.cols} × ${plan.rows} grid · ${cfg.overlapMm} mm overlap`,
    m,
    y,
  );

  // --- scale check ---
  y += 16;
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("1 · Check the scale before you cut anything", m, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    'Print at 100%. Turn off "fit to page" and "shrink oversized pages".',
    m,
    y,
  );
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
  y += 14;
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("2 · Assemble the sheets", m, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  for (const line of [
    `Sheets overlap by ${cfg.overlapMm} mm. Trim each sheet along its dashed line,`,
    "then lay the next sheet on top so the registration crosses sit on each",
    "other. Tape the seam. Work left to right along a row, then row by row.",
    "Finally cut along the outline — that paper shape is your template.",
  ]) {
    doc.text(line, m, y);
    y += 5;
  }

  // --- page map ---
  y += 8;
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("3 · Sheet layout", m, y);
  y += 6;

  // Fit the map to whatever space is left, not just to the width — a tall grid
  // (7 rows for a full-length mirror on A4) otherwise runs off the sheet.
  const aspect = plan.printableHmm / plan.printableWmm;
  const availW = Math.min(pw - 2 * m, 90);
  const availH = opts.ph - m - y;
  let cellW = availW / plan.cols;
  let cellH = cellW * aspect;
  if (cellH * plan.rows > availH) {
    cellH = availH / plan.rows;
    cellW = cellH / aspect;
  }
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      const x = m + c * cellW;
      const yy = y + r * cellH;
      doc.rect(x, yy, cellW, cellH);
      doc.text(`R${r + 1}-C${c + 1}`, x + cellW / 2, yy + cellH / 2, {
        align: "center",
        baseline: "middle",
      });
    }
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
): QrSpot[] {
  const STEP = 6; // mm between candidate positions
  const candidates: Array<QrSpot & { cx: number; cy: number }> = [];

  for (let index = 0; index < plan.tiles.length; index++) {
    const tile = plan.tiles[index];
    // The kept area is the sheet up to its cut line; past that is the overlap
    // band, which the user trims away. Last row/column has nothing after it.
    const keptW = tile.col < plan.cols - 1 ? plan.stepXmm : plan.printableWmm;
    const keptH = tile.row < plan.rows - 1 ? plan.stepYmm : plan.printableHmm;
    const x1 = tile.contentXmm + keptW - block.w;
    const y1 = tile.contentYmm + keptH - block.h;
    // Prefer the middle of the sheet, so a code is never crowded against a seam.
    const midX = tile.contentXmm + keptW / 2 - block.w / 2;
    const midY = tile.contentYmm + keptH / 2 - block.h / 2;

    let best: (QrSpot & { cx: number; cy: number; d: number }) | null = null;
    for (let x = tile.contentXmm; x <= x1; x += STEP) {
      for (let y = tile.contentYmm; y <= y1; y += STEP) {
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
  const wanted = Math.min(qrCountFor(plan.pageCount), pool.length);

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

function cross(doc: jsPDF, x: number, y: number, size: number) {
  const h = size / 2;
  doc.line(x - h, y, x + h, y);
  doc.line(x, y - h, x, y + h);
}
