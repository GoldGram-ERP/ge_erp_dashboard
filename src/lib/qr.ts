// A real QR code for a label: the piece code as modules, one SVG path (crisp at any size, prints sharp), no raster and no HTML injection.
// Error correction M; the quiet zone is two modules around the code so a scanner finds it on the label.
import qrcode from "qrcode-generator";

const QUIET = 2;

export type QrShape = { size: number; d: string };

/** The modules of `text` as an SVG path in a (size x size) box, where size includes the quiet zone. */
export function qrShape(text: string, level: "L" | "M" | "Q" | "H" = "M"): QrShape {
  const q = qrcode(0, level);
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!q.isDark(r, c)) { c++; continue; }
      let end = c;
      while (end < n && q.isDark(r, end)) end++;
      d += `M${c + QUIET} ${r + QUIET}h${end - c}v1h${c - end}z`;   // one run of dark modules in a row
      c = end;
    }
  }
  return { size: n + 2 * QUIET, d };
}

/** The same drawing as an SVG string, for the print window that builds its HTML as text. `text` is the code itself, never user markup. */
export function qrSvgText(text: string, mm = 10): string {
  const { size, d } = qrShape(text);
  return `<svg data-qr-code xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${mm}mm" height="${mm}mm" shape-rendering="crispEdges" style="flex:none;display:block"><path d="${d}" fill="#000"/></svg>`;
}
