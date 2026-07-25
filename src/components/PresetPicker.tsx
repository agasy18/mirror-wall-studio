import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShapeStore, wallSafeBox } from "../state/useShapeStore";
import { useCalibrationStore } from "../state/useCalibrationStore";
import { MIRROR_PRESETS, presetToPoints } from "../data/presetShapes";
import { boundingBox, buildSmoothClosedPath, normalizeToTarget } from "../model/geometry";

/** A grid of preset mirror silhouettes; clicking one loads it into the editor. */
export function PresetPicker() {
  const { t } = useTranslation();
  const presetId = useShapeStore((s) => s.presetId);
  const loadPreset = useShapeStore((s) => s.loadPreset);
  const marginCm = useShapeStore((s) => s.marginCm);
  // A preset is stretched to the marked area's proportions when it lands on the
  // canvas, so the thumbnail has to be drawn at those proportions too —
  // otherwise every preview is a portrait blob and picking one is a surprise.
  const realWidthCm = useCalibrationStore((s) => s.realWidthCm);
  const realHeightCm = useCalibrationStore((s) => s.realHeightCm);

  const thumbs = useMemo(
    () => {
      const box = wallSafeBox(marginCm);
      return MIRROR_PRESETS.map((p) => {
        const pts = normalizeToTarget(presetToPoints(p), box.w, box.h);
        const bb = boundingBox(pts);
        const pad = Math.max(bb.width, bb.height) * 0.04;
        const path = buildSmoothClosedPath(pts);
        return {
          id: p.id,
          name: p.name,
          path,
          viewBox: `${bb.minX - pad} ${bb.minY - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`,
        };
      });
    },
    // wallSafeBox reads the calibration store, so the wall size must be a dep.
    [marginCm, realWidthCm, realHeightCm],
  );

  // The six hand-authored shapes have real names worth translating; the 120
  // generated ones are just numbered, so they take a single templated key.
  const shapeName = (id: string, fallback: string) => {
    const generated = /^g(\d+)$/.exec(id);
    if (generated) return t("shapes.generated", { number: Number(generated[1]) + 1 });
    return t(`shapes.${id}`, { defaultValue: fallback });
  };

  return (
    <div className="preset-scroll">
      <div className="preset-grid">
        {thumbs.map((thumb) => {
          const name = shapeName(thumb.id, thumb.name);
          return (
            <button
              key={thumb.id}
              className={`preset-cell${thumb.id === presetId ? " active" : ""}`}
              title={name}
              aria-label={t("catalog.useShape", { name })}
              onClick={() => loadPreset(thumb.id)}
            >
              <svg viewBox={thumb.viewBox} preserveAspectRatio="xMidYMid meet">
                <path
                  d={thumb.path}
                  fill={thumb.id === presetId ? "var(--accent)" : "var(--canvas-thumb)"}
                />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Total number of templates available (for the section header). */
export const PRESET_COUNT = MIRROR_PRESETS.length;
