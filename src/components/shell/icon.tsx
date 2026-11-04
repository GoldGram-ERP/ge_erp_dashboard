import { createElement } from "react";
import { ICON_DATA } from "./icon-data";

// The icon bodies are flat <path/circle/rect .../> lists: turned into elements here so they render on the server too.
const parsed = new Map<string, React.ReactNode[]>();
function parts(name: string) {
  let p = parsed.get(name);
  if (!p) {
    p = [...(ICON_DATA[name] ?? ICON_DATA.file).matchAll(/<(\w+)([^>]*?)\/?>/g)].map((m, i) => {
      const props: Record<string, string> = { key: String(i) };
      for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) props[a[1]] = a[2];
      return createElement(m[1], props);
    });
    parsed.set(name, p);
  }
  return p;
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{parts(name)}</svg>;
}
// Job icons are named like the dashboard registry does ("ScaleIcon"); an unknown name falls back to the jobs icon.
export const jobIconName = (n: string) => { const k = `job:${String(n ?? "").replace(/Icon$/, "")}`; return ICON_DATA[k] ? k : "jobs"; };
