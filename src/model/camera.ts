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

/** cm point -> canvas pixel. */
export function toPx(cam: Camera, xCm: number, yCm: number): [number, number] {
  return [xCm * cam.scale + cam.offsetX, yCm * cam.scale + cam.offsetY];
}

/** canvas pixel -> cm point (inverse, for hit-testing pointer positions). */
export function toCm(cam: Camera, xPx: number, yPx: number): [number, number] {
  return [(xPx - cam.offsetX) / cam.scale, (yPx - cam.offsetY) / cam.scale];
}
