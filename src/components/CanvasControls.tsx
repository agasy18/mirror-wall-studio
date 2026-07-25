import { useEffect, useRef, useState } from "react";
import { useShapeStore } from "../state/useShapeStore";
import { curveBounds } from "../model/geometry";
import { RepeatButton, ToggleRow } from "./controls";

/**
 * Canvas overlays for the editor:
 *  • size chip   — top-left (always shows the real mirror size)
 *  • settings ⚙  — top-right (view toggles + margin), a dismissible popover
 *  • control pill — bottom-right (compact scale + gamepad move)
 * The right panel stays catalog-only.
 */
export function CanvasControls() {
  const points = useShapeStore((s) => s.points);
  const scaleAll = useShapeStore((s) => s.scaleAll);
  const moveAll = useShapeStore((s) => s.moveAll);
  const toggles = useShapeStore((s) => s.toggles);
  const setToggle = useShapeStore((s) => s.setToggle);
  const marginCm = useShapeStore((s) => s.marginCm);
  const setMargin = useShapeStore((s) => s.setMargin);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const bb = curveBounds(points);

  // Changing the margin re-fits and re-centers the shape, so committing on every
  // keystroke rescaled it once per digit — and an empty field parsed as 0,
  // blowing the mirror up to the whole wall. Hold a draft, commit deliberately.
  const [marginDraft, setMarginDraft] = useState(String(marginCm));
  useEffect(() => setMarginDraft(String(marginCm)), [marginCm]);
  const commitMargin = () => {
    const v = Number(marginDraft);
    if (marginDraft.trim() === "" || !Number.isFinite(v) || v < 0) {
      setMarginDraft(String(marginCm)); // reject, restore the live value
      return;
    }
    setMargin(v);
  };

  return (
    <>
      {/* always-visible mirror size, top-left */}
      <div className="cc-sizechip mono" aria-label="Mirror size">
        {bb.width.toFixed(0)} × {bb.height.toFixed(0)} <span className="cc-unit">cm</span>
      </div>

      {/* settings, top-right */}
      <div className="cc-settings-top">
        <button
          className={`cc-btn cc-btn-lg${settingsOpen ? " active" : ""}`}
          title="View settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          ⚙
        </button>
        {settingsOpen && (
          <Popover onClose={() => setSettingsOpen(false)} className="cc-settings-pop">
            <div className="pop-title">View</div>
            <ToggleRow k="showMirror" label="Mirror effect" toggles={toggles} set={setToggle} />
            <ToggleRow k="showGrid" label="Cm grid (10 cm)" toggles={toggles} set={setToggle} />
            <ToggleRow k="showPhoto" label="Wall backdrop" toggles={toggles} set={setToggle} />
            <ToggleRow k="showPageOverlay" label="Page overlay" toggles={toggles} set={setToggle} />
            <ToggleRow k="showWatermark" label="Watermark on exports" toggles={toggles} set={setToggle} />
            <div className="pop-title" style={{ marginTop: 10 }}>Safe margin</div>
            <div className="margin-row">
              <input
                type="number"
                min={0}
                step={0.5}
                value={marginDraft}
                onChange={(e) => setMarginDraft(e.target.value)}
                onBlur={commitMargin}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitMargin();
                }}
              />
              <span className="margin-unit">cm from each edge</span>
            </div>
          </Popover>
        )}
      </div>

      {/* compact scale + move, bottom-right */}
      <div className="canvas-controls" role="toolbar" aria-label="Move and scale">
        <div className="cc-scale" aria-label="Scale">
          <RepeatButton className="cc-btn" title="Larger" onStep={() => scaleAll(1.01)}>+</RepeatButton>
          <RepeatButton className="cc-btn" title="Smaller" onStep={() => scaleAll(0.99)}>−</RepeatButton>
        </div>
        <div className="cc-nudge" aria-label="Move">
          <RepeatButton className="cc-btn up" title="Up" onStep={() => moveAll(0, -0.5)}>▲</RepeatButton>
          <RepeatButton className="cc-btn left" title="Left" onStep={() => moveAll(-0.5, 0)}>◀</RepeatButton>
          <RepeatButton className="cc-btn right" title="Right" onStep={() => moveAll(0.5, 0)}>▶</RepeatButton>
          <RepeatButton className="cc-btn down" title="Down" onStep={() => moveAll(0, 0.5)}>▼</RepeatButton>
        </div>
      </div>
    </>
  );
}

/** A small dismissible popover: closes on outside-click or Escape. */
export function Popover({
  children,
  onClose,
  className,
}: {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className={`popover${className ? " " + className : ""}`}>
      {children}
    </div>
  );
}
