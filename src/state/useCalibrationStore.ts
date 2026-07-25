import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";
import type { Pt } from "../model/homography";
import { debouncedLocalStorage } from "./debouncedStorage";

export type Corner = "tl" | "tr" | "br" | "bl";

interface CalibrationState {
  photoSrc: string | null;
  /** Natural pixel size of the loaded photo. */
  photoW: number;
  photoH: number;
  /** Corner positions in photo-pixel space, order TL,TR,BR,BL. */
  corners: Record<Corner, Pt>;
  /** True real-world size (cm) of the marked rectangular region. */
  realWidthCm: number;
  realHeightCm: number;
  /** Set once the user clicks Done. */
  calibrated: boolean;

  setPhoto: (src: string, w: number, h: number) => void;
  moveCorner: (corner: Corner, p: Pt) => void;
  /** Slide the whole rack, keeping its shape. Clamped to the photo. */
  moveCorners: (dx: number, dy: number) => void;
  setRealSize: (widthCm: number, heightCm: number) => void;
  setCalibrated: (v: boolean) => void;
  clearPhoto: () => void;
}

const CORNER_ORDER: Corner[] = ["tl", "tr", "br", "bl"];

function defaultCorners(w: number, h: number): Record<Corner, Pt> {
  // Inset the rack a bit from the photo edges as a starting guess.
  const ix = w * 0.3;
  const iy = h * 0.15;
  return {
    tl: { x: ix, y: iy },
    tr: { x: w - ix, y: iy },
    br: { x: w - ix, y: h - iy },
    bl: { x: ix, y: h - iy },
  };
}

export const useCalibrationStore = create<CalibrationState>()(
  persist(
  immer((set) => ({
    photoSrc: null,
    photoW: 0,
    photoH: 0,
    corners: defaultCorners(1000, 1400),
    realWidthCm: 68,
    realHeightCm: 173,
    calibrated: false,

    setPhoto: (src, w, h) =>
      set((state) => {
        state.photoSrc = src;
        state.photoW = w;
        state.photoH = h;
        state.corners = defaultCorners(w, h);
        state.calibrated = false;
      }),

    moveCorner: (corner, p) =>
      set((state) => {
        state.corners[corner] = p;
      }),

    // One action rather than four moveCorner calls: dragging the rack fires on
    // every pointermove, and four store writes per frame is four renders.
    moveCorners: (dx, dy) =>
      set((state) => {
        const pts = CORNER_ORDER.map((k) => state.corners[k]);
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        // Clamp the whole rack as one object, so it slides along the photo edge
        // instead of deforming or escaping when the pointer runs past it.
        const ddx = Math.max(-Math.min(...xs), Math.min(dx, state.photoW - Math.max(...xs)));
        const ddy = Math.max(-Math.min(...ys), Math.min(dy, state.photoH - Math.max(...ys)));
        for (const k of CORNER_ORDER) {
          state.corners[k] = { x: state.corners[k].x + ddx, y: state.corners[k].y + ddy };
        }
      }),

    setRealSize: (widthCm, heightCm) =>
      set((state) => {
        state.realWidthCm = widthCm;
        state.realHeightCm = heightCm;
      }),

    setCalibrated: (v) =>
      set((state) => {
        state.calibrated = v;
      }),

    clearPhoto: () =>
      set((state) => {
        state.photoSrc = null;
        state.calibrated = false;
      }),
  })),
  {
    name: "mirror-calibration",
    storage: debouncedLocalStorage(),
    // photoSrc must be a data URL (not a blob: URL) to survive reload — callers
    // convert the picked file to a data URL before setPhoto.
  },
  ),
);

export function cornersAsArray(c: Record<Corner, Pt>): Pt[] {
  return CORNER_ORDER.map((k) => c[k]);
}
