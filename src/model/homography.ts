// Pure perspective-transform math for the photo calibration step.
// Computes the homography mapping a source quad -> destination rectangle and
// serializes it to a CSS matrix3d string. No DOM, no deps — unit-testable.

export interface Pt {
  x: number;
  y: number;
}

/**
 * Solve for the 3x3 homography H (h33 fixed to 1) mapping the four source
 * points to the four destination points. Returns the 8 unknowns
 * [h11,h12,h13,h21,h22,h23,h31,h32] plus the implied h33=1.
 *
 * Sets up the standard 8x8 linear system and solves via Gaussian elimination.
 * `src` and `dst` are ordered [TL, TR, BR, BL].
 */
export function computeHomography(src: Pt[], dst: Pt[]): number[] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error("computeHomography requires exactly 4 source and 4 dest points");
  }
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solveLinear(A, b); // length 8
  return [...h, 1];
}

/**
 * Serialize a 3x3 homography (row-major, length 9) into a CSS matrix3d string.
 *
 * CSS matrix3d is column-major 4x4. A 2D projective transform embeds as:
 *   [ h11 h12 0 h13 ]      column-major -> (m11,m12,m13,m14, m21,...)
 *   [ h21 h22 0 h23 ]
 *   [  0   0  1  0  ]
 *   [ h31 h32 0 h33 ]
 */
export function homographyToMatrix3d(h: number[]): string {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = h;
  // column-major order for matrix3d(...)
  const m = [
    h11, h21, 0, h31,
    h12, h22, 0, h32,
    0, 0, 1, 0,
    h13, h23, 0, h33,
  ];
  return `matrix3d(${m.map((v) => trim(v)).join(", ")})`;
}

/** Apply a homography to a point. */
export function applyHomography(h: number[], p: Pt): Pt {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = h;
  const w = h31 * p.x + h32 * p.y + h33;
  return {
    x: (h11 * p.x + h12 * p.y + h13) / w,
    y: (h21 * p.x + h22 * p.y + h23) / w,
  };
}

/**
 * A quad [TL,TR,BR,BL] is valid for calibration if it is convex and
 * non-degenerate (positive area, no near-zero edges). Returns true if usable.
 */
export function isQuadValid(quad: Pt[]): boolean {
  if (quad.length !== 4) return false;
  // All cross products of consecutive edges must share the same sign (convex).
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false; // collinear / degenerate
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false; // not convex
  }
  return true;
}

// --- Gaussian elimination with partial pivoting ---
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  // augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // pivot
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) {
      throw new Error("Singular matrix in homography solve");
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    // eliminate
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

function trim(v: number): string {
  return String(Math.round(v * 1e9) / 1e9);
}
