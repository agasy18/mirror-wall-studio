import { describe, expect, it } from "vitest";
import { buildTiledPdf, keptRect, OUTLINE_MM, sheetsToPrint } from "./tilePdf";
import { pdfPageSegments, visibleInk, type PdfSeg, type Placed } from "./pdfPages";
import { DEFAULT_TILE_CONFIG, paperById, planTiles, type TileConfig } from "../model/tiling";
import { clipPolylineToRect, curveBounds, sampleClosedSpline } from "../model/geometry";
import type { ShapePoint } from "../model/shape";

/**
 * Take the exported PDF apart, lay the sheets out the way the cover tells the
 * user to, and check the outline is still one unbroken curve.
 *
 * Page-by-page geometry was always right; what was wrong was the assembly. The
 * sheets used to be trimmed on their TRAILING edge and the next one laid on
 * top — but that next sheet still carries its own 10 mm unprintable margin on
 * its leading edge, so it covered the last 10 mm of the sheet underneath with
 * blank paper. A white band at every seam, straight through the line you cut
 * along. Only stacking the sheets shows it, which is what this does.
 */

/** A full-length mirror: 4 x 7 A4 sheets, several of them blank. */
const MIRROR: ShapePoint[] = [
  { id: "a", x: 34, y: 0 },
  { id: "b", x: 62, y: 30 },
  { id: "c", x: 68, y: 90 },
  { id: "d", x: 50, y: 150 },
  { id: "e", x: 20, y: 160 },
  { id: "f", x: 2, y: 110 },
  { id: "g", x: 6, y: 40 },
];

/** Round, so the grid corners are empty. */
const ROUND: ShapePoint[] = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { id: `p${i}`, x: 45 + 40 * Math.cos(a), y: 60 + 55 * Math.sin(a) };
});

function referenceOutline(points: ShapePoint[]) {
  const bb = curveBounds(points);
  return sampleClosedSpline(
    points.map((p) => ({ x: (p.x - bb.minX) * 10, y: (p.y - bb.minY) * 10 })),
    24,
  );
}

type Trim = "leading" | "trailing";

/**
 * Export, then physically reassemble: cut each sheet's trim edges, lay it on
 * the growing stack, and return the ink still visible from above.
 */
function reassemble(
  points: ShapePoint[],
  cfg: TileConfig,
  trim: Trim,
  opts: { skipBlank?: boolean } = {},
) {
  const built = buildTiledPdf(points, cfg, { skipBlank: opts.skipBlank ?? true });
  const { plan, printed } = built;
  const pages = pdfPageSegments(built.doc.output("arraybuffer"), cfg.paper.hmm);
  expect(pages.length).toBe(printed.length + 1); // + cover

  const m = cfg.pageMarginMm;
  const sheets: Placed[] = printed.map((tileIndex, i) => {
    const tile = plan.tiles[tileIndex];
    // Page mm -> shape mm.
    const dx = tile.contentXmm - m;
    const dy = tile.contentYmm - m;
    const ink: PdfSeg[] = pages[i + 1]
      .filter((s) => Math.abs(s.w - OUTLINE_MM) < 1e-3)
      .map((s) => ({ ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }));

    // The paper, in shape mm, after cutting. Trimming a leading edge moves it
    // in to the first column of ink; trimming a trailing edge cuts it back to
    // the seam. Untrimmed edges keep the full sheet, margin and all.
    const left = trim === "leading" && tile.col > 0 ? tile.contentXmm : dx;
    const top = trim === "leading" && tile.row > 0 ? tile.contentYmm : dy;
    const right =
      trim === "trailing" && tile.col < plan.cols - 1
        ? tile.contentXmm + plan.stepXmm
        : dx + cfg.paper.wmm;
    const bottom =
      trim === "trailing" && tile.row < plan.rows - 1
        ? tile.contentYmm + plan.stepYmm
        : dy + cfg.paper.hmm;

    return { paper: { x: left, y: top, w: right - left, h: bottom - top }, ink };
  });

  return { built, plan, printed, visible: visibleInk(sheets) };
}

