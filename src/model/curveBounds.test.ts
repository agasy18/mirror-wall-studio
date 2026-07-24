import { describe, expect, it } from "vitest";
import { boundingBox, curveBounds, sampleClosedSpline } from "./geometry";
import { DEFAULT_TILE_CONFIG, PAPER_SIZES, planTiles } from "./tiling";
import { MIRROR_PRESETS, presetToPoints } from "../data/presetShapes";

const CM_TO_MM = 10;
const EPS = 1e-6;

/**
 * The export pipeline's own arithmetic: shift the shape so its top-left is the
 * origin, in mm. Mirrors exportTiledPdf so the assertions below describe what
 * actually reaches the paper.
 */
function shiftedSamples(points: { x: number; y: number }[]) {
  const bb = curveBounds(points);
  const shifted = points.map((p) => ({
    x: (p.x - bb.minX) * CM_TO_MM,
    y: (p.y - bb.minY) * CM_TO_MM,
  }));
  return { bb, samples: sampleClosedSpline(shifted, 24) };
}

describe("curveBounds", () => {
  it("is never smaller than the control-point bbox", () => {
    for (const preset of MIRROR_PRESETS) {
      const pts = presetToPoints(preset);
      const control = boundingBox(pts);
      const curve = curveBounds(pts);
      expect(curve.width).toBeGreaterThanOrEqual(control.width - EPS);
      expect(curve.height).toBeGreaterThanOrEqual(control.height - EPS);
    }
  });

  it("actually exceeds the control-point bbox where the spline overshoots", () => {
    // The regression that motivated this: "peanut" overshoots by ~18 mm, so the
    // control bbox understates the real glass by several centimetres.
    const peanut = MIRROR_PRESETS.find((p) => p.id === "peanut");
    expect(peanut).toBeDefined();
    const pts = presetToPoints(peanut!);
    expect(curveBounds(pts).width).toBeGreaterThan(boundingBox(pts).width + 1);
  });

  it("degenerate inputs do not throw", () => {
    expect(curveBounds([]).width).toBe(0);
    expect(curveBounds([{ x: 3, y: 4 }]).width).toBe(0);
    expect(curveBounds([{ x: 0, y: 0 }, { x: 2, y: 0 }]).width).toBe(2);
  });
});

describe("the exported outline stays on the paper", () => {
  it("no part of any preset's curve falls outside its own bounding box", () => {
    for (const preset of MIRROR_PRESETS) {
      const { bb, samples } = shiftedSamples(presetToPoints(preset));
      const wmm = bb.width * CM_TO_MM;
      const hmm = bb.height * CM_TO_MM;

      for (const s of samples) {
        // Negative means the ink lands left of / above the page origin, i.e.
        // inside the printer's dead margin or off the sheet entirely.
        expect(s.x, `${preset.id} x`).toBeGreaterThanOrEqual(-EPS);
        expect(s.y, `${preset.id} y`).toBeGreaterThanOrEqual(-EPS);
        expect(s.x, `${preset.id} x`).toBeLessThanOrEqual(wmm + EPS);
        expect(s.y, `${preset.id} y`).toBeLessThanOrEqual(hmm + EPS);
      }
    }
  });

  it("the page grid covers every preset on every paper size", () => {
    for (const preset of MIRROR_PRESETS) {
      const bb = curveBounds(presetToPoints(preset));
      for (const paper of PAPER_SIZES) {
        const plan = planTiles(bb.width * CM_TO_MM, bb.height * CM_TO_MM, {
          ...DEFAULT_TILE_CONFIG,
          paper,
        });
        const coverX = (plan.cols - 1) * plan.stepXmm + plan.printableWmm;
        const coverY = (plan.rows - 1) * plan.stepYmm + plan.printableHmm;
        expect(coverX, `${preset.id} on ${paper.id}`).toBeGreaterThanOrEqual(
          bb.width * CM_TO_MM - EPS,
        );
        expect(coverY, `${preset.id} on ${paper.id}`).toBeGreaterThanOrEqual(
          bb.height * CM_TO_MM - EPS,
        );
      }
    }
  });
});

describe("planTiles guards", () => {
  it("rejects an overlap that is not smaller than the printable area", () => {
    expect(() =>
      planTiles(500, 500, { ...DEFAULT_TILE_CONFIG, overlapMm: 190 }),
    ).toThrow(/Overlap/);
  });

  it("rejects margins that consume the page", () => {
    expect(() =>
      planTiles(500, 500, { ...DEFAULT_TILE_CONFIG, pageMarginMm: 150 }),
    ).toThrow(/printable/);
  });
});

describe("paper sizes are physically exact", () => {
  it("uses true Letter and Legal dimensions", () => {
    // Rounding these makes the PDF MediaBox disagree with the sheet, which is
    // what triggers a driver "scale to fit" and silently breaks 1:1.
    const letter = PAPER_SIZES.find((p) => p.id === "letter")!;
    expect(letter.wmm).toBeCloseTo(215.9, 5);
    expect(letter.hmm).toBeCloseTo(279.4, 5);
    const legal = PAPER_SIZES.find((p) => p.id === "legal")!;
    expect(legal.hmm).toBeCloseTo(355.6, 5);
  });
});
