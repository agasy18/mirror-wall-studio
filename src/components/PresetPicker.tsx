import { useMemo } from "react";
import { useShapeStore } from "../state/useShapeStore";
import { MIRROR_PRESETS, presetToPoints } from "../data/presetShapes";
import { boundingBox, buildSmoothClosedPath } from "../model/geometry";

/** A grid of preset mirror silhouettes; clicking one loads it into the editor. */
export function PresetPicker() {
  const presetId = useShapeStore((s) => s.presetId);
  const loadPreset = useShapeStore((s) => s.loadPreset);

  const thumbs = useMemo(
    () =>
      MIRROR_PRESETS.map((p) => {
        const pts = presetToPoints(p);
        const bb = boundingBox(pts);
        const path = buildSmoothClosedPath(pts);
        return {
          id: p.id,
          name: p.name,
          path,
          viewBox: `${bb.minX - 4} ${bb.minY - 4} ${bb.width + 8} ${bb.height + 8}`,
        };
      }),
    [],
  );

  return (
    <div className="preset-scroll">
      <div className="preset-grid">
        {thumbs.map((t) => (
          <button
            key={t.id}
            className={`preset-cell${t.id === presetId ? " active" : ""}`}
            title={t.name}
            aria-label={`Use ${t.name} shape`}
            onClick={() => loadPreset(t.id)}
          >
            <svg viewBox={t.viewBox} preserveAspectRatio="xMidYMid meet">
              <path
                d={t.path}
                fill={t.id === presetId ? "rgba(124,201,255,0.95)" : "rgba(255,255,255,0.5)"}
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Total number of templates available (for the section header). */
export const PRESET_COUNT = MIRROR_PRESETS.length;
