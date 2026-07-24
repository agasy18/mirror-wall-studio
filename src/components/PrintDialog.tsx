import { useMemo, useState } from "react";
import { useShapeStore } from "../state/useShapeStore";
import { boundingBox } from "../model/geometry";
import { DEFAULT_TILE_CONFIG, PAPER_SIZES, paperById, planTiles } from "../model/tiling";
import { exportTiledPdf } from "../export/tilePdf";

interface Props {
  onClose: () => void;
}

/** Modal shown when the user clicks Print: choose paper size, then export 1:1. */
export function PrintDialog({ onClose }: Props) {
  const points = useShapeStore((s) => s.points);
  const paperId = useShapeStore((s) => s.paperId);
  const setPaper = useShapeStore((s) => s.setPaper);
  const [busy, setBusy] = useState(false);

  const cfg = useMemo(() => ({ ...DEFAULT_TILE_CONFIG, paper: paperById(paperId) }), [paperId]);
  const { bb, plan, valid } = useMemo(() => {
    const bb = boundingBox(points);
    const valid = bb.width > 0 && bb.height > 0 && points.length >= 3;
    const plan = valid ? planTiles(bb.width * 10, bb.height * 10, cfg) : null;
    return { bb, plan, valid };
  }, [points, cfg]);

  const handleExport = () => {
    if (!valid) return;
    setBusy(true);
    try {
      exportTiledPdf(points, cfg);
      onClose();
    } finally {
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
        >
          {busy ? "Generating…" : "Download PDF"}
        </button>
        <p className="modal-fineprint">
          Print at 100% — turn off “fit to page”. Page 1 has a 10 cm ruler to check scale.
        </p>
      </div>
    </div>
  );
}
