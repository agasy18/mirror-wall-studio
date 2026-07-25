import { useTranslation } from "react-i18next";
import { PresetPicker, PRESET_COUNT } from "./PresetPicker";
import { useShapeStore } from "../state/useShapeStore";
import { InfoButton } from "./controls";

/**
 * The right panel — now ONLY the mirror-shape catalog. All other controls
 * (move/scale, view settings) live in the floating canvas pill; Print is in
 * the top bar.
 */
export function ShapeCatalog() {
  const { t } = useTranslation();
  const resetPreset = useShapeStore((s) => s.resetPreset);
  return (
    <div className="panel-section catalog-section">
      <div className="catalog-head">
        <h2>{t("catalog.title")}</h2>
        <span className="catalog-count mono">{PRESET_COUNT}</span>
        <InfoButton label={t("catalog.infoLabel")}>{t("catalog.infoBody")}</InfoButton>
      </div>
      <PresetPicker />
      <button className="ghost" style={{ width: "100%", marginTop: 12 }} onClick={resetPreset}>
        {t("catalog.reset")}
      </button>
    </div>
  );
}
