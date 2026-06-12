import { useEffect } from "react";
import { coverGradient } from "../lib/supabase";

/* ---------- Cover: image with deterministic gradient fallback ---------- */
export function Cover({ url, title, sub, className = "", style = {} }: {
  url?: string | null; title: string; sub?: string; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={"cover " + className} style={{ background: coverGradient(title), ...style }}>
      {url && (
        <img src={url} alt="" loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      <span className="t">{title}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  );
}

/* ---------- Stars: half-star display + optional input ---------- */
export function Stars({ value, onChange, size = 22 }: {
  value: number | null; onChange?: (v: number) => void; size?: number;
}) {
  const v = value ?? 0;
  return (
    <span className="stars" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, v - (star - 1)));
        return (
          <span key={star} className="star">
            <span className="star-bg">★</span>
            <span className="star-fg" style={{ width: fill * 100 + "%" }}>★</span>
            {onChange && (
              <>
                <button className="star-hit left" aria-label={`${star - 0.5} stars`}
                  onClick={() => onChange(star - 0.5)} />
                <button className="star-hit right" aria-label={`${star} stars`}
                  onClick={() => onChange(star)} />
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, children, width }: {
  open: boolean; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-wrap open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={width ? { width: `min(${width}px,96vw)` } : undefined}>
        <button className="icon-btn modal-x" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Seg<T extends string>({ options, value, onChange }: {
  options: { v: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Spinner() {
  return <div className="empty"><span className="spin" style={{ display: "inline-block" }} /> loading…</div>;
}
