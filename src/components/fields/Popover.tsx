"use client";
// A popover in <body>, fixed under (or above, when the screen ends) its trigger. Used by Select and DatePicker.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = { trigger: RefObject<HTMLElement | null>; onClose: () => void; className: string; children: ReactNode; role?: string; id?: string; label?: string; watch?: unknown };

export function Popover({ trigger, onClose, className, children, role, id, label, watch }: Props) {
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; maxHeight: number; side: string } | null>(null);

  const place = () => {
    const t = trigger.current, p = pop.current;
    if (!t || !p) return;
    const r = t.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    // The popup is measured before its minWidth (the trigger's width) applies, and its final width is the larger of the two: measuring only
    // offsetWidth put a narrow list 'trigger width minus list width' too far right in RTL (right edge = r.right - w, not r.right - width).
    const below = vh - r.bottom - 12, above = r.top - 12, h = p.offsetHeight, w = Math.max(p.offsetWidth, r.width);
    const up = h > below && above > below, room = Math.max(140, (up ? above : below) - 4), hh = Math.min(h, room);
    const rtl = getComputedStyle(t).direction === "rtl";
    setPos({ minWidth: r.width, maxHeight: room, left: Math.max(8, Math.min(rtl ? r.right - w : r.left, vw - w - 8)), top: up ? r.top - 4 - hh : r.bottom + 4, side: up ? "up" : "down" });
  };
  useLayoutEffect(place, [watch]);

  useEffect(() => {
    const away = (e: Event) => { const n = e.target as Node; if (!pop.current?.contains(n) && !trigger.current?.contains(n)) onClose(); };
    const scroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) place(); };
    document.addEventListener("pointerdown", away, true);
    addEventListener("scroll", scroll, true); addEventListener("resize", place);
    return () => { document.removeEventListener("pointerdown", away, true); removeEventListener("scroll", scroll, true); removeEventListener("resize", place); };
  });

  return createPortal(
    <div
      ref={pop} id={id} role={role} aria-label={label} className={`pop ${className}`} data-side={pos?.side}
      style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, minWidth: pos?.minWidth, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); }}   // clicking inside keeps the focus where it is
    >{children}</div>,
    document.body,
  );
}
