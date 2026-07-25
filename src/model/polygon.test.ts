import { describe, it, expect } from "vitest";
import { pointInPolygon, rectInPolygon, sampleClosedSpline } from "./geometry";
import { makePresetById } from "../data/presetShapes";

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

/** An hourglass: wide top and bottom, pinched to 10 units at the waist. */
const hourglass = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 55, y: 50 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
  { x: 45, y: 50 },
];

describe("point in polygon", () => {
  it("separates inside from outside", () => {
    expect(pointInPolygon(square, 50, 50)).toBe(true);
    expect(pointInPolygon(square, 1, 1)).toBe(true);
    expect(pointInPolygon(square, -1, 50)).toBe(false);
    expect(pointInPolygon(square, 101, 50)).toBe(false);
    expect(pointInPolygon(square, 50, -1)).toBe(false);
    expect(pointInPolygon(square, 50, 101)).toBe(false);
  });

  it("handles a concave outline, not just its bounding box", () => {
    // (75, 50) is inside the square hull but outside the pinched waist.
    expect(pointInPolygon(hourglass, 75, 50)).toBe(false);
    expect(pointInPolygon(hourglass, 50, 10)).toBe(true);
    expect(pointInPolygon(hourglass, 50, 90)).toBe(true);
  });
});

describe("rectangle fully inside polygon", () => {
  it("accepts a rectangle with room to spare", () => {
    expect(rectInPolygon(square, { x: 20, y: 20, w: 30, h: 30 })).toBe(true);
  });

  it("rejects one that pokes out", () => {
    expect(rectInPolygon(square, { x: 80, y: 80, w: 30, h: 30 })).toBe(false);
    expect(rectInPolygon(square, { x: -5, y: 20, w: 30, h: 30 })).toBe(false);
  });

  it("rejects a rectangle a concave waist cuts through", () => {
    // Every corner of this rectangle is inside the hourglass, but its middle
    // spans the pinch — corner tests alone would wrongly accept it.
    // At y=20 and y=80 the shape spans x 18..82, so all four corners sit
    // inside; at y=50 it narrows to x 45..55, which this rectangle straddles.
    const rect = { x: 30, y: 20, w: 40, h: 60 };
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h],
    ];
    expect(corners.every(([x, y]) => pointInPolygon(hourglass, x, y))).toBe(true);
    expect(pointInPolygon(hourglass, rect.x + rect.w / 2, rect.y + rect.h / 2)).toBe(true);
    expect(rectInPolygon(hourglass, rect)).toBe(false);
  });

  it("finds room for a 30 mm QR block inside a real mirror outline", () => {
    // A 68 x 173 cm mirror in mm; the QR block is 30 x 38 mm.
    const pts = makePresetById("pebble").map((p) => ({ x: p.x * 10, y: p.y * 10 }));
    const outline = sampleClosedSpline(pts, 24);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(rectInPolygon(outline, { x: cx - 15, y: cy - 19, w: 30, h: 38 })).toBe(true);
  });
});
