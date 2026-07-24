import { describe, expect, it } from "vitest";
import {
  boundingBox,
  buildSmoothClosedPath,
  designFrame,
  normalizeToTarget,
} from "./geometry";
import type { ShapePoint } from "./shape";

const P = (id: string, x: number, y: number): ShapePoint => ({ id, x, y });

describe("boundingBox", () => {
  it("computes min/max/size", () => {
    const bb = boundingBox([P("a", 10, 20), P("b", 50, 5), P("c", 30, 80)]);
    expect(bb).toEqual({ minX: 10, minY: 5, maxX: 50, maxY: 80, width: 40, height: 75 });
  });

  it("returns zeros for empty input", () => {
    expect(boundingBox([])).toEqual({
      minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0,
    });
  });
});

describe("normalizeToTarget", () => {
  it("stretches the bbox to exactly the target size", () => {
    const pts = [P("a", 0, 0), P("b", 34, 0), P("c", 34, 86.5), P("d", 0, 86.5)];
    const out = normalizeToTarget(pts, 68, 173);
    const bb = boundingBox(out);
    expect(bb.width).toBeCloseTo(68, 6);
    expect(bb.height).toBeCloseTo(173, 6);
  });

  it("keeps the top-left anchor fixed", () => {
    const pts = [P("a", 10, 20), P("b", 20, 20), P("c", 20, 40), P("d", 10, 40)];
    const out = normalizeToTarget(pts, 68, 173);
    const bb = boundingBox(out);
    expect(bb.minX).toBeCloseTo(10, 6);
    expect(bb.minY).toBeCloseTo(20, 6);
  });

  it("leaves degenerate (zero-size) input untouched", () => {
    const pts = [P("a", 5, 5), P("b", 5, 5)];
    expect(normalizeToTarget(pts, 68, 173)).toEqual(pts);
  });
});

describe("designFrame", () => {
  it("wraps the bbox with padding on all sides", () => {
    const f = designFrame([P("a", 0, 0), P("b", 68, 0), P("c", 68, 173), P("d", 0, 173)], 30);
    expect(f).toEqual({ x: -30, y: -30, w: 68 + 60, h: 173 + 60 });
  });

  it("is captured from the INITIAL points and does not follow a moved point (anti-autofill)", () => {
    // Simulate the editor: frame is computed once from the initial shape.
    const initial = [P("a", 0, 0), P("b", 68, 0), P("c", 68, 173), P("d", 0, 173)];
    const frame = designFrame(initial, 30);
    // User drags a point far outside; the frame must NOT be recomputed.
    const moved = [P("a", -50, 0), P("b", 200, 0), P("c", 68, 173), P("d", 0, 173)];
    const frameIfChasing = designFrame(moved, 30);
    // The captured frame is unchanged; a chasing frame would differ.
    expect(frame).not.toEqual(frameIfChasing);
    expect(frame).toEqual({ x: -30, y: -30, w: 128, h: 233 });
  });
});

describe("buildSmoothClosedPath", () => {
  it("produces a closed path starting at the first point", () => {
    const d = buildSmoothClosedPath([P("a", 0, 0), P("b", 10, 0), P("c", 5, 10)]);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d).toContain("C");
  });

  it("degrades gracefully for 2 points (a line)", () => {
    const d = buildSmoothClosedPath([P("a", 0, 0), P("b", 10, 10)]);
    expect(d).toBe("M 0 0 L 10 10 Z");
  });
});
