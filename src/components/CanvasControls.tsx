import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      <div className="cc-sizechip mono" aria-label={t("editor.sizeAria")}>
        {bb.width.toFixed(0)} × {bb.height.toFixed(0)}{" "}
        <span className="cc-unit">{t("editor.unit")}</span>
      </div>

      {/* settings, top-right */}
      <div className="cc-settings-top">
        <button
          className={`cc-btn cc-btn-lg${settingsOpen ? " active" : ""}`}
          title={t("editor.viewSettings")}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          ⚙
        </button>
        {settingsOpen && (
          <Popover onClose={() => setSettingsOpen(false)} className="cc-settings-pop">
            <div className="pop-title">{t("editor.viewTitle")}</div>
            <ToggleRow k="showMirror" label={t("editor.toggles.mirror")} toggles={toggles} set={setToggle} />
            <ToggleRow k="showGrid" label={t("editor.toggles.grid")} toggles={toggles} set={setToggle} />
            <ToggleRow k="showPhoto" label={t("editor.toggles.photo")} toggles={toggles} set={setToggle} />
            <ToggleRow k="showPageOverlay" label={t("editor.toggles.pageOverlay")} toggles={toggles} set={setToggle} />
            <ToggleRow k="showWatermark" label={t("editor.toggles.watermark")} toggles={toggles} set={setToggle} />
            <div className="pop-title" style={{ marginTop: 10 }}>{t("editor.safeMargin")}</div>
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
              <span className="margin-unit">{t("editor.marginUnit")}</span>
            </div>
          </Popover>
        )}
      </div>

      {/* compact scale + move, bottom-right */}
      <div className="canvas-controls" role="toolbar" aria-label={t("editor.moveScaleAria")}>
        <div className="cc-scale" aria-label={t("editor.scale")}>
          <RepeatButton className="cc-btn" title={t("editor.larger")} onStep={() => scaleAll(1.01)}>+</RepeatButton>
          <RepeatButton className="cc-btn" title={t("editor.smaller")} onStep={() => scaleAll(0.99)}>−</RepeatButton>
        </div>
        <div className="cc-nudge" aria-label={t("editor.move")}>
          <RepeatButton className="cc-btn up" title={t("editor.up")} onStep={() => moveAll(0, -0.5)}>▲</RepeatButton>
          <RepeatButton className="cc-btn left" title={t("editor.left")} onStep={() => moveAll(-0.5, 0)}>◀</RepeatButton>
          <RepeatButton className="cc-btn right" title={t("editor.right")} onStep={() => moveAll(0.5, 0)}>▶</RepeatButton>
          <RepeatButton className="cc-btn down" title={t("editor.down")} onStep={() => moveAll(0, 0.5)}>▼</RepeatButton>
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
