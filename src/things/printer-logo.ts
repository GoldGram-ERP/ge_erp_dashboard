// Test printer: a chosen logo file -> a data URL, in the browser only (nothing is uploaded). Rules and limits are in printer-label-rules.ts.
import { LOGO_MAX_SIDE, downscaleSize } from "./printer-label-rules";

const asDataUrl = (f: Blob) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(f); });
const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("image")); i.src = src; });

/** SVG: kept as it is. Raster: redrawn with the longest side at most 600 px (never enlarged); PNG and WebP come out as PNG so transparency stays, JPEG stays JPEG. */
export async function readLogo(file: File): Promise<string> {
  const url = await asDataUrl(file);
  if (file.type === "image/svg+xml") return url;
  const img = await load(url), { w, h } = downscaleSize(img.naturalWidth, img.naturalHeight, LOGO_MAX_SIDE);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  g.drawImage(img, 0, 0, w, h);
  return file.type === "image/jpeg" ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
}
