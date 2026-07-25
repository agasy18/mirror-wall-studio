// A single camera mapping a cm-space world rectangle into canvas pixels.
// Everything on screen — wall photo, mirror shape, control handles — lives in
// cm and is drawn through this one transform, so a window/canvas resize only
// recomputes the scale and nothing drifts apart.
//
// Pure module: no DOM, no canvas API. Unit-testable.

export interface WorldRect {
  x: number; // cm
  y: number; // cm
  w: number; // cm
  h: number; // cm
}

export interface Camera {
  scale: number; // pixels per cm
  offsetX: number; // canvas px added after scaling (letterbox centering)
  offsetY: number;
}

/**
 * Fit `world` (cm) into a canvas of `canvasW × canvasH` px, preserving aspect
 * ratio and centering (letterbox). Returns the cm→px camera.
 */
export function fitCamera(
  world: WorldRect,
  canvasW: number,
  canvasH: number,
): Camera {
  if (world.w <= 0 || world.h <= 0 || canvasW <= 0 || canvasH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(canvasW / world.w, canvasH / world.h);
  const drawnW = world.w * scale;
  const drawnH = world.h * scale;
  const offsetX = (canvasW - drawnW) / 2 - world.x * scale;
  const offsetY = (canvasH - drawnH) / 2 - world.y * scale;
  return { scale, offsetX, offsetY };
}

/**
 * User zoom/pan layered on top of the fitted camera. Kept separate so the fit
 * stays the source of truth: a resize recomputes the fit and the user's view
 * survives unchanged.
 */
export interface ViewTransform {
  zoom: number; // 1 = fitted
  panX: number; // canvas px, applied after zooming about the canvas centre
  panY: number;
}

export const IDENTITY_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 12;

export function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Keep the fitted world covering the canvas: at zoom z the content is z times
 * the canvas, so the centre may move by at most half the excess in each axis.
 * At zoom 1 this pins the pan to 0.
 */
export function clampPan(view: ViewTransform, canvasW: number, canvasH: number): ViewTransform {
  const zoom = clampZoom(view.zoom);
  const maxX = Math.max(0, ((zoom - 1) * canvasW) / 2);
  const maxY = Math.max(0, ((zoom - 1) * canvasH) / 2);
  return {
    zoom,
    panX: Math.min(maxX, Math.max(-maxX, view.panX)),
    panY: Math.min(maxY, Math.max(-maxY, view.panY)),
  };
}

/** Compose the fitted camera with the user's zoom/pan. */
export function applyView(
  cam: Camera,
  view: ViewTransform,
  canvasW: number,
  canvasH: number,
): Camera {
  const { zoom, panX, panY } = clampPan(view, canvasW, canvasH);
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  return {
    scale: cam.scale * zoom,
    offsetX: (cam.offsetX - cx) * zoom + cx + panX,
    offsetY: (cam.offsetY - cy) * zoom + cy + panY,
  };
}

/**
 * Change zoom while holding the world point under (focalX, focalY) still —
 * what a pinch gesture and a wheel zoom both need.
 */
export function zoomAbout(
  view: ViewTransform,
  focalX: number,
  focalY: number,
  nextZoom: number,
  canvasW: number,
  canvasH: number,
): ViewTransform {
  const z0 = clampZoom(view.zoom);
  const z1 = clampZoom(nextZoom);
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  // Screen position of a point is (base - c) * z + c + pan, so the base offset
  // of whatever currently sits under the focal point is (focal - c - pan) / z.
  const baseX = (focalX - cx - view.panX) / z0;
  const baseY = (focalY - cy - view.panY) / z0;
  return clampPan(
    {
      zoom: z1,
      panX: view.panX + baseX * (z0 - z1),
      panY: view.panY + baseY * (z0 - z1),
    },
    canvasW,
    canvasH,
  );
}

/** cm point -> canvas pixel. */
export function toPx(cam: Camera, xCm: number, yCm: number): [number, number] {
  return [xCm * cam.scale + cam.offsetX, yCm * cam.scale + cam.offsetY];
}

/** canvas pixel -> cm point (inverse, for hit-testing pointer positions). */
export function toCm(cam: Camera, xPx: number, yPx: number): [number, number] {
  return [(xPx - cam.offsetX) / cam.scale, (yPx - cam.offsetY) / cam.scale];
}
