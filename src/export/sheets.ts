// Which sheets a template actually needs, and what the finished mirror
// measures. Split out of `tilePdf.ts` so the print dialog can show the real
// sheet count without pulling jsPDF — a third of the bundle — into the first
// paint.

import { clipPolylineToRect } from "../model/geometry";
import type { Tile, TilePlan } from "../model/tiling";

/**
 * The part of a sheet that survives assembly: everything up to the seam where
 * the next sheet is laid on top. The last row and column have no neighbour
 * after them, so they keep their whole printable area.
 */
export function keptRect(plan: TilePlan, tile: Tile) {
  return {
    x: tile.contentXmm,
    y: tile.contentYmm,
    w: tile.col < plan.cols - 1 ? plan.stepXmm : plan.printableWmm,
    h: tile.row < plan.rows - 1 ? plan.stepYmm : plan.printableHmm,
  };
}

/**
 * Which tiles to actually print, as indices into `plan.tiles`.
 *
 * A sheet whose kept area the outline never enters carries no information: on a
 * rounded mirror that is every corner of the grid, and the middle of a big one.
 * All it would contribute is blank paper, so it is left out — the user prints
 * fewer sheets and every sheet they do print has something on it.
 */
export function sheetsToPrint(
  outline: { x: number; y: number }[],
  plan: TilePlan,
  skipBlank: boolean,
): number[] {
  const all = plan.tiles.map((_, i) => i);
  if (!skipBlank) return all;
  const inked = all.filter(
    (i) => clipPolylineToRect(outline, keptRect(plan, plan.tiles[i])).length > 0,
  );
  // A shape too small to cross any kept area at all would otherwise print
  // nothing; fall back to the full set rather than hand back an empty PDF.
  return inked.length > 0 ? inked : all;
}

/** Enclosed area (shoelace) and outline length of the sampled curve, in mm. */
export function outlineStats(outline: { x: number; y: number }[]) {
  let twiceArea = 0;
  let perimeterMm = 0;
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i];
    const b = outline[i + 1];
    twiceArea += a.x * b.y - b.x * a.y;
    perimeterMm += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { areaMm2: Math.abs(twiceArea) / 2, perimeterMm };
}
