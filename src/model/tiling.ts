// Pure paper-tiling math. All units millimeters unless noted. Unit-testable.

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export interface PaperSize {
  id: string;
  name: string;
  wmm: number; // portrait width
  hmm: number; // portrait height
}

/**
 * Common paper sizes in portrait orientation (mm).
 *
 * Letter and Legal are exact, not rounded: these become the PDF MediaBox, and a
 * box that disagrees with the physical sheet is exactly what makes a driver
 * "scale to fit". At 279 instead of 279.4 that is 0.14% — 2.4 mm over a 1730 mm
 * mirror, on a product whose whole promise is 1:1.
 */
export const PAPER_SIZES: PaperSize[] = [
  { id: "a4", name: "A4", wmm: 210, hmm: 297 },
  { id: "letter", name: "Letter", wmm: 215.9, hmm: 279.4 },
  { id: "a3", name: "A3", wmm: 297, hmm: 420 },
  { id: "legal", name: "Legal", wmm: 215.9, hmm: 355.6 },
  { id: "a2", name: "A2", wmm: 420, hmm: 594 },
];

export const A4: PaperSize = PAPER_SIZES[0];

export function paperById(id: string): PaperSize {
  return PAPER_SIZES.find((p) => p.id === id) ?? A4;
}

export interface TileConfig {
  pageMarginMm: number; // printer non-printable margin per side
  overlapMm: number; // overlap band between adjacent pages
  paper: PaperSize;
}

export const DEFAULT_TILE_CONFIG: TileConfig = {
  pageMarginMm: 10,
  overlapMm: 10,
  paper: A4,
};

export interface Tile {
  row: number; // 0-based
  col: number; // 0-based
  label: string; // e.g. "R1-C2"
  // Content region of the OVERALL shape (in mm from shape's top-left) that this
  // page covers, including the overlap band.
  contentXmm: number;
  contentYmm: number;
  contentWmm: number;
  contentHmm: number;
}

export interface TilePlan {
  cols: number;
  rows: number;
  pageCount: number;
  /** Usable content area per page (page minus margins), before overlap. */
  stepXmm: number;
  stepYmm: number;
  printableWmm: number;
  printableHmm: number;
  tiles: Tile[];
}

/**
 * Given the shape's true size in mm, compute how it tiles across the chosen
 * paper size in portrait. Each page's printable area is (paper - 2*margin).
 * Adjacent pages share an `overlapMm` band, so each page advances by
 * (printable - overlap).
 */
export function planTiles(
  shapeWmm: number,
  shapeHmm: number,
  cfg: TileConfig = DEFAULT_TILE_CONFIG,
): TilePlan {
  const paper = cfg.paper ?? A4;
  const printableWmm = paper.wmm - 2 * cfg.pageMarginMm;
  const printableHmm = paper.hmm - 2 * cfg.pageMarginMm;

  if (printableWmm <= 0 || printableHmm <= 0) {
    throw new Error("Page margins leave no printable area");
  }
  // An overlap at least as wide as the printable area gives a zero or negative
  // step, and Math.ceil(x / 0) is Infinity — an unbounded tile loop.
  if (cfg.overlapMm >= printableWmm || cfg.overlapMm >= printableHmm) {
    throw new Error("Overlap must be smaller than the printable area");
  }

  const stepXmm = printableWmm - cfg.overlapMm;
  const stepYmm = printableHmm - cfg.overlapMm;

  const cols = Math.max(1, Math.ceil((shapeWmm - cfg.overlapMm) / stepXmm));
  const rows = Math.max(1, Math.ceil((shapeHmm - cfg.overlapMm) / stepYmm));

  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        row,
        col,
        label: `R${row + 1}-C${col + 1}`,
        contentXmm: col * stepXmm,
        contentYmm: row * stepYmm,
        contentWmm: printableWmm,
        contentHmm: printableHmm,
      });
    }
  }

  return {
    cols,
    rows,
    pageCount: cols * rows,
    stepXmm,
    stepYmm,
    printableWmm,
    printableHmm,
    tiles,
  };
}
