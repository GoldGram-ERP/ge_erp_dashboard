"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { Icon } from "./icon";

/** Copies text to the clipboard. Falls back to a hidden textarea where the clipboard API is missing (an insecure page, an old browser). */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* try the old way */ }
  try {
    const a = document.createElement("textarea");
    a.value = text; a.setAttribute("readonly", ""); a.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.append(a); a.select();
    const ok = document.execCommand("copy");
    a.remove();
    return ok;
  } catch { return false; }
}

/** Copies an image to the clipboard. `png` may still be loading: the write starts inside the click (Safari needs that) and waits for it. */
export async function copyImage(png: Promise<Blob>): Promise<boolean> {
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); return true; } catch { return false; }
}

/**
 * The one Copy button: the universal copy icon, which answers the press at once, and turns into a drawn check (with a soft
 * pop) for a moment once the text is on the clipboard. Reduced motion gets a plain cross-fade. The name read aloud stays
 * "Copy <what>"; with `children` it is the labelled form (same icon and animation, gold button, the text beside the icon). A polite live region says "Copied". Always a 36 px target, 44 px on a touch screen (see .copy-btn).
 */
export function CopyButton({ text, label, className = "", size = 18, children, id, disabled }: { text: string; label?: string; className?: string; size?: number; children?: React.ReactNode; id?: string; disabled?: boolean }) {
  const t = useTranslations("app.copy");
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const name = label ?? (children ? undefined : `${t("copy")} ${text}`);
  async function press() {
    if (!(await copyText(text))) { toast(t("failed"), true); return; }
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1600);
  }
  return (
    <button type="button" id={id} disabled={disabled} className={`copy-btn${children ? " solid" : ""}${done ? " done" : ""}${className ? ` ${className}` : ""}`} aria-label={name} title={name} onClick={press}>
      <span className="copy-mark" aria-hidden="true">
        <span className="copy-ico"><Icon name="copy" size={size} /></span>
        <svg className="copy-ok" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7" /></svg>
      </span>
      {children}
      <span className="sr-only" role="status" aria-live="polite">{done ? t("copied") : ""}</span>
    </button>
  );
}
