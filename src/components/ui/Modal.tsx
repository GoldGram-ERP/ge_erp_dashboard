"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The one modal: a native modal dialog owned by the library (focus trap, Esc, backdrop), so a screen never writes <dialog>. Esc asks onClose, the page decides. */
export function Modal({ title, titleId = "modal-title", onClose, children }: { title: string; titleId?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>,
    document.body,
  );
}