/** Longest stretch of the true outline with no visible ink under it, in mm. */
function worstGap(reference: { x: number; y: number }[], ink: PdfSeg[]) {
  let worst = 0;
  let at = { x: 0, y: 0 };
  for (let i = 1; i < reference.length; i++) {
    const a = reference[i - 1];
    const b = reference[i];
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      let best = Infinity;
      for (const s of ink) {
        const d = distToSeg(p.x, p.y, s);
        if (d < best) best = d;
        if (best < 0.01) break;
      }
      if (best > worst) {
        worst = best;
        at = p;
      }
    }
  }
  return { worst, at };
}

function distToSeg(px: number, py: number, s: PdfSeg) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

describe("a printed template, cut out and taped together", () => {
  it("carries the whole outline, unbroken across every seam", () => {
    const { visible } = reassemble(MIRROR, DEFAULT_TILE_CONFIG, "leading");
    const { worst } = worstGap(referenceOutline(MIRROR), visible);
    expect(worst).toBeLessThan(0.01);
  });

  it("would have been broken at every seam by trimming the trailing edge", () => {
    // The bug this scheme replaced. The overlying sheet's own margin blanks out
    // the sheet below, so the gap is about one margin wide.
    const { visible } = reassemble(MIRROR, DEFAULT_TILE_CONFIG, "trailing");
    const { worst } = worstGap(referenceOutline(MIRROR), visible);
    expect(worst).toBeGreaterThan(DEFAULT_TILE_CONFIG.pageMarginMm / 3);
  });

  it("joins up on every paper size", () => {
    for (const id of ["a4", "letter", "a3", "legal"]) {
      const cfg = { ...DEFAULT_TILE_CONFIG, paper: paperById(id) };
      const { visible } = reassemble(MIRROR, cfg, "leading");
      const { worst } = worstGap(referenceOutline(MIRROR), visible);
      expect(worst, id).toBeLessThan(0.01);
    }
  });

  it("still joins up when the blank sheets are left out", () => {
    const { visible, printed, plan } = reassemble(ROUND, DEFAULT_TILE_CONFIG, "leading", {
      skipBlank: true,
    });
    expect(printed.length).toBeLessThan(plan.pageCount);
    const { worst } = worstGap(referenceOutline(ROUND), visible);
    expect(worst).toBeLessThan(0.01);
  });
});

