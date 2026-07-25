import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "./CanvasControls";
import {
  applyProject,
  currentProject,
  inlinedPhoto,
  parseProject,
  projectFilename,
  ProjectError,
  type Project,
} from "../state/project";
import { useCalibrationStore } from "../state/useCalibrationStore";

interface Props {
  onCreateNew: () => void;
  /** Called after a file has been loaded, so the flow can pick a screen. */
  onLoaded: (p: Project) => void;
}

/**
 * Start over, save the design to a file, or open one back up.
 *
 * One menu rather than three buttons: the top bar already ran off the right of
 * a phone screen with four, taking the primary "Get PDF" with it, and these
 * three are the same kind of thing — what happens to the whole document.
 */
export function FileMenu({ onCreateNew, onLoaded }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    // The file has to carry the picture itself, not a link to it: a project
    // that pointed at a URL would only reopen where that URL still resolves.
    const photo = await inlinedPhoto(useCalibrationStore.getState().photoSrc);
    const project = currentProject({ photo });
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = projectFilename(project);
    a.click();
    // Revoking immediately can beat the download on some browsers; one turn of
    // the event loop is enough and keeps the blob from leaking for the session.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const load = async (file: File) => {
    // Opening replaces the photo and the outline, and there is no undo.
    if (useCalibrationStore.getState().photoSrc && !confirm(t("confirm.openProject"))) return;
    try {
      const project = parseProject(await file.text());
      applyProject(project);
      onLoaded(project);
    } catch (e) {
      const reason = e instanceof ProjectError ? e.reason : "corrupt";
      alert(t(`project.err.${reason}`));
    }
  };

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="filemenu">
      <button
        className="ghost"
        aria-expanded={open}
        aria-label={t("actions.file")}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">🗂</span>{" "}
        <span className="btn-label">{t("actions.file")}</span>
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="filemenu-pop">
          <button className="menu-item" onClick={run(() => void save())}>
            <span aria-hidden="true">💾</span> {t("actions.saveProject")}
          </button>
          <button className="menu-item" onClick={run(() => fileRef.current?.click())}>
            <span aria-hidden="true">📂</span> {t("actions.openProject")}
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={run(onCreateNew)}>
            <span aria-hidden="true">＋</span> {t("actions.createNew")}
          </button>
        </Popover>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first: picking the same file twice must fire change again.
          e.target.value = "";
          if (file) void load(file);
        }}
      />
    </div>
  );
}
