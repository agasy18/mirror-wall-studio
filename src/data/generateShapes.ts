import {
  nextPointId,
  TARGET_HEIGHT_CM,
  TARGET_WIDTH_CM,
  type ShapePoint,
} from "../model/shape";
import { normalizeToTarget } from "../model/geometry";
import type { MirrorPreset } from "./presetShapes";

// Deterministic seeded PRNG (mulberry32). Same seed -> same shape, so thumbnails
// and exports are stable across renders and sessions (no runtime Math.random).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate one organic mirror silhouette from a seed. Points are placed around
 * an ellipse with a seeded per-angle radius modulation (a few sine harmonics),
 * giving smooth wavy blobs. Optionally mirror the left/right sides for symmetry.
 * Returns raw [x,y] pairs (normalized to the target size at load time).
 */
function generateRaw(seed: number): Array<[number, number]> {
  const rnd = mulberry32(seed);
  const count = 8 + Math.floor(rnd() * 7); // 8..14 points
  const symmetric = rnd() < 0.55; // slight bias to symmetric shapes
  const aspect = 0.42 + rnd() * 0.16; // width:height bias
  const baseRx = 40 * aspect;
  const baseRy = 90;

  // 2-3 harmonics of waviness
  const h1 = 0.1 + rnd() * 0.28;
  const h2 = rnd() * 0.2;
  const h3 = rnd() * 0.12;
  const p1 = rnd() * Math.PI * 2;
  const p2 = rnd() * Math.PI * 2;
  const k2 = 2 + Math.floor(rnd() * 3); // harmonic order
  const k3 = 3 + Math.floor(rnd() * 4);

  const cx = 45;
  const cy = 92;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2; // start at top
    const wav = 1 + h1 * Math.sin(a + p1) + h2 * Math.sin(k2 * a + p2) + h3 * Math.sin(k3 * a);
    let rx = baseRx * wav;
    const ry = baseRy * (1 + h1 * 0.4 * Math.cos(a + p1));
    if (symmetric) {
      // mirror horizontal radius by folding the angle's x-component magnitude
      rx = baseRx * (1 + h1 * Math.abs(Math.sin(a)) + h2 * Math.sin(k2 * a + p2));
    }
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** Build `n` generated presets (deterministic), ids g0..g{n-1}. */
export function generatePresets(n: number): MirrorPreset[] {
  const out: MirrorPreset[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `g${i}`,
      name: `Shape ${i + 1}`,
      raw: generateRaw(i * 2654435761 + 12345),
    });
  }
  return out;
}

export function generatedToPoints(preset: MirrorPreset): ShapePoint[] {
  const pts: ShapePoint[] = preset.raw.map(([x, y]) => ({ id: nextPointId(), x, y }));
  return normalizeToTarget(pts, TARGET_WIDTH_CM, TARGET_HEIGHT_CM);
}
