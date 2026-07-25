import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";
import {
  nextPointId,
  TARGET_HEIGHT_CM,
  TARGET_WIDTH_CM,
  type ShapePoint,
} from "../model/shape";
import { MIRROR_PRESETS, makePresetById } from "../data/presetShapes";
import { curveBounds } from "../model/geometry";
import { debouncedLocalStorage } from "./debouncedStorage";
import { useCalibrationStore } from "./useCalibrationStore";

export interface SafeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The SAFE AREA: the calibrated wall rectangle (0..realW, 0..realH) inset by
 * `marginCm` on every side. This is the region the user marked during
 * calibration ("the area you want to mirror"), so it — not a fixed 68x173 —
 * defines both the size and the aspect ratio a mirror should have.
 */
export function wallSafeBox(marginCm: number): SafeBox {
  const cal = useCalibrationStore.getState();
  const wallW = cal.realWidthCm > 0 ? cal.realWidthCm : TARGET_WIDTH_CM;
  const wallH = cal.realHeightCm > 0 ? cal.realHeightCm : TARGET_HEIGHT_CM;
  // max(1,…) keeps a comically large margin from inverting the box.
  const w = Math.max(1, wallW - marginCm * 2);
  const h = Math.max(1, wallH - marginCm * 2);
  return { x: (wallW - w) / 2, y: (wallH - h) / 2, w, h };
}

/**
 * Place a PRESET so it exactly fills the safe area. Presets are authored in an
 * arbitrary space and normalized on load, so they carry no aspect ratio worth
 * preserving — stretching one to the marked area's proportions is what makes a
 * tall alcove give tall mirrors and a wide one give wide mirrors.
 *
 * Measured with curveBounds, not the control points: the drawn spline
 * overshoots its handles, and it is the drawn edge that has to land on the
 * margin. Catmull-Rom is affine-invariant, so scaling the handles scales the
 * curve identically.
 */
function placeInWall(points: ShapePoint[], marginCm: number): ShapePoint[] {
  const bb = curveBounds(points);
  if (bb.width <= 0 || bb.height <= 0) return points;
  const box = wallSafeBox(marginCm);
  const sx = box.w / bb.width;
  const sy = box.h / bb.height;
  return points.map((p) => ({
    ...p,
    x: box.x + (p.x - bb.minX) * sx,
    y: box.y + (p.y - bb.minY) * sy,
  }));
}

/**
 * Re-fit an EXISTING shape into the safe area, uniformly and centered. Unlike
 * placeInWall this preserves the shape's proportions, because by the time it
 * runs the outline may be one the user drew by hand.
 */
function fitToWall(points: ShapePoint[], marginCm: number): ShapePoint[] {
  const bb = curveBounds(points);
  if (bb.width <= 0 || bb.height <= 0) return points;
  const box = wallSafeBox(marginCm);
  const scale = Math.min(box.w / bb.width, box.h / bb.height);
  const originX = box.x + (box.w - bb.width * scale) / 2;
  const originY = box.y + (box.h - bb.height * scale) / 2;
  return points.map((p) => ({
    ...p,
    x: originX + (p.x - bb.minX) * scale,
    y: originY + (p.y - bb.minY) * scale,
  }));
}

export interface ViewToggles {
  showGrid: boolean;
  showMirror: boolean;
  showPageOverlay: boolean;
  showPhoto: boolean;
  /**
   * Credit the app on the things that leave it: the app name on the downloaded
   * image, a QR to the app on the printed template. One switch for both, since
   * from the user's side it is one decision.
   */
  showWatermark: boolean;
}

interface ShapeState {
  points: ShapePoint[];
  selectedId: string | null;
  presetId: string;
  paperId: string;
  marginCm: number;
  toggles: ViewToggles;
  previewMode: boolean;
  editCurve: boolean;
  downloadNonce: number;
  /**
   * True once the outline has been changed by hand. A shape that is still a
   * plain preset may be re-placed when the wall changes; one the user has
   * shaped is theirs, and re-measuring the wall must never rescale it.
   */
  shapeEdited: boolean;

  movePoint: (id: string, x: number, y: number) => void;
  addPoint: (afterId: string, x: number, y: number) => void;
  deletePoint: (id: string) => void;
  moveAll: (dxCm: number, dyCm: number) => void;
  scaleAll: (factor: number) => void;
  select: (id: string | null) => void;
  setToggle: (key: keyof ViewToggles, value: boolean) => void;
  setPaper: (id: string) => void;
  setMargin: (cm: number) => void;
  setPreviewMode: (v: boolean) => void;
  setEditCurve: (v: boolean) => void;
  requestDownload: () => void;
  loadPreset: (id: string) => void;
  resetPreset: () => void;
  adaptToWall: () => void;
}

const MIN_POINTS = 3;
const DEFAULT_PRESET = MIRROR_PRESETS[0].id;
const DEFAULT_MARGIN_CM = 2;

