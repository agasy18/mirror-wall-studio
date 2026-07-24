import { PresetPicker, PRESET_COUNT } from "./PresetPicker";
import { useShapeStore } from "../state/useShapeStore";
import { InfoButton } from "./controls";

/**
 * The right panel — now ONLY the mirror-shape catalog. All other controls
 * (move/scale, view settings) live in the floating canvas pill; Print is in
 * the top bar.
 */
export function ShapeCatalog() {
  const resetPreset = useShapeStore((s) => s.resetPreset);
  return (
    <div className="panel-section catalog-section">
      <div className="catalog-head">
        <h2>Choose a mirror</h2>
        <span className="catalog-count mono">{PRESET_COUNT}</span>
        <InfoButton label="How to edit a shape">
          Pick a shape, then drag the dots on the canvas to refine it.
          Double-tap the outline to add a point; select one and use the Delete
          point button (or the Delete key) to remove it.
        </InfoButton>
      </div>
      <PresetPicker />
      <button className="ghost" style={{ width: "100%", marginTop: 12 }} onClick={resetPreset}>
        Reset this shape
      </button>
    </div>
  );
}
