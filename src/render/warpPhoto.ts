// Pre-warp the calibrated wall region of a photo into a flat bitmap, sized in
// cm-proportional pixels. The result is drawn affinely by the camera, so the
// whole app shares ONE cm coordinate system (photo + shape + handles).
//
// Canvas 2D has no projective transform, so we rewarp by splitting the source
// quad into triangles and drawing each with an affine transform (standard
// texture-mapping trick). Good enough for a design backdrop.

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
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  // Map bitmap-dst px -> photo-src px by composing (bmp->cm) then (cm->photo).
  const srcForDst = (d: Pt): Pt => {
    const cm = { x: minX + d.x / ppc, y: minY + d.y / ppc };
    return applyHomography(cmToPhoto, cm);
  };

  drawWarpTriangle(ctx, img, dst[0], dst[1], dst[2], srcForDst);
  drawWarpTriangle(ctx, img, dst[0], dst[2], dst[3], srcForDst);

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

  // Destination rectangle corners in output-bitmap pixels (TL,TR,BR,BL).
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  // Map destination-bitmap px -> source-photo px.
  const h = computeHomography(dst, quad);

  // Two triangles covering the destination: (TL,TR,BR) and (TL,BR,BL).
  drawTriangle(ctx, img, h, dst[0], dst[1], dst[2]);
  drawTriangle(ctx, img, h, dst[0], dst[2], dst[3]);

  return { canvas, widthCm, heightCm, pxPerCm };
}

/** Affine-map a destination triangle from its source triangle via homography h. */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  h: number[],
  d0: Pt,
  d1: Pt,
  d2: Pt,
) {
  drawWarpTriangle(ctx, img, d0, d1, d2, (d) => applyHomography(h, d));
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
  const s0 = srcFn(d0);
  const s1 = srcFn(d1);
  const s2 = srcFn(d2);

  ctx.save();
  // Clip to the destination triangle.
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  // Solve the affine transform mapping source triangle -> dest triangle.
  const denom =
    (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(denom) < 1e-9) {
    ctx.restore();
    return;
  }
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denom;
  const b = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denom;
  const c = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denom;
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denom;
  const e = d0.x - a * s0.x - b * s0.y;
  const f = d0.y - c * s0.x - d * s0.y;

  ctx.setTransform(a, c, b, d, e, f);
  // Slight overdraw to avoid hairline seams between triangles.
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