describe("the marks that tell you where a sheet goes", () => {
  /** Join ticks are the only 0.3 mm strokes on a template sheet. */
  const TICK_MM = 0.3;

  function sheetsWithTicks() {
    const cfg = DEFAULT_TILE_CONFIG;
    const built = buildTiledPdf(MIRROR, cfg, { skipBlank: false });
    const pages = pdfPageSegments(built.doc.output("arraybuffer"), cfg.paper.hmm);
    const m = cfg.pageMarginMm;
    return built.printed.map((ti, i) => {
      const tile = built.plan.tiles[ti];
      const dx = tile.contentXmm - m;
      const dy = tile.contentYmm - m;
      return {
        tile,
        ticks: pages[i + 1]
          .filter((s) => Math.abs(s.w - TICK_MM) < 1e-3)
          .map((s) => ({ ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })),
      };
    });
  }

  it("puts a matching pair on both sides of every seam", () => {
    // The old sheets carried registration crosses only at their own printable
    // corners: the ones on the trailing edge were cut off, and the ones on the
    // next sheet's leading edge ended up underneath it. Nothing left to line up
    // against. Each seam now gets ticks that run up to it from both sides and
    // form one straight line when — and only when — the sheets are aligned.
    const sheets = sheetsWithTicks();
    const plan = planTiles(curveBounds(MIRROR).width * 10, curveBounds(MIRROR).height * 10);
    const at = (r: number, c: number) => sheets.find((s) => s.tile.row === r && s.tile.col === c);
    let seamsChecked = 0;

    for (const s of sheets) {
      const right = at(s.tile.row, s.tile.col + 1);
      if (right) {
        const seamX = (s.tile.col + 1) * plan.stepXmm;
        const ends = s.ticks
          .filter((t) => t.y1 === t.y2 && Math.abs(Math.max(t.x1, t.x2) - seamX) < 1e-6)
          .map((t) => round(t.y1));
        const starts = right.ticks
          .filter((t) => t.y1 === t.y2 && Math.abs(Math.min(t.x1, t.x2) - seamX) < 1e-6)
          .map((t) => round(t.y1));
        expect(ends.length, `${s.tile.label} right ticks`).toBeGreaterThanOrEqual(2);
        expect(starts.sort()).toEqual(ends.sort());
        seamsChecked++;
      }

      const below = at(s.tile.row + 1, s.tile.col);
      if (below) {
        const seamY = (s.tile.row + 1) * plan.stepYmm;
        const ends = s.ticks
          .filter((t) => t.x1 === t.x2 && Math.abs(Math.max(t.y1, t.y2) - seamY) < 1e-6)
          .map((t) => round(t.x1));
        const starts = below.ticks
          .filter((t) => t.x1 === t.x2 && Math.abs(Math.min(t.y1, t.y2) - seamY) < 1e-6)
          .map((t) => round(t.x1));
        expect(ends.length, `${s.tile.label} bottom ticks`).toBeGreaterThanOrEqual(2);
        expect(starts.sort()).toEqual(ends.sort());
        seamsChecked++;
      }
    }
    expect(seamsChecked).toBeGreaterThan(30);
  });

  it("leaves the outer edges of the poster unmarked", () => {
    // Nothing joins there, so a tick would just be ink on the finished stencil.
    const sheets = sheetsWithTicks();
    const first = sheets.find((s) => s.tile.row === 0 && s.tile.col === 0)!;
    expect(first.ticks.some((t) => t.x1 === t.x2 && Math.min(t.y1, t.y2) === 0)).toBe(false);
    expect(first.ticks.some((t) => t.y1 === t.y2 && Math.min(t.x1, t.x2) === 0)).toBe(false);
  });
});

function round(v: number) {
  return Math.round(v * 1e6) / 1e6;
}

describe("leaving out blank sheets", () => {
  const outline = referenceOutline(ROUND);
  const bb = curveBounds(ROUND);
  const plan = planTiles(bb.width * 10, bb.height * 10, DEFAULT_TILE_CONFIG);

  it("drops sheets the outline never enters, and keeps the ones it does", () => {
    const printed = sheetsToPrint(outline, plan, true);
    expect(printed.length).toBeGreaterThan(0);
    expect(printed.length).toBeLessThan(plan.pageCount);
    for (let i = 0; i < plan.tiles.length; i++) {
      const hasInk = clipPolylineToRect(outline, keptRect(plan, plan.tiles[i])).length > 0;
      expect(printed.includes(i), `tile ${plan.tiles[i].label}`).toBe(hasInk);
    }
  });

  it("prints everything when asked to", () => {
    expect(sheetsToPrint(outline, plan, false).length).toBe(plan.pageCount);
  });

  it("leaves the printed sheets in one connected piece", () => {
    // A sheet is aligned against its left and upper neighbours, so an island
    // with no printed neighbour has nothing to line up with.
    const printed = new Set(sheetsToPrint(outline, plan, true));
    const idx = (r: number, c: number) => r * plan.cols + c;
    const seen = new Set<number>();
    const first = [...printed][0];
    const queue = [first];
    seen.add(first);
    while (queue.length) {
      const cur = queue.pop()!;
      const tile = plan.tiles[cur];
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const r = tile.row + dr;
        const c = tile.col + dc;
        if (r < 0 || c < 0 || r >= plan.rows || c >= plan.cols) continue;
        const n = idx(r, c);
        if (!printed.has(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    expect(seen.size).toBe(printed.size);
  });
});
