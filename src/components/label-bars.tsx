// The barcode mark of a label (preview and print window): the piece code as real, scannable Code 128 bars.
// A code Code 128 cannot hold draws no bars: the label still prints, with the code as text on its first line.
import { useMemo } from "react";
import { code128Shape } from "@/lib/code128";

export function LabelBars({ value, wmm, hmm }: { value: string; wmm: number; hmm: number }) {
  const shape = useMemo(() => code128Shape(value), [value]);
  if (!shape) return null;
  return (
    <svg data-bars data-bars-code role="img" aria-label={value} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${shape.size} 1`} preserveAspectRatio="none" width={`${wmm}mm`} height={`${hmm}mm`} shapeRendering="crispEdges">
      <path d={shape.d} fill="currentColor" />
    </svg>
  );
}
