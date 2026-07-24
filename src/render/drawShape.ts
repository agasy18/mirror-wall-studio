// Canvas drawing of the mirror shape (silver glass + warm edge glow) and the
// control handles, all in cm via the shared camera. Mirrors the look of the
// old SVG MirrorDefs but on a 2D context.

import type { Camera } from "../model/camera";
import { toPx } from "../model/camera";
import type { ShapePoint } from "../model/shape";

/** Build a Path2D of the smooth closed Catmull-Rom spline in CANVAS px. */
export function shapePath(cam: Camera, points: ShapePoint[]): Path2D {
  const p = new Path2D();
  const n = points.length;
  if (n === 0) return p;
  const px = points.map((pt) => toPx(cam, pt.x, pt.y));
  if (n < 3) {
    p.moveTo(px[0][0], px[0][1]);
    for (let i = 1; i < n; i++) p.lineTo(px[i][0], px[i][1]);
    p.closePath();
    return p;
  }
  const k = 1 / 6;
  p.moveTo(px[0][0], px[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = px[(i - 1 + n) % n];
    const p1 = px[i];
    const p2 = px[(i + 1) % n];
    const p3 = px[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) * k;
    const c1y = p1[1] + (p2[1] - p0[1]) * k;
    const c2x = p2[0] - (p3[0] - p1[0]) * k;
    const c2y = p2[1] - (p3[1] - p1[1]) * k;
    p.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  p.closePath();
  return p;
}

export interface DrawOpts {
  showMirror: boolean;
  bboxPx: { x: number; y: number; w: number; h: number };
  /** cm -> px scale, so the LED glow can be a fixed physical size. */
  pxPerCm: number;
  /** Outline-only stroke. Theme-dependent, so the caller supplies it. */
  outlineColor?: string;
}

/** Physical width of the warm backlit LED glow around the mirror edge, in cm. */
const GLOW_CM = 0.5;

/** Fill the shape as silver glass with a warm edge glow (or outline only). */
export function drawMirror(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  opts: DrawOpts,
) {
  if (!opts.showMirror) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.outlineColor ?? "#e6e9ef";
    ctx.stroke(path);
    ctx.restore();
    return;
  }

  const { x, y, w, h } = opts.bboxPx;

  // warm LED edge glow — a fixed physical ~0.5 cm halo (scales with zoom, not
  // with the shape's size), matching a real thin backlit strip.
  ctx.save();
  const glowPx = Math.max(2, GLOW_CM * opts.pxPerCm);
  ctx.shadowColor = "rgba(255,207,102,0.95)";
  ctx.shadowBlur = glowPx;
  ctx.fillStyle = "rgba(255,207,102,0.95)";
  ctx.fill(path);
  // second pass deepens the halo without widening it much
  ctx.shadowBlur = glowPx * 1.6;
  ctx.fill(path);
  ctx.restore();

  // silver glass body (diagonal banded gradient)
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x + w * 0.85, y + h);
  g.addColorStop(0.0, "#8a97a6");
  g.addColorStop(0.18, "#c3ccd6");
  g.addColorStop(0.34, "#7f8c9c");
  g.addColorStop(0.48, "#eef3f8");
  g.addColorStop(0.55, "#f7fbff");
  g.addColorStop(0.66, "#9aa6b4");
  g.addColorStop(0.8, "#c8d1db");
  g.addColorStop(1.0, "#6c7887");
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#5c6673";
  ctx.stroke(path);
  ctx.restore();

  // diagonal reflection streak
  ctx.save();
  ctx.clip(path);
  const s = ctx.createLinearGradient(x, y, x + w, y + h);
  s.addColorStop(0.49, "rgba(255,255,255,0)");
  s.addColorStop(0.51, "rgba(255,255,255,0.55)");
  s.addColorStop(0.53, "rgba(255,255,255,0)");
  ctx.fillStyle = s;
  ctx.fillRect(x - w, y - h, w * 3, h * 3);
  ctx.restore();
}

/** Draw draggable control-point handles in cm via the camera. */
export function drawHandles(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  points: ShapePoint[],
  selectedId: string | null,
  radiusPx = 8,
) {
  for (const pt of points) {
    const [cx, cy] = toPx(cam, pt.x, pt.y);
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = pt.id === selectedId ? "#ffcf66" : "#7cc9ff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
}

/** Hit-test: return the id of the handle under a canvas-px point, if any. */
export function hitHandle(
  cam: Camera,
  points: ShapePoint[],
  xPx: number,
  yPx: number,
  radiusPx = 12,
): string | null {
  let best: string | null = null;
  let bestD = radiusPx * radiusPx;
  for (const pt of points) {
    const [cx, cy] = toPx(cam, pt.x, pt.y);
    const d = (cx - xPx) ** 2 + (cy - yPx) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = pt.id;
    }
  }
  return best;
}
