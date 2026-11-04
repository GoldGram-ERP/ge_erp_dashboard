"use client";
// Camera scan for the stock count: the browser's BarcodeDetector (Chromium only) on a live getUserMedia stream. Formats code_128, code_39, ean_13, qr_code;
// default camera "environment"; switch camera; torch. The same value is not sent twice in a row (it resets only when a frame shows no code).
// No BarcodeDetector or no camera API -> onUnavailable("unsupported"); camera refused or failed -> onUnavailable("denied"). No library is used.
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/t";

export const cameraSupported = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export function CameraBox({ onCode, onUnavailable }: { onCode: (code: string) => void; onUnavailable: (why: "unsupported" | "denied") => void }) {
  const { t } = useT();
  const m = (k: string) => t("gold-stocktake", `stockCount.${k}`);
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onCode, onUnavailable });
  useEffect(() => { cb.current = { onCode, onUnavailable }; });
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torch, setTorch] = useState(false);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!cameraSupported()) { cb.current.onUnavailable("unsupported"); return; }
    let stopped = false, timer: ReturnType<typeof setTimeout>, last = "";
    const detector = new (window as any).BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "qr_code"] });
    const stopStream = () => stream.current?.getTracks().forEach((x) => x.stop());
    const loop = async () => {
      if (stopped) return;
      try {
        const v = video.current ? (await detector.detect(video.current))[0]?.rawValue : undefined;
        if (v) { if (v !== last) { last = v; cb.current.onCode(v); } } else last = "";
      } catch { /* a frame that cannot be read is skipped */ }
      timer = setTimeout(loop, 200);
    };
    (async () => {
      try { stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }); }
      catch { if (!stopped) cb.current.onUnavailable("denied"); return; }
      if (stopped) return stopStream();
      if (video.current) { video.current.srcObject = stream.current; await video.current.play().catch(() => {}); }
      loop();
    })();
    return () => { stopped = true; clearTimeout(timer); stopStream(); setTorch(false); };
  }, [facing]);

  const toggleTorch = () => {
    const track = stream.current?.getVideoTracks()[0];
    track?.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).then(() => setTorch((x) => !x)).catch(() => {});   // a device without a torch stays off
  };
  return (
    <>
      <div style={{ position: "relative", maxWidth: 480 }}>
        <video ref={video} playsInline muted aria-label={m("useCamera")} style={{ width: "100%", borderRadius: 6, background: "#000" }} />
        <div style={{ position: "absolute", inset: 0, margin: "auto", width: "66%", height: "33%", border: "2px solid #fff", borderRadius: 4, pointerEvents: "none" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn quiet sm" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>{m("switchCamera")}</button>
        <button type="button" className="btn quiet sm" aria-pressed={torch} onClick={toggleTorch}>{m("torch")}</button>
      </div>
    </>
  );
}
