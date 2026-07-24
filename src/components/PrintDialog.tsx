import { useEffect, useMemo, useState } from "react";
import { useShapeStore } from "../state/useShapeStore";
import { boundingBox } from "../model/geometry";
import { DEFAULT_TILE_CONFIG, PAPER_SIZES, paperById, planTiles } from "../model/tiling";

interface Props {
  onClose: () => void;
}

/** Modal shown when the user clicks Print: choose paper size, then export 1:1. */
export function PrintDialog({ onClose }: Props) {
  const points = useShapeStore((s) => s.points);
  const paperId = useShapeStore((s) => s.paperId);
  const setPaper = useShapeStore((s) => s.setPaper);
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
    const bb = boundingBox(points);
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
      exportTiledPdf(points, cfg);
      onClose();
    } catch {
      // The PDF code is a lazily-fetched chunk, so this also covers being
      // offline or holding a stale index after a redeploy.
      setError("Could not build the PDF. Check your connection and try again.");
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
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2 id="print-title" className="modal-title">Print your 1:1 template</h2>
        <p className="modal-sub">
          Your mirror is <b>{bb.width.toFixed(0)} × {bb.height.toFixed(0)} cm</b>.
          Choose a paper size — it prints across multiple sheets you tape together.
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
                {pl && <span className="paper-pages mono">{pl.pageCount} pages</span>}
              </button>
            );
          })}
        </div>

        <div className="modal-readout">
          {plan
            ? <>Exports <b>{plan.pageCount}</b> {cfg.paper.name} pages ({plan.cols} × {plan.rows}) · 10 mm overlap · Portrait</>
            : "Shape has no area to print."}
        </div>

        <button
          className="primary"
          style={{ width: "100%" }}
          disabled={!valid || busy}
          onClick={handleExport}
          autoFocus
        >
          {busy ? "Generating…" : "Download PDF"}
        </button>
        {error && <p className="modal-error" role="alert">{error}</p>}
        <p className="modal-fineprint">
          Print at 100% — turn off “fit to page”. Page 1 has a 10 cm ruler to check scale.
        </p>
      </div>
    </div>
  );
}
