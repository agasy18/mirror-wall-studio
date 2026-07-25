import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { AppFlow } from "./screens/AppFlow";
import { activateLanguage, redirectToPreferredLanguage, servedLanguage } from "./i18n";
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

async function start() {
  // A first-time visitor on the root page is sent to their own language's URL.
  // Nothing else should happen if we are navigating away.
  if (redirectToPreferredLanguage()) return;

  // The URL decides the language, because the URL is what the server rendered.
  const served = servedLanguage(location.pathname);
  const active = await activateLanguage(served);

  // The landing is prerendered into each language's index.html, so adopt that
  // markup instead of throwing it away and repainting. If the language chunk
  // failed to load, React and the DOM now disagree — a clean render is better
  // than hydrating English onto, say, German markup.
  if (active === served && container.firstElementChild) {
    hydrateRoot(container, app);
  } else {
    createRoot(container).render(app);
  }
}

void start();
