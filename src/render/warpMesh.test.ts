import { describe, it, expect } from "vitest";
import { affineForTriangle, WARP_CELLS } from "./warpPhoto";
import { applyHomography, computeHomography, type Pt } from "../model/homography";

/**
 * Canvas 2D cannot draw a projective transform, so the straightening is a mesh
 * of affine triangles. Each affine agrees with the true homography only at the
 * three corners it was solved from, so the mesh has to be fine enough that the
 * drift in between is invisible.
 *
 * This measures that drift directly: for a point on the straightened bitmap, it
 * compares the photo pixel the mesh actually samples against the one the
 * homography says it should. The original two-triangle mesh was off by tens of
 * pixels in the middle of the image, which is what made the straightened wall
 * sit slightly off the rectangle the user marked.
 */

/** A photo shot noticeably off-axis: the marked wall region is a real trapezoid. */
const PHOTO_W = 1600;
const PHOTO_H = 1200;
const SKEWED_QUAD: Pt[] = [
  { x: 300, y: 220 },
  { x: 1250, y: 120 },
  { x: 1350, y: 1050 },
  { x: 240, y: 900 },
];

function invert({ a, b, c, d, e, f }: { a: number; b: number; c: number; d: number; e: number; f: number }) {
  const det = a * d - b * c;
  return (p: Pt): Pt => {
    const x = p.x - e;
    const y = p.y - f;
    return { x: (d * x - b * y) / det, y: (-c * x + a * y) / det };
  };
}

/**
 * Worst-case error, in photo pixels, of an N x N affine mesh approximating the
 * exact bitmap -> photo mapping.
 */
function meshError(quad: Pt[], outW: number, outH: number, cells: number): number {
  const H = computeHomography(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    quad,
  );
  const exact = (p: Pt) => applyHomography(H, p);

  let worst = 0;
  for (let iy = 0; iy < cells; iy++) {
    for (let ix = 0; ix < cells; ix++) {
      const x0 = (outW * ix) / cells;
      const x1 = (outW * (ix + 1)) / cells;
      const y0 = (outH * iy) / cells;
      const y1 = (outH * (iy + 1)) / cells;
      const tl = { x: x0, y: y0 };
      const tr = { x: x1, y: y0 };
      const br = { x: x1, y: y1 };
      const bl = { x: x0, y: y1 };

      for (const [d0, d1, d2] of [
        [tl, tr, br],
        [tl, br, bl],
      ] as Array<[Pt, Pt, Pt]>) {
        const t = affineForTriangle(d0, d1, d2, exact(d0), exact(d1), exact(d2));
        if (!t) continue;
        const back = invert(t);
        // Sample the triangle's interior barycentrically.
        for (let u = 0; u <= 4; u++) {
          for (let v = 0; u + v <= 4; v++) {
            const w0 = u / 4;
            const w1 = v / 4;
            const w2 = 1 - w0 - w1;
            const p = {
              x: d0.x * w0 + d1.x * w1 + d2.x * w2,
              y: d0.y * w0 + d1.y * w1 + d2.y * w2,
            };
            const got = back(p);
            const want = exact(p);
            worst = Math.max(worst, Math.hypot(got.x - want.x, got.y - want.y));
          }
        }
      }
    }
  }
  return worst;
}

describe("the straightening mesh", () => {
  const OUT_W = 900;
  const OUT_H = 700;

  it("is exact at a triangle's own corners, and only there", () => {
    const H = computeHomography(
      [
        { x: 0, y: 0 },
        { x: OUT_W, y: 0 },
        { x: OUT_W, y: OUT_H },
        { x: 0, y: OUT_H },
      ],
      SKEWED_QUAD,
    );
    const exact = (p: Pt) => applyHomography(H, p);
    const d0 = { x: 0, y: 0 };
    const d1 = { x: OUT_W, y: 0 };
    const d2 = { x: OUT_W, y: OUT_H };
    const t = affineForTriangle(d0, d1, d2, exact(d0), exact(d1), exact(d2))!;
    const back = invert(t);
    for (const corner of [d0, d1, d2]) {
      const got = back(corner);
      const want = exact(corner);
      expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-6);
    }
    // ...but the middle of that same triangle is far off.
    const mid = { x: OUT_W / 2, y: OUT_H / 3 };
    const off = Math.hypot(back(mid).x - exact(mid).x, back(mid).y - exact(mid).y);
    expect(off).toBeGreaterThan(5);
  });

  it("was visibly wrong with the original two triangles", () => {
    // This is the bug: a whole-image affine misplaces the photo by tens of
    // pixels away from the corners, so the straightened wall did not line up
    // with the rectangle the user marked.
    expect(meshError(SKEWED_QUAD, OUT_W, OUT_H, 1)).toBeGreaterThan(10);
  });

  it("is sub-pixel at the mesh resolution actually used", () => {
    expect(meshError(SKEWED_QUAD, OUT_W, OUT_H, WARP_CELLS)).toBeLessThan(0.5);
  });

  it("converges roughly quadratically as the mesh is refined", () => {
    const e4 = meshError(SKEWED_QUAD, OUT_W, OUT_H, 4);
    const e8 = meshError(SKEWED_QUAD, OUT_W, OUT_H, 8);
    const e16 = meshError(SKEWED_QUAD, OUT_W, OUT_H, 16);
    expect(e8).toBeLessThan(e4 / 3);
    expect(e16).toBeLessThan(e8 / 3);
  });

  it("is exact everywhere when the quad is already a rectangle", () => {
    // No perspective to undo: the mapping is affine, so even one cell is exact.
    // This is why a demo shot head-on never showed the bug.
    const rect: Pt[] = [
      { x: 100, y: 100 },
      { x: 1100, y: 100 },
      { x: 1100, y: 900 },
      { x: 100, y: 900 },
    ];
    expect(meshError(rect, OUT_W, OUT_H, 1)).toBeLessThan(1e-6);
  });

  it("stays sub-pixel on an extreme angle too", () => {
    const extreme: Pt[] = [
      { x: 120, y: 400 },
      { x: 1500, y: 90 },
      { x: 1560, y: 1150 },
      { x: 100, y: 780 },
    ];
    expect(meshError(extreme, PHOTO_W, PHOTO_H, 1)).toBeGreaterThan(20);
    expect(meshError(extreme, PHOTO_W, PHOTO_H, WARP_CELLS)).toBeLessThan(1);
  });
});
