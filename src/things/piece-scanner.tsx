"use client";
// "Scan with camera" beside a piece code box: a modal with the live camera; a code read closes it and is handed back. When the camera is refused or the browser
// cannot read a barcode it says so and offers the typed box ("Type the code" closes it). Ported from the dashboard's piece-scanner.tsx; the camera is stocktake-count-camera.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/t";
import { CameraBox } from "./stocktake-count-camera";

export function PieceScanner({ label, onClose, onCode }: { label: string; onClose: () => void; onCode: (code: string) => void }) {
  const { t } = useT();
  const m = (k: string, v?: Record<string, string>) => t("gold-sales", `pieceLookUp.${k}`, v);
  const ref = useRef<HTMLDialogElement>(null);
  const [off, setOff] = useState<"denied" | "unsupported" | null>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return createPortal(
    <dialog ref={ref} aria-labelledby="scan-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h2 id="scan-title">{m("scanTitle", { label })}</h2>
      {off
        ? <div role="alert"><strong>{m("cameraDeniedTitle")}</strong><p>{off === "denied" ? m("cameraDeniedBody") : m("cameraUnsupportedBody")}</p></div>
        : <><CameraBox onCode={(c) => onCode(c.trim())} onUnavailable={setOff} /><p className="hint">{m("scanHint")}</p></>}
      <div className="row"><button type="button" className={`btn ${off ? "primary" : "quiet"}`} id="type-code" onClick={onClose}>{m("typeCode")}</button></div>
    </dialog>,
    document.body,
  );
}
