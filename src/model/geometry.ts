// Pure geometry helpers. No React, no DOM — unit-testable.
import type { BBox, ShapePoint } from "./shape";

/** Bounding box of a set of points (cm). */
export function boundingBox(points: ShapePoint[]): BBox {
  return bboxOf(points);
}

function bboxOf(points: { x: number; y: number }[]): BBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Sample the closed Catmull-Rom spline that `buildSmoothClosedPath` describes.
 * Single source of truth for the curve, so the screen, the measurements and the
 * PDF can never drift apart.
 */
export function sampleClosedSpline(
  points: { x: number; y: number }[],
  steps = 24,
  tension = 1,
): { x: number; y: number }[] {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ x: p.x, y: p.y }));

  const k = tension / 6;
  const out: { x: number; y: number }[] = [];
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
      const mt = 1 - t;
      const a = mt * mt * mt;
      const b = 3 * mt * mt * t;
      const c = 3 * mt * t * t;
      const d = t * t * t;
      out.push({
        x: a * p1.x + b * c1x + c * c2x + d * p2.x,
        y: a * p1.y + b * c1y + c * c2y + d * p2.y,
      });
    }
  }
  out.push({ x: out[0].x, y: out[0].y });
  return out;
}

/**
 * Bounding box of the DRAWN OUTLINE, not of the control points.
 *
 * A Catmull-Rom spline overshoots its control points — for the "peanut" preset
 * by 18 mm — so the control-point bbox understates the real glass. Anything
 * that states a physical size or decides how much paper to cover must measure
 * this, or the outline prints off the edge of the page and the quoted size is
 * wrong on the glass order.
 */
export function curveBounds(points: { x: number; y: number }[], steps = 24): BBox {
  if (points.length === 0) return bboxOf([]);
  return bboxOf(sampleClosedSpline(points, steps));
}

/**
 * Build a smooth CLOSED SVG path through the points using a Catmull-Rom spline
 * converted to cubic Béziers. Produces an organic, wavy outline.
 * `tension` in [0,1]; 1 = standard Catmull-Rom.
 */
export function buildSmoothClosedPath(points: ShapePoint[], tension = 1): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)} Z`;
  if (n === 2) {
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)} L ${fmt(points[1].x)} ${fmt(points[1].y)} Z`;
  }

  const k = tension / 6;
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;

    d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  d += " Z";
  return d;
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A fixed design frame (SVG viewBox) around a point set, with cm padding.
 * The editor captures this ONCE from the initial shape so the view does not
 * rescale/chase the shape as points are dragged.
 */
export function designFrame(points: ShapePoint[], padCm: number): Frame {
  const b = boundingBox(points);
  return {
    x: b.minX - padCm,
    y: b.minY - padCm,
    w: b.width + padCm * 2,
    h: b.height + padCm * 2,
  };
}

/**
 * Return a new point set whose bounding box is exactly targetW × targetH cm,
 * anchored at the same top-left corner. Used by the "lock to target" toggle.
 */
export function normalizeToTarget(
  points: ShapePoint[],
  targetW: number,
  targetH: number,
): ShapePoint[] {
  const bb = boundingBox(points);
  if (bb.width === 0 || bb.height === 0) return points;
  const sx = targetW / bb.width;
  const sy = targetH / bb.height;
  return points.map((p) => ({
    ...p,
    x: bb.minX + (p.x - bb.minX) * sx,
    y: bb.minY + (p.y - bb.minY) * sy,
  }));
}

function fmt(v: number): string {
  // Trim to 4 decimals, drop trailing zeros.
  return String(Math.round(v * 1e4) / 1e4);
}
