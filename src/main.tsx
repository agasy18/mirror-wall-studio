import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppFlow } from "./screens/AppFlow";
import { useShapeStore } from "./state/useShapeStore";
import { useCalibrationStore } from "./state/useCalibrationStore";
import "./styles.css";

// Dev-only: expose stores for headless interaction testing.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__shapeStore = useShapeStore;
  (window as unknown as Record<string, unknown>).__calibStore = useCalibrationStore;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppFlow />
  </StrictMode>,
);
