// The QR mark of a label (preview and print window): the piece code as a real, scannable QR code.
import { useMemo } from "react";
import { qrShape } from "@/lib/qr";

export function LabelQr({ value, mm = 10 }: { value: string; mm?: number }) {
  const shape = useMemo(() => qrShape(value), [value]);
  return (
    <svg data-qr data-qr-code role="img" aria-label={value} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${shape.size} ${shape.size}`} width={`${mm}mm`} height={`${mm}mm`} shapeRendering="crispEdges" style={{ flex: "none", display: "block", background: "#fff" }}>
      <path d={shape.d} fill="#000" />
    </svg>
  );
}
