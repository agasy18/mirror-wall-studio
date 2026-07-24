import { useEffect, useRef, useState } from "react";
import type { ViewToggles } from "../state/useShapeStore";

/**
 * A compact info (ⓘ) button that reveals a short dismissible tip on click,
 * instead of an always-on hint box taking up space.
 */
export function InfoButton({ children, label = "More info" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="info-wrap" ref={ref}>
      <button className="info-btn" aria-label={label} onClick={() => setOpen((v) => !v)}>ⓘ</button>
      {open && <span className="info-pop">{children}</span>}
    </span>
  );
}

/** A labelled checkbox row for the view settings. */
export function ToggleRow({
  k,
  label,
  toggles,
  set,
}: {
  k: keyof ViewToggles;
  label: string;
  toggles: ViewToggles;
  set: (k: keyof ViewToggles, v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={toggles[k]} onChange={(e) => set(k, e.target.checked)} />
      {label}
    </label>
  );
}

/**
 * A button that fires `onStep` once on press, then repeats it while held (after
 * a short delay), so fine 1%/0.5cm steps can be applied continuously without
 * clicking many times. Repeat accelerates slightly.
 */
export function RepeatButton({
  onStep,
  title,
  className,
  children,
}: {
  onStep: () => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const delay = useRef(220);

  const stop = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    delay.current = 220;
  };

  const start = () => {
    onStep();
    const tick = () => {
      onStep();
      delay.current = Math.max(40, delay.current * 0.82); // accelerate
      timer.current = window.setTimeout(tick, delay.current);
    };
    timer.current = window.setTimeout(tick, delay.current);
  };

  useEffect(() => stop, []);

  return (
    <button
      className={className}
      title={title}
      onPointerDown={(e) => {
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  );
}
