import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { AppFlow } from "./screens/AppFlow";
import { useShapeStore } from "./state/useShapeStore";
import { useCalibrationStore } from "./state/useCalibrationStore";
import "./styles.css";

// Dev-only: expose stores for headless interaction testing.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__shapeStore = useShapeStore;
  (window as unknown as Record<string, unknown>).__calibStore = useCalibrationStore;
}

const container = document.getElementById("root")!;
const app = (
  <StrictMode>
    <AppFlow />
  </StrictMode>
);

// The landing is prerendered into index.html at build time, so adopt that
// markup instead of throwing it away and repainting. Falls back to a plain
// render if the prerender step was skipped.
if (container.firstElementChild) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
