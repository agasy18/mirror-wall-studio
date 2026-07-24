import { jsPDF } from "jspdf";
import { buildSmoothClosedPath, boundingBox } from "../model/geometry";
import type { ShapePoint } from "../model/shape";
import { DEFAULT_TILE_CONFIG, planTiles, type TileConfig } from "../model/tiling";

const CM_TO_MM = 10;

/**
 * Export the mirror outline as a 1:1 tiled PDF at the configured paper size.
 * Outline-only (no mirror fill, no cm grid). Each page carries registration
 * crosses, an overlap cut line, and a label. Page 1 gets a 10cm ruler check.
 */
export function exportTiledPdf(points: ShapePoint[], cfg: TileConfig = DEFAULT_TILE_CONFIG) {
  const bb = boundingBox(points);
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
  const shapeCm = `${bb.width.toFixed(0)} x ${bb.height.toFixed(0)} cm`;

  // jsPDF accepts an explicit [w,h] mm format for any paper size.
  const doc = new jsPDF({ unit: "mm", format: [pw, ph], orientation: "portrait" });

  plan.tiles.forEach((tile, i) => {
    if (i > 0) doc.addPage([pw, ph], "portrait");

    // Map shape-mm coords -> page-mm coords for this tile.
    // Content region [tile.contentX .. +printableW] maps to [margin .. margin+printableW].
    const offsetX = m - tile.contentXmm;
    const offsetY = m - tile.contentYmm;

    // --- outline (clipped visually to the printable area via page bounds) ---
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    drawPathSegments(doc, shifted, offsetX, offsetY);

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
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`${tile.label}  (of ${plan.pageCount})`, m + 2, m + 5);

    // --- page 1 extras: instructions + 10cm verification ruler ---
    if (i === 0) {
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Print at 100% (no 'fit to page'). Assembles into ${shapeCm}.`,
        m + 2,
        ph - m - 8,
      );
      // 10 cm ruler
      const ry = ph - m - 4;
      const rx = m + 2;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.line(rx, ry, rx + 100, ry); // 100mm = 10cm
      for (let c = 0; c <= 10; c++) {
        const tx = rx + c * 10;
        doc.line(tx, ry - 1.5, tx, ry + 1.5);
      }
      doc.text("10 cm check", rx + 102, ry + 1);
    }
  });

  doc.save(`mirror-template-${bb.width.toFixed(0)}x${bb.height.toFixed(0)}cm.pdf`);
  return plan;
}

/**
 * Draw the smooth closed outline as a polyline of sampled Bézier points, offset
 * into page space. We sample the path so we don't depend on svg2pdf for the
 * curve; jsPDF's `lines` gives crisp vector segments.
 */
function drawPathSegments(
  doc: jsPDF,
  points: { x: number; y: number }[],
  offsetX: number,
  offsetY: number,
) {
  const sampled = samplePath(points, 24);
  if (sampled.length < 2) return;
  doc.setDrawColor(0, 0, 0);
  let prev = sampled[0];
  for (let i = 1; i < sampled.length; i++) {
    const cur = sampled[i];
    doc.line(prev.x + offsetX, prev.y + offsetY, cur.x + offsetX, cur.y + offsetY);
    prev = cur;
  }
}

/**
 * Sample the same Catmull-Rom closed spline the screen uses, so the printed
 * outline matches the preview exactly. `steps` points per segment.
 */
function samplePath(points: { x: number; y: number }[], steps: number) {
  const n = points.length;
  if (n < 3) return points;
  const out: { x: number; y: number }[] = [];
  const k = 1 / 6;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push(cubic(p1, { x: c1x, y: c1y }, { x: c2x, y: c2y }, p2, t));
    }
  }
  out.push(out[0]);
  return out;
}

function cubic(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function cross(doc: jsPDF, x: number, y: number, size: number) {
  const h = size / 2;
  doc.line(x - h, y, x + h, y);
  doc.line(x, y - h, x, y + h);
}

// keep the smooth path export available for the on-screen SVG (single source).
export { buildSmoothClosedPath };
