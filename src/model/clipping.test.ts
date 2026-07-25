import { describe, expect, it } from "vitest";
import { clipPolylineToRect, nearestSegmentIndex } from "./geometry";

const RECT = { x: 0, y: 0, w: 10, h: 10 };

describe("nearestSegmentIndex", () => {
  // A unit square, ring order: 0=(0,0) 1=(10,0) 2=(10,10) 3=(0,10)
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("finds the segment the point lies on, not the nearest vertex", () => {
    // Just above the midpoint of the LEFT edge, which is segment 3 (3 -> 0).
    // The nearest vertex there is 0 or 3 depending on which side of centre, and
    // splicing after the nearest vertex is exactly what crossed the outline.
    expect(nearestSegmentIndex(square, 0.2, 6)).toBe(3);
    expect(nearestSegmentIndex(square, 0.2, 4)).toBe(3);
  });

  it("identifies each edge of the ring", () => {
    expect(nearestSegmentIndex(square, 5, -0.4)).toBe(0); // top
    expect(nearestSegmentIndex(square, 10.4, 5)).toBe(1); // right
    expect(nearestSegmentIndex(square, 5, 10.4)).toBe(2); // bottom
    expect(nearestSegmentIndex(square, -0.4, 5)).toBe(3); // left
  });

  it("survives degenerate input", () => {
    expect(nearestSegmentIndex([], 1, 1)).toBe(0);
    expect(nearestSegmentIndex([{ x: 1, y: 1 }], 5, 5)).toBe(0);
    // duplicated points => zero-length segment must not divide by zero
    expect(Number.isFinite(nearestSegmentIndex([{ x: 1, y: 1 }, { x: 1, y: 1 }], 5, 5))).toBe(true);
  });
});

describe("clipPolylineToRect", () => {
  it("keeps a fully-inside polyline intact", () => {
    const pts = [
      { x: 1, y: 1 },
      { x: 5, y: 5 },
      { x: 9, y: 2 },
    ];
    const runs = clipPolylineToRect(pts, RECT);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(3);
  });

  it("drops a fully-outside polyline", () => {
    const pts = [
      { x: 20, y: 20 },
      { x: 30, y: 25 },
    ];
    expect(clipPolylineToRect(pts, RECT)).toHaveLength(0);
  });

  it("trims a segment crossing the boundary to the boundary", () => {
    const runs = clipPolylineToRect([{ x: -5, y: 5 }, { x: 5, y: 5 }], RECT);
    expect(runs).toHaveLength(1);
    expect(runs[0][0].x).toBeCloseTo(0, 9);
    expect(runs[0][1].x).toBeCloseTo(5, 9);
  });

  it("splits into separate runs when the line leaves and re-enters", () => {
    // out -> in -> out -> in -> out
    const pts = [
      { x: -1, y: 5 },
      { x: 3, y: 5 },
      { x: 3, y: -1 },
      { x: 7, y: -1 },
      { x: 7, y: 5 },
      { x: 11, y: 5 },
    ];
    const runs = clipPolylineToRect(pts, RECT);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    // every emitted vertex must be inside the rect (within epsilon)
    for (const run of runs) {
      for (const p of run) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(10 + 1e-9);
      }
    }
  });

  it("never emits ink outside the rect for a big closed shape", () => {
    // a circle far larger than the window
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * Math.PI * 2;
      pts.push({ x: 5 + 40 * Math.cos(t), y: 5 + 40 * Math.sin(t) });
    }
    for (const run of clipPolylineToRect(pts, RECT)) {
      for (const p of run) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(10 + 1e-9);
      }
    }
  });
});
