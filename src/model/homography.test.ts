import { describe, expect, it } from "vitest";
import {
  applyHomography,
  computeHomography,
  homographyToMatrix3d,
  isQuadValid,
  type Pt,
} from "./homography";

const TL = { x: 0, y: 0 };
const TR = { x: 100, y: 0 };
const BR = { x: 100, y: 100 };
const BL = { x: 0, y: 100 };

describe("computeHomography", () => {
  it("maps each source corner onto its destination corner", () => {
    const src: Pt[] = [
      { x: 12, y: 8 },
      { x: 190, y: 30 },
      { x: 205, y: 260 },
      { x: 5, y: 240 },
    ];
    const dst: Pt[] = [TL, TR, BR, BL];
    const h = computeHomography(src, dst);
    for (let i = 0; i < 4; i++) {
      const out = applyHomography(h, src[i]);
      expect(out.x).toBeCloseTo(dst[i].x, 6);
      expect(out.y).toBeCloseTo(dst[i].y, 6);
    }
  });

  it("is identity when src === dst", () => {
    const dst: Pt[] = [TL, TR, BR, BL];
    const h = computeHomography(dst, dst);
    const mid = { x: 50, y: 50 };
    const out = applyHomography(h, mid);
    expect(out.x).toBeCloseTo(50, 6);
    expect(out.y).toBeCloseTo(50, 6);
  });
});

describe("homographyToMatrix3d", () => {
  it("serializes 16 comma-separated numbers", () => {
    const h = computeHomography([TL, TR, BR, BL], [TL, TR, BR, BL]);
    const s = homographyToMatrix3d(h);
    expect(s.startsWith("matrix3d(")).toBe(true);
    const nums = s.slice("matrix3d(".length, -1).split(",");
    expect(nums.length).toBe(16);
  });
});

describe("isQuadValid", () => {
  it("accepts a convex quad", () => {
    expect(isQuadValid([TL, TR, BR, BL])).toBe(true);
  });

  it("rejects a self-intersecting (bowtie) quad", () => {
    // swap TR and BR -> bowtie
    expect(isQuadValid([TL, BR, TR, BL])).toBe(false);
  });

  it("rejects a collinear/degenerate quad", () => {
    expect(
      isQuadValid([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ]),
    ).toBe(false);
  });
});
