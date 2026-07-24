import { useEffect, useMemo, useRef, useState } from "react";
import { useShapeStore } from "../state/useShapeStore";
import { useCalibrationStore, cornersAsArray } from "../state/useCalibrationStore";
import { boundingBox } from "../model/geometry";
import { isQuadValid } from "../model/homography";
import { fitCamera, toCm, type WorldRect } from "../model/camera";
import { DEFAULT_TILE_CONFIG, paperById, planTiles } from "../model/tiling";
import { warpRoom, type WarpedRoom } from "../render/warpPhoto";
import { drawHandles, drawMirror, hitHandle, shapePath } from "../render/drawShape";
import { toPx } from "../model/camera";

const MARGIN_CM = 25;

/**
 * Unified canvas editor. Wall photo, mirror shape, and control handles all live
 * in ONE cm coordinate system and are drawn through a single camera, so a
 * resize only rescales the camera and everything stays locked together.
 */
export function ShapeEditor() {
  const points = useShapeStore((s) => s.points);
  const selectedId = useShapeStore((s) => s.selectedId);
  const showMirror = useShapeStore((s) => s.toggles.showMirror);
  const showPhoto = useShapeStore((s) => s.toggles.showPhoto);
  const showGrid = useShapeStore((s) => s.toggles.showGrid);
  const showPageOverlay = useShapeStore((s) => s.toggles.showPageOverlay);
  const paperId = useShapeStore((s) => s.paperId);
  const previewMode = useShapeStore((s) => s.previewMode);
  const editCurve = useShapeStore((s) => s.editCurve);
  const setEditCurve = useShapeStore((s) => s.setEditCurve);
  const marginCm = useShapeStore((s) => s.marginCm);
  const downloadNonce = useShapeStore((s) => s.downloadNonce);
  const movePoint = useShapeStore((s) => s.movePoint);
  const addPoint = useShapeStore((s) => s.addPoint);
  const deletePoint = useShapeStore((s) => s.deletePoint);
  const moveAll = useShapeStore((s) => s.moveAll);
  const select = useShapeStore((s) => s.select);

  const photoSrc = useCalibrationStore((s) => s.photoSrc);
  const calibrated = useCalibrationStore((s) => s.calibrated);
  const realWidthCm = useCalibrationStore((s) => s.realWidthCm);
  const realHeightCm = useCalibrationStore((s) => s.realHeightCm);
  const corners = useCalibrationStore((s) => s.corners);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Canvas overlays are painted, not styled, so their colors are read out of the
  // CSS tokens — and the canvas must repaint when the OS color scheme flips.
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setThemeTick((t) => t + 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // A fingertip covers far more of the canvas than a mouse cursor does.
  const coarsePointer = useRef(window.matchMedia("(pointer: coarse)").matches);

  // Fixed cm world: wall rectangle ∪ initial shape bbox + margin. Captured once
  // so the frame never chases the shape as it's edited.
  const [world, setWorld] = useState<WorldRect>(() => {
    const bb = boundingBox(useShapeStore.getState().points);
    const wallW = useCalibrationStore.getState().realWidthCm || bb.width;
    const wallH = useCalibrationStore.getState().realHeightCm || bb.height;
    const minX = Math.min(0, bb.minX);
    const minY = Math.min(0, bb.minY);
    const maxX = Math.max(wallW, bb.maxX);
    const maxY = Math.max(wallH, bb.maxY);
    return {
      x: minX - MARGIN_CM,
      y: minY - MARGIN_CM,
      w: maxX - minX + MARGIN_CM * 2,
      h: maxY - minY + MARGIN_CM * 2,
    };
  });

  // Pre-warp the WHOLE room photo into cm space once (or when the photo /
  // calibration corners / typed size change). The wall rectangle occupies
  // (0,0)-(W,H) cm; the rest of the room extends around it and is drawn dimmed.
  const [warped, setWarped] = useState<WarpedRoom | null>(null);
  useEffect(() => {
    if (!photoSrc || !calibrated) {
      setWarped(null);
      return;
    }
    const quad = cornersAsArray(corners);
    if (!isQuadValid(quad)) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setWarped(warpRoom(img, quad, realWidthCm, realHeightCm));
    };
    img.src = photoSrc;
    return () => {
      cancelled = true;
    };
  }, [photoSrc, calibrated, corners, realWidthCm, realHeightCm]);

  // Once the room warp loads, expand the fixed world to include the room
  // context (clamped so a wildly skewed room doesn't make the wall tiny).
  useEffect(() => {
    if (!warped) return;
    const bb = boundingBox(useShapeStore.getState().points);
    const wallW = realWidthCm;
    const wallH = realHeightCm;
    // Limit room context to ~1.4x the wall around it so the mirror stays large.
    const ctxMarginX = Math.min(warped.widthCm, wallW * 0.7);
    const ctxMarginY = Math.min(warped.heightCm, wallH * 0.5);
    const minX = Math.max(warped.minXCm, Math.min(0, bb.minX) - ctxMarginX);
    const minY = Math.max(warped.minYCm, Math.min(0, bb.minY) - ctxMarginY);
    const maxX = Math.min(warped.minXCm + warped.widthCm, Math.max(wallW, bb.maxX) + ctxMarginX);
    const maxY = Math.min(warped.minYCm + warped.heightCm, Math.max(wallH, bb.maxY) + ctxMarginY);
    setWorld({
      x: minX - 6,
      y: minY - 6,
      w: maxX - minX + 12,
      h: maxY - minY + 12,
    });
    // run once per warp load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warped]);

  // Track container size for a resize-proof canvas.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const cam = useMemo(() => fitCamera(world, size.w, size.h), [world, size]);

  // Dev-only: expose the live camera for headless interaction testing.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__editorCam = cam;
    }
  }, [cam]);

  // ---- draw ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.w * dpr));
    canvas.height = Math.max(1, Math.round(size.h * dpr));
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const css = getComputedStyle(document.documentElement);
    const cssVar = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;

    // Room photo backdrop. The whole room is drawn, then everything OUTSIDE the
    // calibrated wall rectangle (0,0)-(W,H) is dimmed ("unreachable"), so the
    // design area reads clearly while you still see surrounding context.
    if (showPhoto && warped) {
      const [rx, ry] = toPx(cam, warped.minXCm, warped.minYCm);
      const rw = warped.widthCm * cam.scale;
      const rh = warped.heightCm * cam.scale;
      ctx.save();
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = previewMode ? 1 : 0.92; // room stays clearly visible for context
      ctx.drawImage(warped.canvas, rx, ry, rw, rh);
      ctx.restore();

      // wall rectangle in px
      const [wx, wy] = toPx(cam, 0, 0);
      const ww = realWidthCm * cam.scale;
      const wh = realHeightCm * cam.scale;

      // In preview mode we show only photo + mirror — no scrim, no frame.
      if (!previewMode) {
        // light scrim over the room (outside the wall rect)
        ctx.save();
        ctx.fillStyle = cssVar("--canvas-scrim", "rgba(6,8,12,0.28)");
        ctx.beginPath();
        ctx.rect(0, 0, size.w, size.h);
        ctx.rect(wx, wy, ww, wh);
        ctx.fill("evenodd");
        ctx.restore();

        // subtle frame around the reachable wall rectangle
        ctx.save();
        ctx.strokeStyle = cssVar("--canvas-frame", "rgba(124,201,255,0.5)");
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.strokeRect(wx, wy, ww, wh);
        ctx.restore();

        // safe-margin guide: inset the wall rect by marginCm on each side
        if (marginCm > 0) {
          const mpx = marginCm * cam.scale;
          ctx.save();
          ctx.strokeStyle = cssVar("--canvas-margin", "rgba(255,207,102,0.5)");
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.strokeRect(wx + mpx, wy + mpx, ww - mpx * 2, wh - mpx * 2);
          ctx.restore();
        }
      }
    }

    // cm grid (10cm). The grid measures real centimeters, which only apply to
    // the calibrated wall rectangle — so clip it to (0,0)-(wallW,wallH). With no
    // photo we fall back to the whole world so free-drawing still has a grid.
    if (showGrid && !previewMode) {
      const hasWall = !!warped;
      const gx0 = hasWall ? 0 : world.x;
      const gy0 = hasWall ? 0 : world.y;
      const gx1 = hasWall ? realWidthCm : world.x + world.w;
      const gy1 = hasWall ? realHeightCm : world.y + world.h;
      ctx.save();
      ctx.strokeStyle = cssVar("--canvas-grid", "rgba(255,255,255,0.08)");
      ctx.lineWidth = 1;
      const step = 10;
      const startX = Math.ceil(gx0 / step) * step;
      const startY = Math.ceil(gy0 / step) * step;
      for (let x = startX; x <= gx1; x += step) {
        const [sx, sy0] = toPx(cam, x, gy0);
        const [, sy1] = toPx(cam, x, gy1);
        ctx.beginPath();
        ctx.moveTo(sx, sy0);
        ctx.lineTo(sx, sy1);
        ctx.stroke();
      }
      for (let y = startY; y <= gy1; y += step) {
        const [sx0, sy] = toPx(cam, gx0, y);
        const [sx1] = toPx(cam, gx1, y);
        ctx.beginPath();
        ctx.moveTo(sx0, sy);
        ctx.lineTo(sx1, sy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // mirror shape
    const bb = boundingBox(points);
    const [bx, by] = toPx(cam, bb.minX, bb.minY);
    const path = shapePath(cam, points);
    drawMirror(ctx, path, {
      showMirror,
      bboxPx: { x: bx, y: by, w: bb.width * cam.scale, h: bb.height * cam.scale },
      pxPerCm: cam.scale,
      outlineColor: cssVar("--canvas-outline", "#e6e9ef"),
    });

    // A4/paper page overlay: how the mirror tiles across sheets at the chosen size
    if (showPageOverlay && !previewMode && bb.width > 0 && bb.height > 0) {
      const cfg = { ...DEFAULT_TILE_CONFIG, paper: paperById(paperId) };
      const plan = planTiles(bb.width * 10, bb.height * 10, cfg);
      const stepXcm = plan.stepXmm / 10;
      const stepYcm = plan.stepYmm / 10;
      const printWcm = plan.printableWmm / 10;
      const printHcm = plan.printableHmm / 10;
      ctx.save();
      ctx.strokeStyle = cssVar("--canvas-page", "rgba(124,201,255,0.7)");
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.font = "10px sans-serif";
      ctx.fillStyle = cssVar("--canvas-page-label", "rgba(124,201,255,0.9)");
      for (const t of plan.tiles) {
        const [tx, ty] = toPx(cam, bb.minX + t.col * stepXcm, bb.minY + t.row * stepYcm);
        ctx.strokeRect(tx, ty, printWcm * cam.scale, printHcm * cam.scale);
        ctx.fillText(t.label, tx + 4, ty + 12);
      }
      ctx.restore();
    }

    // handles — only while editing the curve (and never in preview)
    if (editCurve && !previewMode) {
      drawHandles(ctx, cam, points, selectedId, coarsePointer.current ? 11 : 8);
    }
  }, [cam, size, points, selectedId, showMirror, showPhoto, showGrid, showPageOverlay, paperId, marginCm, warped, world, previewMode, editCurve, themeTick]);

  // Download the current canvas as a PNG when a download is requested.
  useEffect(() => {
    if (downloadNonce === 0) return; // initial value, no download
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mirror-on-wall.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [downloadNonce]);

  // ---- interaction ----
  const drag = useRef<
    | { kind: "point"; id: string }
    | { kind: "move"; lastCmX: number; lastCmY: number }
    | null
  >(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const pointerCm = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return toCm(cam, e.clientX - rect.left, e.clientY - rect.top);
  };
  const pointerPx = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const [px, py] = pointerPx(e);
    canvasRef.current!.setPointerCapture(e.pointerId);

    // Touch has no dblclick worth relying on (iOS Safari synthesizes it
    // inconsistently, and the stray second pointerdown can exit edit mode), so
    // detect the double-tap ourselves.
    if (e.pointerType === "touch" && editCurve) {
      const now = performance.now();
      const lt = lastTap.current;
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 24) {
        const [cx, cy] = pointerCm(e);
        addPoint(nearestPointId(points, cx, cy), round(cx), round(cy));
        lastTap.current = null;
        return;
      }
    }

    // While editing, grabbing a handle drags that point.
    if (editCurve) {
      const hit = hitHandle(cam, points, px, py, e.pointerType === "touch" ? 24 : 12);
      if (hit) {
        drag.current = { kind: "point", id: hit };
        select(hit);
        return;
      }
    }

    // Is the press inside the mirror? (path is in CSS px → identity transform)
    const path = shapePath(cam, points);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const inside = ctx.isPointInPath(path, px, py);
    ctx.restore();

    if (inside) {
      // Clicking the mirror enters curve-edit mode automatically and lets you
      // drag the whole shape.
      if (!editCurve) setEditCurve(true);
      const [cx, cy] = pointerCm(e);
      drag.current = { kind: "move", lastCmX: cx, lastCmY: cy };
      select(null);
      return;
    }

    // Clicking outside the mirror exits edit mode and hides the handles.
    if (editCurve) setEditCurve(false);
    select(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const [cx, cy] = pointerCm(e);
    if (drag.current.kind === "point") {
      movePoint(drag.current.id, round(cx), round(cy));
    } else {
      moveAll(round(cx - drag.current.lastCmX), round(cy - drag.current.lastCmY));
      drag.current.lastCmX = cx;
      drag.current.lastCmY = cy;
    }
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!editCurve) return; // adding points only while editing the curve
    const [cx, cy] = pointerCm(e);
    const afterId = nearestPointId(points, cx, cy);
    addPoint(afterId, round(cx), round(cy));
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Without this guard, Backspace while editing a number field (the gear
      // popover's margin input) deletes a control point instead of a digit.
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((ev.key === "Delete" || ev.key === "Backspace") && selectedId) {
        ev.preventDefault();
        deletePoint(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deletePoint]);

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`editor-canvas${previewMode ? " is-preview" : ""}`}
        style={{ width: size.w, height: size.h, touchAction: "none" }}
        aria-label="Mirror shape editor: drag the outline or its control points"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      {editCurve && !previewMode && selectedId && (
        <button
          className="point-delete"
          onClick={() => deletePoint(selectedId)}
          aria-label="Delete the selected control point"
        >
          <span aria-hidden="true">🗑</span> Delete point
        </button>
      )}
    </div>
  );
}

function nearestPointId(points: { id: string; x: number; y: number }[], x: number, y: number) {
  let best = points[0]?.id ?? "";
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}
