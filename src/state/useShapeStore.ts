import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";
import { nextPointId, type ShapePoint } from "../model/shape";
import { MIRROR_PRESETS, makePresetById } from "../data/presetShapes";
import { boundingBox } from "../model/geometry";
import { useCalibrationStore } from "./useCalibrationStore";

/**
 * Fit the shape inside the calibrated wall's SAFE AREA — the wall rectangle
 * (0..realW, 0..realH) inset by `marginCm` on every side — preserving aspect
 * ratio and centering. A freshly picked shape lands perfectly within the
 * margins, so new mirrors always fit without manual repositioning.
 */
function fitToWall(points: ShapePoint[], marginCm: number): ShapePoint[] {
  const bb = boundingBox(points);
  if (bb.width <= 0 || bb.height <= 0) return points;
  const cal = useCalibrationStore.getState();
  const wallW = cal.realWidthCm || bb.width;
  const wallH = cal.realHeightCm || bb.height;
  const safeW = Math.max(1, wallW - marginCm * 2);
  const safeH = Math.max(1, wallH - marginCm * 2);
  const scale = Math.min(safeW / bb.width, safeH / bb.height);
  const newW = bb.width * scale;
  const newH = bb.height * scale;
  const originX = (wallW - newW) / 2;
  const originY = (wallH - newH) / 2;
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
}

const MIN_POINTS = 3;
const DEFAULT_PRESET = MIRROR_PRESETS[0].id;

export const useShapeStore = create<ShapeState>()(
  persist(
  immer((set) => ({
    points: makePresetById(DEFAULT_PRESET),
    selectedId: null,
    presetId: DEFAULT_PRESET,
    paperId: "a4",
    marginCm: 2,
    previewMode: false,
    editCurve: false,
    downloadNonce: 0,
    toggles: {
      showGrid: true,
      showMirror: true,
      showPageOverlay: false,
      showPhoto: true,
    },

    movePoint: (id, x, y) =>
      set((state) => {
        const p = state.points.find((pt) => pt.id === id);
        if (!p) return;
        p.x = x;
        p.y = y;
      }),

    addPoint: (afterId, x, y) =>
      set((state) => {
        const idx = state.points.findIndex((pt) => pt.id === afterId);
        const newPoint: ShapePoint = { id: nextPointId(), x, y };
        if (idx === -1) state.points.push(newPoint);
        else state.points.splice(idx + 1, 0, newPoint);
        state.selectedId = newPoint.id;
      }),

    deletePoint: (id) =>
      set((state) => {
        if (state.points.length <= MIN_POINTS) return;
        state.points = state.points.filter((pt) => pt.id !== id);
        if (state.selectedId === id) state.selectedId = null;
      }),

    moveAll: (dxCm, dyCm) =>
      set((state) => {
        for (const p of state.points) {
          p.x += dxCm;
          p.y += dyCm;
        }
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
        // refit the current shape into the new safe area
        state.points = fitToWall(state.points, state.marginCm);
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
        state.points = fitToWall(makePresetById(id), state.marginCm);
        state.presetId = id;
        state.selectedId = null;
      }),

    resetPreset: () =>
      set((state) => {
        state.points = fitToWall(makePresetById(state.presetId), state.marginCm);
        state.selectedId = null;
      }),
  })),
  {
    name: "mirror-shape",
    // Persist only the durable design state; keep transient UI out of storage.
    partialize: (s) => ({
      points: s.points,
      presetId: s.presetId,
      paperId: s.paperId,
      marginCm: s.marginCm,
      toggles: s.toggles,
    }),
  },
  ),
);
