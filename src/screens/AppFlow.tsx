import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhotoCalibration } from "../components/PhotoCalibration";
import { ShapeEditor } from "../components/ShapeEditor";
import { ShapeCatalog } from "../components/ShapeCatalog";
import { CanvasControls } from "../components/CanvasControls";
import { PrintDialog } from "../components/PrintDialog";
import { FileMenu } from "../components/FileMenu";
import { LanguagePicker } from "../components/LanguagePicker";
import { Landing } from "./Landing";
import { APP_NAME } from "../model/brand";
import { useCalibrationStore } from "../state/useCalibrationStore";
import { useShapeStore } from "../state/useShapeStore";
import { cancelPendingWrites } from "../state/debouncedStorage";
import type { Project } from "../state/project";

type Screen = "landing" | "calibrate" | "editor";

function hasSavedWork() {
  const c = useCalibrationStore.getState();
  return !!(c.calibrated && c.photoSrc);
}

export function AppFlow() {
  const { t } = useTranslation();
  // Landing first for new visitors; jump straight in if there's saved work.
  const [screen, setScreen] = useState<Screen>("landing");
  const [panelOpen, setPanelOpen] = useState(
    () => new URLSearchParams(location.search).has("panel"),
  );
  const [printOpen, setPrintOpen] = useState(false);
  // Read after mount, never during render: the prerendered HTML is built with
  // no saved work, so deriving this from localStorage on the first client
  // render would change the CTA label and break hydration.
  const [savedWork, setSavedWork] = useState(false);
  useEffect(() => setSavedWork(hasSavedWork()), []);
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

  // A file with no finished calibration drops the user on the calibration
  // screen rather than into an editor with no wall behind it.
  const openLoaded = (p: Project) => {
    setPreviewMode(false);
    setScreen(p.wall.calibrated && p.wall.photo ? "editor" : "calibrate");
  };

  // Explicit "Create new": clear all persisted state and start over. This is
  // the ONLY reset — everything else is kept in localStorage across reloads.
  const createNew = () => {
    if (!confirm(t("confirm.startOver"))) return;
    // Storage writes are debounced, so drop anything still queued first —
    // otherwise it flushes on unload and restores what we just deleted.
    cancelPendingWrites();
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
    return <Landing onLaunch={launch} hasSavedWork={savedWork} />;
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <h1>{APP_NAME}</h1>
        </div>
        <span className="step-badge">
          {screen === "calibrate" ? t("steps.calibrate") : t("steps.design")}
        </span>
        <div className="spacer" />
        <LanguagePicker className="lang-picker--bar" />
        {screen === "editor" && (
          <>
            {previewMode ? (
              <>
                <button
                  className="ghost"
                  onClick={() => requestDownload()}
                  aria-label={t("actions.downloadImage")}
                >
                  <span aria-hidden="true">⬇</span>{" "}
                  <span className="btn-label">{t("actions.downloadImage")}</span>
                </button>
                <button
                  className="ghost"
                  onClick={() => setPreviewMode(false)}
                  aria-label={t("actions.backToEditing")}
                >
                  <span aria-hidden="true">✎</span>{" "}
                  <span className="btn-label">{t("actions.backToEditing")}</span>
                </button>
                <button
                  className="primary"
                  onClick={() => setPrintOpen(true)}
                  aria-label={t("actions.getPdfAria")}
                >
                  <span aria-hidden="true">📄</span>{" "}
                  <span className="btn-label">{t("actions.getPdf")}</span>
                </button>
              </>
            ) : (
              <>
                <FileMenu onCreateNew={createNew} onLoaded={openLoaded} />
                <button className="ghost" onClick={goCalibrate} aria-label={t("actions.calibration")}>
                  <span aria-hidden="true">←</span>{" "}
                  <span className="btn-label">{t("actions.calibration")}</span>
                </button>
                <button
                  className="ghost"
                  onClick={() => setPreviewMode(true)}
                  aria-label={t("actions.preview")}
                >
                  <span aria-hidden="true">👁</span>{" "}
                  <span className="btn-label">{t("actions.preview")}</span>
                </button>
                {/* "Print" read as "send to a printer"; this downloads a PDF
                    you print later, so the label says what you actually get. */}
                <button
                  className="primary"
                  onClick={() => setPrintOpen(true)}
                  aria-label={t("actions.getPdfAria")}
                >
                  <span aria-hidden="true">📄</span>{" "}
                  <span className="btn-label">{t("actions.getPdf")}</span>
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
                  <span aria-hidden="true">🪞</span> {t("actions.shapes")}
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
