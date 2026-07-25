// Shape model. Coordinate space is centimeters (1 unit = 1 cm).

export interface ShapePoint {
  id: string;
  x: number; // cm
  y: number; // cm
}

/**
 * The space presets are normalized into when they are loaded, in cm. It is NOT
 * the size a mirror ends up: presets are re-placed to fill the safe area of the
 * wall the user marked, so the finished size and aspect ratio come from that.
 * These values only survive as the authoring scale and as the fallback used
 * before any wall has been calibrated.
 */
export const TARGET_WIDTH_CM = 68;
export const TARGET_HEIGHT_CM = 173;

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

let idCounter = 0;
export function nextPointId(): string {
  idCounter += 1;
  return `p${idCounter}`;
}
