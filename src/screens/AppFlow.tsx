import { useEffect, useState } from "react";
import { PhotoCalibration } from "../components/PhotoCalibration";
import { ShapeEditor } from "../components/ShapeEditor";
import { ShapeCatalog } from "../components/ShapeCatalog";
import { CanvasControls } from "../components/CanvasControls";
import { PrintDialog } from "../components/PrintDialog";
import { Landing } from "./Landing";
import { useCalibrationStore } from "../state/useCalibrationStore";
import { useShapeStore } from "../state/useShapeStore";

type Screen = "landing" | "calibrate" | "editor";

function hasSavedWork() {
  const c = useCalibrationStore.getState();
  return !!(c.calibrated && c.photoSrc);
}

export function AppFlow() {
  // Landing first for new visitors; jump straight in if there's saved work.
  const [screen, setScreen] = useState<Screen>("landing");
  const [panelOpen, setPanelOpen] = useState(
    () => new URLSearchParams(location.search).has("panel"),
  );
  const [printOpen, setPrintOpen] = useState(false);
  const previewMode = useShapeStore((s) => s.previewMode);
  const setPreviewMode = useShapeStore((s) => s.setPreviewMode);
  const requestDownload = useShapeStore((s) => s.requestDownload);

  // Launch from the landing page: resume saved work, else start at calibration.
  const launch = () => setScreen(hasSavedWork() ? "editor" : "calibrate");

  // Leaving the editor screen should always exit preview mode.
  const goCalibrate = () => {
    setPreviewMode(false);
    setScreen("calibrate");
  };

  // Explicit "Create new": clear all persisted state and start over. This is
  // the ONLY reset — everything else is kept in localStorage across reloads.
  const createNew = () => {
    if (!confirm("Start over? This clears your photo, calibration and shape.")) return;
    localStorage.removeItem("mirror-calibration");
    localStorage.removeItem("mirror-shape");
    location.reload();
  };

  // Dev shortcut: ?demo loads the bundled wall photo and jumps to the editor;
  // ?democal loads the photo but stays on the calibration screen.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("demo") && !params.has("democal")) return;
    const img = new Image();
    img.onload = () => {
      useCalibrationStore
        .getState()
        .setPhoto(`${import.meta.env.BASE_URL}wall.webp`, img.naturalWidth, img.naturalHeight);
      if (params.has("demo")) {
        useCalibrationStore.getState().setCalibrated(true);
        setScreen("editor");
      } else {
        setScreen("calibrate");
      }
    };
    img.src = `${import.meta.env.BASE_URL}wall.webp`;
  }, []);

  if (screen === "landing") {
    return <Landing onLaunch={launch} hasSavedWork={hasSavedWork()} />;
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <h1>Mirror Wall Studio</h1>
        </div>
        <span className="step-badge">
          {screen === "calibrate" ? "1 · Calibrate wall" : "2 · Design & print"}
        </span>
        <div className="spacer" />
        {screen === "editor" && (
          <>
            {previewMode ? (
              <>
                <button className="ghost" onClick={() => requestDownload()} aria-label="Download image">
                  <span aria-hidden="true">⬇</span> <span className="btn-label">Download image</span>
                </button>
                <button className="ghost" onClick={() => setPreviewMode(false)} aria-label="Back to editing">
                  <span aria-hidden="true">✎</span> <span className="btn-label">Back to editing</span>
                </button>
                <button className="primary" onClick={() => setPrintOpen(true)} aria-label="Print">
                  <span aria-hidden="true">🖨</span> <span className="btn-label">Print</span>
                </button>
              </>
            ) : (
              <>
                <button className="ghost" onClick={createNew} aria-label="Create new">
                  <span aria-hidden="true">＋</span> <span className="btn-label">Create new</span>
                </button>
                <button className="ghost" onClick={goCalibrate} aria-label="Calibration">
                  <span aria-hidden="true">←</span> <span className="btn-label">Calibration</span>
                </button>
                <button className="ghost" onClick={() => setPreviewMode(true)} aria-label="Preview">
                  <span aria-hidden="true">👁</span> <span className="btn-label">Preview</span>
                </button>
                <button className="primary" onClick={() => setPrintOpen(true)} aria-label="Print">
                  <span aria-hidden="true">🖨</span> <span className="btn-label">Print</span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="body">
        {screen === "calibrate" ? (
          <PhotoCalibration onDone={() => setScreen("editor")} />
        ) : (
          <>
            <div className="stage-wrap">
              <ShapeEditor />
              {!previewMode && <CanvasControls />}
            </div>

            {!previewMode && (
              <>
                <button className="panel-toggle" onClick={() => setPanelOpen(true)}>
                  <span aria-hidden="true">🪞</span> Shapes
                </button>
                <div
                  className={`panel-scrim${panelOpen ? " open" : ""}`}
                  onClick={() => setPanelOpen(false)}
                />
                <aside className={`sidepanel${panelOpen ? " open" : ""}`}>
                  <ShapeCatalog />
                </aside>
              </>
            )}
          </>
        )}
      </div>

      {printOpen && <PrintDialog onClose={() => setPrintOpen(false)} />}
    </div>
  );
}
