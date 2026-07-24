// Shape model. Coordinate space is centimeters (1 unit = 1 cm).

export interface ShapePoint {
  id: string;
  x: number; // cm
  y: number; // cm
}

// Physical target size of the mirror, in cm.
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
