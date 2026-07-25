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

/**
 * Index of the ring segment (i -> i+1) nearest to a point, by true
 * point-to-segment distance.
 *
 * Picking the nearest *vertex* and splicing after it is wrong: a click on the
 * segment BEFORE that vertex inserts on the far side of the ring, and the
 * closed spline crosses itself.
 */
export function nearestSegmentIndex(points: { x: number; y: number }[], x: number, y: number) {
  const n = points.length;
  if (n < 2) return 0;

  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    // Degenerate segment: fall back to the distance to its start point.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Clip a polyline to an axis-aligned rectangle (Liang–Barsky per segment),
 * returning the runs that survive. Used so each printed tile carries only the
 * ink that belongs to it.
 */
export function clipPolylineToRect(
  pts: { x: number; y: number }[],
  rect: { x: number; y: number; w: number; h: number },
): { x: number; y: number }[][] {
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  const x1 = rect.x;
  const y1 = rect.y;
  const x2 = rect.x + rect.w;
  const y2 = rect.y + rect.h;

  for (let i = 0; i + 1 < pts.length; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], x1, y1, x2, y2);
    if (!seg) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    const [a, b] = seg;
    if (run.length === 0) {
      run.push(a, b);
    } else {
      const last = run[run.length - 1];
      // Continue the run only if this segment starts where the previous ended.
      if (Math.abs(last.x - a.x) < 1e-9 && Math.abs(last.y - a.y) < 1e-9) {
        run.push(b);
      } else {
        if (run.length > 1) runs.push(run);
        run = [a, b];
      }
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function clipSegment(
  p: { x: number; y: number },
  q: { x: number; y: number },
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;

  // Canonical Liang–Barsky: for each boundary, P is the direction component
  // against the edge normal and Q the signed distance from it.
  const P = [-dx, dx, -dy, dy];
  const Q = [p.x - xmin, xmax - p.x, p.y - ymin, ymax - p.y];

  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return null; // parallel to this edge and outside it
      continue;
    }
    const r = Q[i] / P[i];
    if (P[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  return [
    { x: p.x + t0 * dx, y: p.y + t0 * dy },
    { x: p.x + t1 * dx, y: p.y + t1 * dy },
  ];
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

/**
 * Is (x, y) inside the closed polygon? Even-odd ray casting.
 *
 * Points exactly on an edge are not guaranteed either way, which is fine for
 * every caller here — they all ask about interiors with margin to spare.
 */
export function pointInPolygon(
  poly: { x: number; y: number }[],
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    // Does the edge straddle the horizontal ray, and if so, is the crossing
    // to the right of the point?
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Is the whole axis-aligned rectangle inside the polygon?
 *
 * Corner tests alone are not enough for a concave outline — an hourglass waist
 * can cut clean through a rectangle whose four corners all sit inside it — so
 * the edges are sampled too.
 */
export function rectInPolygon(
  poly: { x: number; y: number }[],
  rect: { x: number; y: number; w: number; h: number },
  samplesPerEdge = 6,
): boolean {
  const { x, y, w, h } = rect;
  for (let i = 0; i <= samplesPerEdge; i++) {
    const t = i / samplesPerEdge;
    if (!pointInPolygon(poly, x + w * t, y)) return false;
    if (!pointInPolygon(poly, x + w * t, y + h)) return false;
    if (!pointInPolygon(poly, x, y + h * t)) return false;
    if (!pointInPolygon(poly, x + w, y + h * t)) return false;
  }
  return pointInPolygon(poly, x + w / 2, y + h / 2);
}