export const useShapeStore = create<ShapeState>()(
  persist(
  immer((set) => ({
    points: placeInWall(makePresetById(DEFAULT_PRESET), DEFAULT_MARGIN_CM),
    selectedId: null,
    presetId: DEFAULT_PRESET,
    paperId: "a4",
    marginCm: DEFAULT_MARGIN_CM,
    previewMode: false,
    editCurve: false,
    downloadNonce: 0,
    shapeEdited: false,
    toggles: {
      showGrid: true,
      showMirror: true,
      showPageOverlay: false,
      showPhoto: true,
      showWatermark: true,
    },

    movePoint: (id, x, y) =>
      set((state) => {
        const p = state.points.find((pt) => pt.id === id);
        if (!p) return;
        p.x = x;
        p.y = y;
        state.shapeEdited = true;
      }),

    addPoint: (afterId, x, y) =>
      set((state) => {
        const idx = state.points.findIndex((pt) => pt.id === afterId);
        const newPoint: ShapePoint = { id: nextPointId(), x, y };
        if (idx === -1) state.points.push(newPoint);
        else state.points.splice(idx + 1, 0, newPoint);
        state.selectedId = newPoint.id;
        state.shapeEdited = true;
      }),

    deletePoint: (id) =>
      set((state) => {
        if (state.points.length <= MIN_POINTS) return;
        state.points = state.points.filter((pt) => pt.id !== id);
        if (state.selectedId === id) state.selectedId = null;
        state.shapeEdited = true;
      }),

    moveAll: (dxCm, dyCm) =>
      set((state) => {
        for (const p of state.points) {
          p.x += dxCm;
          p.y += dyCm;
        }
        state.shapeEdited = true;
      }),

    scaleAll: (factor) =>
      set((state) => {
        if (factor <= 0) return;
        // Scale about the shape's bounding-box center so it grows in place.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of state.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        for (const p of state.points) {
          p.x = cx + (p.x - cx) * factor;
          p.y = cy + (p.y - cy) * factor;
        }
        state.shapeEdited = true;
      }),

    select: (id) =>
      set((state) => {
        state.selectedId = id;
      }),

    setToggle: (key, value) =>
      set((state) => {
        state.toggles[key] = value;
      }),

    setPaper: (id) =>
      set((state) => {
        state.paperId = id;
      }),

    setMargin: (cm) =>
      set((state) => {
        state.marginCm = Math.max(0, cm);
        // A pristine preset is re-placed so it still fills the new safe area
        // exactly; a hand-edited outline is only scaled to stay inside it.
        state.points = state.shapeEdited
          ? fitToWall(state.points, state.marginCm)
          : placeInWall(makePresetById(state.presetId), state.marginCm);
      }),

    setPreviewMode: (v) =>
      set((state) => {
        state.previewMode = v;
      }),

    setEditCurve: (v) =>
      set((state) => {
        state.editCurve = v;
        if (!v) state.selectedId = null;
      }),

    requestDownload: () =>
      set((state) => {
        state.downloadNonce += 1;
      }),

    loadPreset: (id) =>
      set((state) => {
        state.points = placeInWall(makePresetById(id), state.marginCm);
        state.presetId = id;
        state.selectedId = null;
        state.shapeEdited = false;
      }),

    resetPreset: () =>
      set((state) => {
        state.points = placeInWall(makePresetById(state.presetId), state.marginCm);
        state.selectedId = null;
        state.shapeEdited = false;
      }),

    // The wall was (re)measured. An untouched preset is re-placed into the new
    // safe area; a hand-edited outline is left exactly as the user left it.
    adaptToWall: () =>
      set((state) => {
        if (state.shapeEdited) return;
        state.points = placeInWall(makePresetById(state.presetId), state.marginCm);
        state.selectedId = null;
      }),
  })),
  {
    name: "mirror-shape",
    storage: debouncedLocalStorage(),
    // Persist only the durable design state; keep transient UI out of storage.
    partialize: (s) => ({
      points: s.points,
      presetId: s.presetId,
      paperId: s.paperId,
      marginCm: s.marginCm,
      toggles: s.toggles,
      shapeEdited: s.shapeEdited,
    }),
    // The default shallow merge swaps `toggles` out wholesale, so every toggle
    // added after a user's last visit would arrive undefined — reading as off,
    // no matter what its default says. Merge the object, not just the state.
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<ShapeState>;
      return { ...current, ...p, toggles: { ...current.toggles, ...(p.toggles ?? {}) } };
    },
  },
  ),
);

/**
 * Keep the mirror tied to the wall the user actually marked.
 *
 * The fit used to live only inside loadPreset/resetPreset/setMargin, so
 * finishing calibration left the default 68x173 preset untouched: on the first
 * open the mirror ignored the marked area entirely, then snapped to it the
 * moment any preset was picked. Reacting to the wall itself — in one place —
 * is what removes that whole class of stale-fit bug.
 *
 * A half-typed size (an empty number field reads as 0) is ignored so the shape
 * is not thrashed between keystrokes.
 */
useCalibrationStore.subscribe((s, prev) => {
  if (!s.calibrated || s.realWidthCm <= 0 || s.realHeightCm <= 0) return;
  const unchanged =
    s.calibrated === prev.calibrated &&
    s.realWidthCm === prev.realWidthCm &&
    s.realHeightCm === prev.realHeightCm;
  if (unchanged) return;
  useShapeStore.getState().adaptToWall();
});
