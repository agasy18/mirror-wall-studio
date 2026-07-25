// QR encoding, reduced to the two shapes the renderers need: a module matrix
// and a run-length compression of it.
//
// Pure module: no DOM, no canvas, no jsPDF. Unit-testable.

import qrcode from "qrcode-generator";

/** One horizontal run of dark modules. */
export interface QrRun {
  row: number;
  col: number;
  len: number;
}

export interface QrCode {
  /** Modules per side, excluding the quiet zone. */
  size: number;
  /** matrix[row][col] — true where the module is dark. */
  matrix: boolean[][];
}

/**
 * Encode `text` at the smallest version that fits.
 *
 * Error-correction level M (~15% recovery) rather than L: these codes are
 * printed on a template that gets folded, taped and cut, and photographed off
 * a wall at an angle. The extra modules cost a few millimetres and buy a code
 * that still scans when it is creased.
 */
export function encodeQr(text: string, ecLevel: "L" | "M" | "Q" | "H" = "M"): QrCode {
  if (!text) throw new Error("QR payload is empty");
  const qr = qrcode(0, ecLevel); // 0 = pick the smallest version that fits
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = new Array(size);
    for (let c = 0; c < size; c++) row[c] = qr.isDark(r, c);
    matrix.push(row);
  }
  return { size, matrix };
}

/**
 * Collapse each row's dark modules into horizontal runs.
 *
 * Drawn module-by-module a version-3 code is ~840 separate rectangles in the
 * PDF content stream; merged it is a few hundred. Same image, smaller file,
 * and no hairline seams between adjacent squares when a viewer antialiases.
 */
export function qrRuns(code: QrCode): QrRun[] {
  const runs: QrRun[] = [];
  for (let r = 0; r < code.size; r++) {
    let c = 0;
    while (c < code.size) {
      if (!code.matrix[r][c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < code.size && code.matrix[r][c]) c++;
      runs.push({ row: r, col: start, len: c - start });
    }
  }
  return runs;
}
