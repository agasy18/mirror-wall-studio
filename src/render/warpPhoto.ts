// Pre-warp the calibrated wall region of a photo into a flat bitmap, sized in
// cm-proportional pixels. The result is drawn affinely by the camera, so the
// whole app shares ONE cm coordinate system (photo + shape + handles).
//
// Canvas 2D has no projective transform, so the warp is done as a mesh of
// triangles, each drawn with an affine transform (the standard texture-mapping
// trick).
//
// The mesh has to be FINE. An affine map agrees with a projective one only at
// the three corners it was solved from and drifts everywhere in between, so the
// original two-triangle version only lined up at the photo's own corners: the
// straightened wall was visibly offset from the rectangle the user marked, by
// more the further from a corner you looked and the more perspective the photo
// had. Subdividing shrinks each cell until its affine approximation is
// indistinguishable from the true homography — the error falls roughly with the
// square of the cell count.

import { computeHomography, applyHomography, type Pt } from "../model/homography";

export interface WarpedWall {
  canvas: HTMLCanvasElement;
  /** cm size the bitmap represents (== calibrated rectangle). */
  widthCm: number;
  heightCm: number;
  /** bitmap pixels per cm. */
  pxPerCm: number;
}

export interface WarpedRoom {
  canvas: HTMLCanvasElement;
  /** cm bounds this bitmap covers (extends beyond the wall rectangle). */
  minXCm: number;
  minYCm: number;
  widthCm: number;
  heightCm: number;
  pxPerCm: number;
}

/**
 * Warp the ENTIRE photo (the whole room) into cm space. The marked quad maps to
 * (0,0)-(realW,realH) cm; pixels outside it get cm coords outside that rect, so
 * the returned bitmap covers a larger cm region. Used to show dimmed room
 * context around the calibrated wall rectangle.
 */
