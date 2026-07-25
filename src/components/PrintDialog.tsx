import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useShapeStore } from "../state/useShapeStore";
import { curveBounds } from "../model/geometry";
import { DEFAULT_TILE_CONFIG, PAPER_SIZES, paperById, planTiles } from "../model/tiling";
import { APP_NAME } from "../model/brand";

interface Props {
  onClose: () => void;
}

/** Modal shown when the user clicks Print: choose paper size, then export 1:1. */
export function PrintDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const points = useShapeStore((s) => s.points);
  const paperId = useShapeStore((s) => s.paperId);
  const setPaper = useShapeStore((s) => s.setPaper);
  const showWatermark = useShapeStore((s) => s.toggles.showWatermark);
  const setToggle = useShapeStore((s) => s.setToggle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A dialog that only closes by clicking the scrim is a keyboard trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cfg = useMemo(() => ({ ...DEFAULT_TILE_CONFIG, paper: paperById(paperId) }), [paperId]);
  const { bb, plan, valid } = useMemo(() => {
    const bb = curveBounds(points);
    const valid = bb.width > 0 && bb.height > 0 && points.length >= 3;
    const plan = valid ? planTiles(bb.width * 10, bb.height * 10, cfg) : null;
    return { bb, plan, valid };
  }, [points, cfg]);

  // jsPDF is ~a third of the bundle and is only needed once the user actually
  // exports, so it is pulled in on demand rather than on first paint.
  const handleExport = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const { exportTiledPdf } = await import("../export/tilePdf");
      exportTiledPdf(points, cfg, { watermark: showWatermark });
      onClose();
    } catch {
      // The PDF code is a lazily-fetched chunk, so this also covers being
      // offline or holding a stale index after a redeploy.
      setError(t("print.error"));
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label={t("actions.close")} onClick={onClose}>✕</button>
        <h2 id="print-title" className="modal-title">{t("print.title")}</h2>
        <p className="modal-sub">
          <Trans
            i18nKey="print.sub"
            components={{ b: <b /> }}
            values={{
              size: `${bb.width.toFixed(0)} × ${bb.height.toFixed(0)} ${t("editor.unit")}`,
            }}
          />
        </p>

        <div className="paper-grid">
          {PAPER_SIZES.map((p) => {
            const pl = valid ? planTiles(bb.width * 10, bb.height * 10, { ...DEFAULT_TILE_CONFIG, paper: p }) : null;
            return (
              <button
                key={p.id}
                className={`paper-opt${p.id === paperId ? " active" : ""}`}
                onClick={() => setPaper(p.id)}
              >
                <span className="paper-name">{p.name}</span>
                <span className="paper-dim mono">{p.wmm}×{p.hmm} mm</span>
                {pl && (
                  <span className="paper-pages mono">
                    {t("print.pages", { count: pl.pageCount })}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="modal-readout">
          {plan ? (
            <Trans
              i18nKey="print.readout"
              components={{ b: <b /> }}
              count={plan.pageCount}
              values={{
                count: plan.pageCount,
                paper: cfg.paper.name,
                cols: plan.cols,
                rows: plan.rows,
                overlap: cfg.overlapMm,
              }}
            />
          ) : (
            t("print.noArea")
          )}
        </div>

        <label className="modal-check">
          <input
            type="checkbox"
            checked={showWatermark}
            onChange={(e) => setToggle("showWatermark", e.target.checked)}
          />
          <span>
            {t("print.watermarkLabel", { app: APP_NAME })}
            <span className="modal-check-sub">{t("print.watermarkSub")}</span>
          </span>
        </label>

        <button
          className="primary"
          style={{ width: "100%" }}
          disabled={!valid || busy}
          onClick={handleExport}
          autoFocus
        >
          {busy ? t("print.generating") : t("print.download")}
        </button>
        {error && <p className="modal-error" role="alert">{error}</p>}
        <p className="modal-fineprint">
          {t("print.fineprint")}
          {" "}
          {/* The PDF's own text is English: jsPDF's built-in fonts cannot
              render Cyrillic, CJK or Arabic without embedding a font file. */}
          <span className="modal-fineprint-note">{t("print.pdfLanguageNote")}</span>
        </p>
      </div>
    </div>
  );
}
