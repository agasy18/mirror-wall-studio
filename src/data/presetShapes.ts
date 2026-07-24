import {
  nextPointId,
  TARGET_HEIGHT_CM,
  TARGET_WIDTH_CM,
  type ShapePoint,
} from "../model/shape";
import { normalizeToTarget } from "../model/geometry";
import { generatePresets } from "./generateShapes";

export interface MirrorPreset {
  id: string;
  name: string;
  /** Raw control points (any scale); normalized to the target on load. */
  raw: Array<[number, number]>;
}

/**
 * Hand-authored "named" mirror silhouettes. Each is authored in a rough
 * coordinate space, then normalized to exactly TARGET_WIDTH_CM ×
 * TARGET_HEIGHT_CM on load so every preset starts at the real mirror size.
 */
export const NAMED_PRESETS: MirrorPreset[] = [
  {
    id: "wave",
    name: "Wave",
    raw: [
      [34, 2], [55, 12], [50, 45], [62, 80], [52, 120],
      [58, 158], [34, 171], [12, 156], [18, 118], [8, 78],
      [20, 44], [14, 12],
    ],
  },
  {
    id: "pebble",
    name: "Pebble",
    raw: [
      [34, 3], [52, 18], [58, 55], [56, 100], [50, 145],
      [34, 170], [18, 145], [12, 100], [10, 55], [16, 18],
    ],
  },
  {
    id: "peanut",
    name: "Peanut",
    raw: [
      [34, 2], [60, 14], [56, 52], [40, 78], [56, 108],
      [60, 158], [34, 172], [8, 158], [12, 108], [28, 78],
      [12, 52], [8, 14],
    ],
  },
  {
    id: "leaf",
    name: "Leaf",
    raw: [
      [34, 1], [48, 30], [56, 86], [48, 142], [34, 172],
      [20, 142], [12, 86], [20, 30],
    ],
  },
  {
    id: "pill",
    name: "Pill",
    raw: [
      [34, 2], [58, 8], [64, 30], [64, 143], [58, 165],
      [34, 171], [10, 165], [4, 143], [4, 30], [10, 8],
    ],
  },
  {
    id: "boulder",
    name: "Boulder",
    raw: [
      [30, 3], [54, 10], [63, 40], [52, 70], [64, 110],
      [55, 150], [36, 171], [14, 160], [10, 120], [20, 88],
      [7, 55], [16, 20],
    ],
  },
];

// The full gallery: 6 named shapes + 120 procedurally generated ones (126 total).
export const MIRROR_PRESETS: MirrorPreset[] = [
  ...NAMED_PRESETS,
  ...generatePresets(120),
];

export function presetToPoints(preset: MirrorPreset): ShapePoint[] {
  const pts: ShapePoint[] = preset.raw.map(([x, y]) => ({ id: nextPointId(), x, y }));
  return normalizeToTarget(pts, TARGET_WIDTH_CM, TARGET_HEIGHT_CM);
}

export function makePresetById(id: string): ShapePoint[] {
  const preset = MIRROR_PRESETS.find((p) => p.id === id) ?? MIRROR_PRESETS[0];
  return presetToPoints(preset);
}