export function warpRoom(
  img: HTMLImageElement,
  quad: Pt[],
  widthCm: number,
  heightCm: number,
  pxPerCm = 6,
  maxCanvasPx = 3000,
): WarpedRoom {
  // photo-px -> cm homography (quad -> wall rectangle in cm).
  const wallDstCm: Pt[] = [
    { x: 0, y: 0 },
    { x: widthCm, y: 0 },
    { x: widthCm, y: heightCm },
    { x: 0, y: heightCm },
  ];
  const photoToCm = computeHomography(quad, wallDstCm);

  // cm bounding box of the whole photo (its 4 corners).
  const photoCorners: Pt[] = [
    { x: 0, y: 0 },
    { x: img.naturalWidth, y: 0 },
    { x: img.naturalWidth, y: img.naturalHeight },
    { x: 0, y: img.naturalHeight },
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of photoCorners) {
    const p = applyHomography(photoToCm, c);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const roomWcm = maxX - minX;
  const roomHcm = maxY - minY;

  // clamp resolution so we never allocate an enormous canvas.
  let ppc = pxPerCm;
  if (roomWcm * ppc > maxCanvasPx) ppc = maxCanvasPx / roomWcm;
  if (roomHcm * ppc > maxCanvasPx) ppc = Math.min(ppc, maxCanvasPx / roomHcm);

  const outW = Math.max(1, Math.round(roomWcm * ppc));
  const outH = Math.max(1, Math.round(roomHcm * ppc));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // Destination bitmap px corners -> source photo px.
  // bitmap px maps to cm via: cm = minXY + bmpPx / ppc; then cm -> photo px via inverse homography.
  const cmToPhoto = computeHomography(wallDstCm, quad);
  // Map bitmap-dst px -> photo-src px by composing (bmp->cm) then (cm->photo).
  const srcForDst = (d: Pt): Pt => {
    const cm = { x: minX + d.x / ppc, y: minY + d.y / ppc };
    return applyHomography(cmToPhoto, cm);
  };

  drawWarpMesh(ctx, img, outW, outH, srcForDst);

  return {
    canvas,
    minXCm: minX,
    minYCm: minY,
    widthCm: roomWcm,
    heightCm: roomHcm,
    pxPerCm: ppc,
  };
}

/**
 * Flatten the quad (photo-pixel corners, order TL,TR,BR,BL) that the user
 * marked as a `widthCm × heightCm` rectangle into a head-on bitmap.
 */
export function warpWall(
  img: HTMLImageElement,
  quad: Pt[],
  widthCm: number,
  heightCm: number,
  pxPerCm = 8,
): WarpedWall {
  const outW = Math.max(1, Math.round(widthCm * pxPerCm));
  const outH = Math.max(1, Math.round(heightCm * pxPerCm));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // Map destination-bitmap px -> source-photo px.
  const h = computeHomography(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    quad,
  );

  drawWarpMesh(ctx, img, outW, outH, (d) => applyHomography(h, d));

  return { canvas, widthCm, heightCm, pxPerCm };
}

/**
 * How many cells per side the warp mesh is divided into. 48 puts the worst-case
 * approximation error under half a drawn pixel even at an extreme shooting angle
 * (measured), where two triangles were out by 150-400 pixels.
 */
export const WARP_CELLS = 48;

/** Cover the destination bitmap with a WARP_CELLS x WARP_CELLS triangle mesh. */
function drawWarpMesh(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  outW: number,
  outH: number,
  srcFn: (d: Pt) => Pt,
) {
  for (let iy = 0; iy < WARP_CELLS; iy++) {
    for (let ix = 0; ix < WARP_CELLS; ix++) {
      const x0 = (outW * ix) / WARP_CELLS;
      const x1 = (outW * (ix + 1)) / WARP_CELLS;
      const y0 = (outH * iy) / WARP_CELLS;
      const y1 = (outH * (iy + 1)) / WARP_CELLS;
      const tl = { x: x0, y: y0 };
      const tr = { x: x1, y: y0 };
      const br = { x: x1, y: y1 };
      const bl = { x: x0, y: y1 };
      drawWarpTriangle(ctx, img, tl, tr, br, srcFn);
      drawWarpTriangle(ctx, img, tl, br, bl, srcFn);
    }
  }
}

/**
 * Affine-map one destination triangle from its corresponding source-photo
 * triangle. `srcFn` maps a destination point to its source-photo pixel.
 */
function drawWarpTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  d0: Pt,
  d1: Pt,
  d2: Pt,
  srcFn: (d: Pt) => Pt,
) {
  const t = affineForTriangle(d0, d1, d2, srcFn(d0), srcFn(d1), srcFn(d2));
  if (!t) return;

  ctx.save();
  // Clip to the destination triangle, grown by half a pixel. With a mesh this
  // fine the seams between neighbouring cells would otherwise show as hairlines
  // wherever antialiasing leaves both sides of an edge partly transparent.
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: Pt): Pt => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * 0.5, y: p.y + (dy / len) * 0.5 };
  };
  const g0 = grow(d0);
  const g1 = grow(d1);
  const g2 = grow(d2);
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.lineTo(g2.x, g2.y);
  ctx.closePath();
  ctx.clip();

  ctx.setTransform(t.a, t.c, t.b, t.d, t.e, t.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * The affine transform carrying source triangle (s0,s1,s2) onto destination
 * triangle (d0,d1,d2). Exact at those three points and only there — which is
 * precisely why the mesh has to be fine.
 */
export function affineForTriangle(
  d0: Pt,
  d1: Pt,
  d2: Pt,
  s0: Pt,
  s1: Pt,
  s2: Pt,
): Affine | null {
  const denom = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(denom) < 1e-9) return null;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denom;
  const b = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denom;
  const c = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denom;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denom;
  return { a, b, c, d, e: d0.x - a * s0.x - b * s0.y, f: d0.y - c * s0.x - d * s0.y };
}
