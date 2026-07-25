import { APP_NAME } from "../model/brand";

const FONT_STACK = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** Vertical positions to try, as a fraction of the mirror's height. */
const CANDIDATE_BANDS = [0.9, 0.86, 0.82, 0.78, 0.72, 0.66, 0.6, 0.54, 0.5];

/**
 * Stamp the app name on the mirror in the exported image.
 *
 * Placement is hit-tested against the outline instead of assumed: mirror
 * silhouettes taper, and a fixed "90% of the bounding box" put the name in mid
 * air on anything leaf- or peanut-shaped. Each candidate band is accepted only
 * once both ends of the text and its cap height are inside the curve, so the
 * name always sits on glass. If nothing fits — a very small or very thin
 * mirror — nothing is drawn, which is better than an illegible smudge.
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  box: { x: number; y: number; w: number; h: number },
): boolean {
  if (box.w <= 0 || box.h <= 0) return false;

  ctx.save();
  try {
    let size = Math.max(9, Math.min(30, Math.min(box.w * 0.09, box.h * 0.05)));
    ctx.font = `600 ${size}px ${FONT_STACK}`;
    let width = ctx.measureText(APP_NAME).width;

    // Never let the name span more than ~70% of the mirror.
    const maxWidth = box.w * 0.7;
    if (width > maxWidth) {
      size *= maxWidth / width;
      ctx.font = `600 ${size}px ${FONT_STACK}`;
      width = ctx.measureText(APP_NAME).width;
    }
    if (size < 8) return false; // too small to read — leave the image clean

    const cx = box.x + box.w / 2;
    const halfW = width / 2;
    const halfH = size * 0.38;

    // isPointInPath compares against the path under the CURRENT transform, and
    // the path was built in CSS pixels — so hit-test under identity, exactly as
    // the editor's own "did the press land on the mirror?" check does.
    const inside = (px: number, py: number) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const hit = ctx.isPointInPath(path, px, py);
      ctx.restore();
      return hit;
    };

    let cy: number | null = null;
    for (const band of CANDIDATE_BANDS) {
      const y = box.y + box.h * band;
      if (
        inside(cx - halfW, y) &&
        inside(cx + halfW, y) &&
        inside(cx, y - halfH) &&
        inside(cx, y + halfH)
      ) {
        cy = y;
        break;
      }
    }
    if (cy === null) return false;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Etched, not stamped: kept barely visible on purpose, so it credits the app
    // without competing with the mirror it sits on. The faint light offset is
    // what keeps it readable at this opacity instead of dissolving entirely.
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillText(APP_NAME, cx, cy + Math.max(1, size * 0.07));
    ctx.fillStyle = "rgba(18,24,34,0.17)";
    ctx.fillText(APP_NAME, cx, cy);
    return true;
  } finally {
    ctx.restore();
  }
}
