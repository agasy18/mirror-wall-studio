import { useEffect, useMemo, useRef, useState } from "react";
import {
  cornersAsArray,
  useCalibrationStore,
  type Corner,
} from "../state/useCalibrationStore";
import { isQuadValid } from "../model/homography";
import { fitCamera, toCm, toPx, type WorldRect } from "../model/camera";

interface Props {
  onDone: () => void;
}

const CORNER_ORDER: Corner[] = ["tl", "tr", "br", "bl"];

/**
 * Canvas calibration. The photo and the draggable 4-corner "rack" live in ONE
 * coordinate system (photo pixels), drawn through a single camera. A resize
 * only rescales the camera, so the photo and the handles never desync.
 */
export function PhotoCalibration({ onDone }: Props) {
  const photoSrc = useCalibrationStore((s) => s.photoSrc);
  const photoW = useCalibrationStore((s) => s.photoW);
  const photoH = useCalibrationStore((s) => s.photoH);
  const corners = useCalibrationStore((s) => s.corners);
  const realWidthCm = useCalibrationStore((s) => s.realWidthCm);
  const realHeightCm = useCalibrationStore((s) => s.realHeightCm);
  const setPhoto = useCalibrationStore((s) => s.setPhoto);
  const setCalibrated = useCalibrationStore((s) => s.setCalibrated);
  const moveCorner = useCalibrationStore((s) => s.moveCorner);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [imgReady, setImgReady] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  const openFilePicker = () => fileInputRef.current?.click();

  const onFile = (file: File) => {
    // Read as a data URL so the photo persists in localStorage across reloads
    // (blob: object URLs are not valid after a page reload).
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => setPhoto(dataUrl, img.naturalWidth, img.naturalHeight);
      img.onerror = () =>
        alert("Could not read that image. Please choose a different photo.");
      img.src = dataUrl;
    };
    reader.onerror = () =>
      alert("Could not read that file. Please choose a different photo.");
    reader.readAsDataURL(file);
  };

  // Load the photo element for drawing.
  useEffect(() => {
    if (!photoSrc) {
      imgRef.current = null;
      setImgReady(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgReady(true);
    };
    img.src = photoSrc;
  }, [photoSrc]);

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [photoSrc]);

  const world: WorldRect = useMemo(
    () => ({ x: 0, y: 0, w: photoW || 1, h: photoH || 1 }),
    [photoW, photoH],
  );
  const cam = useMemo(() => fitCamera(world, size.w, size.h), [world, size]);

  // Draw photo + rack.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgReady || !imgRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.w * dpr));
    canvas.height = Math.max(1, Math.round(size.h * dpr));
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // photo
    const [ox, oy] = toPx(cam, 0, 0);
    ctx.drawImage(imgRef.current, ox, oy, photoW * cam.scale, photoH * cam.scale);

    // rack polygon
    const pts = CORNER_ORDER.map((k) => toPx(cam, corners[k].x, corners[k].y));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = "rgba(124,201,255,0.10)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(124,201,255,0.85)";
    ctx.stroke();
    ctx.restore();

    // corner handles — translucent so the wall photo stays visible through them
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 11, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(124,201,255,0.55)";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
    }
  }, [cam, size, corners, imgReady, photoW, photoH]);

  // Drag corners.
  const dragging = useRef<Corner | null>(null);
  const pointerPx = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as const;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const [px, py] = pointerPx(e);
    let best: Corner | null = null;
    let bestD = 20 * 20;
    for (const k of CORNER_ORDER) {
      const [hx, hy] = toPx(cam, corners[k].x, corners[k].y);
      const d = (hx - px) ** 2 + (hy - py) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best) {
      dragging.current = best;
      canvasRef.current!.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const [px, py] = pointerPx(e);
    const [cx, cy] = toCm(cam, px, py);
    moveCorner(dragging.current, {
      x: Math.max(0, Math.min(photoW, cx)),
      y: Math.max(0, Math.min(photoH, cy)),
    });
  };
  const onPointerUp = () => {
    dragging.current = null;
  };

  const quadValid = isQuadValid(cornersAsArray(corners));
  const sizeValid = realWidthCm > 0 && realHeightCm > 0;
  const canDone = !!photoSrc && quadValid && sizeValid;

  const handleDone = () => {
    setCalibrated(true);
    onDone();
  };

  if (!photoSrc) {
    return (
      <div className="stage">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
        <div className="dropzone" role="button" tabIndex={0} onClick={openFilePicker}>
          <div className="drop-icon">🖼️</div>
          <h3>Load your wall photo</h3>
          <div>Choose a photo of the wall where the mirror will go.</div>
          <div style={{ marginTop: 20 }}>
            <button
              className="primary"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
            >
              Choose photo…
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="stage" ref={wrapRef}>
        {!hintDismissed && (
          <div className="calib-hint-banner">
            <button
              className="hint-close"
              aria-label="Dismiss hint"
              onClick={() => setHintDismissed(true)}
            >
              ✕
            </button>
            Place the rectangle inside the area you want to mirror.
            <div className="sub">
              Drag the 4 corners onto a real rectangle on the wall and type its
              true size. On <b>Done</b>, the photo is straightened so you design
              on a head-on wall.
            </div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="editor-canvas"
          style={{ width: size.w, height: size.h, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>

      <div className="sidepanel sidepanel--docked">
        <div className="panel-section">
          <h2>Calibrate wall</h2>
          <div className="hint">
            Type the real-world size of the rectangle you drew. This grounds the
            whole design in centimeters.
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <label>Rectangle width</label>
            <SizeField which="w" />
          </div>
          <div className="row">
            <label>Rectangle height</label>
            <SizeField which="h" />
          </div>
        </div>

        <div className="panel-section">
          <button className="primary" style={{ width: "100%" }} disabled={!canDone} onClick={handleDone}>
            Done — straighten &amp; design →
          </button>
          {!quadValid && (
            <div className="hint" style={{ marginTop: 10, borderLeftColor: "var(--danger)" }}>
              Fix the corners — the rectangle must be a proper (convex) shape.
            </div>
          )}
        </div>

        <div className="panel-section">
          <button className="ghost" style={{ width: "100%" }} onClick={() => useCalibrationStore.getState().clearPhoto()}>
            Choose a different photo
          </button>
        </div>
      </div>
    </>
  );
}

function SizeField({ which }: { which: "w" | "h" }) {
  const realWidthCm = useCalibrationStore((s) => s.realWidthCm);
  const realHeightCm = useCalibrationStore((s) => s.realHeightCm);
  const setRealSize = useCalibrationStore((s) => s.setRealSize);
  const value = which === "w" ? realWidthCm : realHeightCm;
  return (
    <input
      type="number"
      min={1}
      value={value}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (which === "w") setRealSize(v, realHeightCm);
        else setRealSize(realWidthCm, v);
      }}
    />
  );
}
