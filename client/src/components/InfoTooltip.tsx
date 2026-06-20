import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

// ── Bullet-list helper ────────────────────────────────────────────────────────
// items: [bold term, rest of definition]
export function TipList({ items }: { items: [string, string][] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {items.map(([term, def]) => (
        <li key={term} style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3 }}>
          <span style={{ color: "#94a3b8", flexShrink: 0 }}>•</span>
          <span>
            <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{term}</span>
            {def ? <span style={{ color: "#cbd5e1" }}> — {def}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
interface Props {
  content: ReactNode;
  label: string;
}

interface Pos {
  top: number;
  left: number;
  arrowLeft: number;
  placement: "above" | "below";
  visible: boolean;
}

export function InfoTooltip({ content, label }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Two-phase positioning: render invisible first, measure, then position.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !tipRef.current) return;

    const btn = btnRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const GAP    = 7;   // px between button and tooltip
    const MARGIN = 10;  // min distance from viewport edge
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: center on button, clamp inside viewport
    let left = btn.left + btn.width / 2 - tip.width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - tip.width - MARGIN));

    // Arrow: always points at button center
    const arrowLeft = Math.max(10, Math.min(
      btn.left + btn.width / 2 - left,
      tip.width - 10
    ));

    // Vertical: prefer above, flip below if not enough room
    const spaceAbove = btn.top - GAP;
    let top: number;
    let placement: "above" | "below";

    if (spaceAbove >= tip.height + GAP) {
      top = btn.top - tip.height - GAP;
      placement = "above";
    } else if (vh - btn.bottom - GAP >= tip.height + GAP) {
      top = btn.bottom + GAP;
      placement = "below";
    } else {
      // Not enough room either way — pick whichever has more space
      if (spaceAbove >= vh - btn.bottom) {
        top = Math.max(MARGIN, btn.top - tip.height - GAP);
        placement = "above";
      } else {
        top = btn.bottom + GAP;
        placement = "below";
      }
    }

    setPos({ top, left, arrowLeft, placement, visible: true });
  }, [open]);

  // Reset when closed
  useEffect(() => { if (!open) setPos(null); }, [open]);

  // Click-away
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const arrowStyle = (p: Pos): React.CSSProperties =>
    p.placement === "above"
      ? {
          position: "absolute",
          top: "100%",
          left: p.arrowLeft,
          transform: "translateX(-50%)",
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid #1e293b",
          width: 0,
          height: 0,
        }
      : {
          position: "absolute",
          bottom: "100%",
          left: p.arrowLeft,
          transform: "translateX(-50%)",
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderBottom: "6px solid #1e293b",
          width: 0,
          height: 0,
        };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="ml-1 w-3.5 h-3.5 inline-flex items-center justify-center rounded-full text-[10px] text-slate-300 hover:text-indigo-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-colors"
        style={{ textTransform: "none" }}
      >
        ℹ
      </button>

      {open && createPortal(
        <div
          ref={tipRef}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos?.visible ? "visible" : "hidden",
            zIndex: 9999,
            width: 252,
            maxWidth: "calc(100vw - 20px)",
            backgroundColor: "#1e293b",
            color: "#e2e8f0",
            fontSize: 11,
            lineHeight: 1.5,
            borderRadius: 8,
            padding: "9px 12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            pointerEvents: "none",
            textTransform: "none",
            letterSpacing: "normal",
            fontWeight: "normal",
          }}
        >
          {pos && <div style={arrowStyle(pos)} />}
          {content}
        </div>,
        document.body
      )}
    </>
  );
}
