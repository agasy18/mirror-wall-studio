import { describe, it, expect } from "vitest";
import { findQrSpots, qrCountFor, QR_BLOCK } from "./tilePdf";
import { pointInPolygon, rectInPolygon, sampleClosedSpline } from "../model/geometry";
import { DEFAULT_TILE_CONFIG, planTiles } from "../model/tiling";
import { makePresetById } from "../data/presetShapes";

/**
 * The QR belongs on the template sheets, inside the outline — the cover is read
 * once and binned, while the paper inside the outline is cut out and becomes the
 * stencil. Two things have to hold or the code is worthless: it must be fully
 * inside the shape (or it gets cut off), and fully within one sheet's kept area
 * (or it straddles a seam and only scans if the tape lines up perfectly).
 */

function outlineFor(presetId: string, targetWmm: number, targetHmm: number) {
  const pts = makePresetById(presetId);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const shifted = pts.map((p) => ({
    x: ((p.x - Math.min(...xs)) / w) * targetWmm,
    y: ((p.y - Math.min(...ys)) / h) * targetHmm,
  }));
  return sampleClosedSpline(shifted, 24);
}

describe("where the QR goes on the template sheets", () => {
  const outline = outlineFor("pebble", 680, 1730); // a 68 x 173 cm mirror, in mm
  const plan = planTiles(680, 1730, DEFAULT_TILE_CONFIG);
  const spots = findQrSpots(outline, plan, QR_BLOCK);

  it("places several codes, not one and not one per sheet", () => {
    expect(plan.pageCount).toBeGreaterThan(20);
    expect(spots.length).toBe(qrCountFor(plan.pageCount));
    expect(spots.length).toBeGreaterThan(1);
    expect(spots.length).toBeLessThan(plan.pageCount / 4);
  });

  it("puts every code wholly inside the mirror outline", () => {
    for (const s of spots) {
      expect(rectInPolygon(outline, { x: s.x, y: s.y, w: QR_BLOCK.w, h: QR_BLOCK.h })).toBe(true);
      // and spot-check the corners directly, independent of that helper
      for (const [dx, dy] of [[0, 0], [QR_BLOCK.w, 0], [0, QR_BLOCK.h], [QR_BLOCK.w, QR_BLOCK.h]]) {
        expect(pointInPolygon(outline, s.x + dx, s.y + dy)).toBe(true);
      }
    }
  });

  it("never lets a code cross into an overlap band", () => {
    for (const s of spots) {
      const tile = plan.tiles[s.tile];
      const keptW = tile.col < plan.cols - 1 ? plan.stepXmm : plan.printableWmm;
      const keptH = tile.row < plan.rows - 1 ? plan.stepYmm : plan.printableHmm;
      expect(s.x).toBeGreaterThanOrEqual(tile.contentXmm);
      expect(s.y).toBeGreaterThanOrEqual(tile.contentYmm);
      expect(s.x + QR_BLOCK.w).toBeLessThanOrEqual(tile.contentXmm + keptW);
      expect(s.y + QR_BLOCK.h).toBeLessThanOrEqual(tile.contentYmm + keptH);
    }
  });

  it("uses a different sheet for each code, and spreads them out", () => {
    expect(new Set(spots.map((s) => s.tile)).size).toBe(spots.length);
    // No two codes within a sheet's height of each other.
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y);
        expect(d).toBeGreaterThan(plan.stepYmm * 0.5);
      }
    }
  });

  it("scales the number of codes to the number of sheets", () => {
    expect(qrCountFor(1)).toBe(1);
    expect(qrCountFor(6)).toBe(1);
    expect(qrCountFor(12)).toBe(2);
    expect(qrCountFor(28)).toBe(4);
    expect(qrCountFor(200)).toBe(4); // capped
  });

  it("returns nothing rather than a clipped code when the mirror is too narrow", () => {
    // 2 cm wide against a 30 mm block: it cannot fit at any point, however
    // rectangular the silhouette. (A 4 cm pill still fits one, and does.)
    const thin = outlineFor("pill", 20, 1200);
    const thinPlan = planTiles(20, 1200, DEFAULT_TILE_CONFIG);
    expect(findQrSpots(thin, thinPlan, QR_BLOCK)).toEqual([]);

    const roomy = outlineFor("pill", 40, 1200);
    expect(findQrSpots(roomy, planTiles(40, 1200, DEFAULT_TILE_CONFIG), QR_BLOCK).length)
      .toBeGreaterThan(0);
  });
});
