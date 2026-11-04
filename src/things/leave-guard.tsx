"use client";
// The page form's back button asks first while something is typed (the HTML replaced #back's click with this guard).
// Capture listener on the engine's #back button: when `dirty`, the click is held and a confirm decides.
import { useEffect, useRef } from "react";
import type { Tr } from "@/lib/t";
import { useConfirm } from "@/components/engine";

export function useLeaveGuard(tr: Tr, dirty: boolean, close: () => void) {
  const [confirm, dialog] = useConfirm();
  const live = useRef({ dirty, close, confirm, tr });
  live.current = { dirty, close, confirm, tr };
  /** Cancel buttons call this too. */
  const leave = async () => {
    const { dirty: d, close: c, confirm: ask, tr: x } = live.current;
    if (!d || await ask({ title: x.t("common", "unsaved.title"), text: x.t("common", "unsaved.body"), ok: x.t("common", "unsaved.leave"), cancel: x.t("common", "unsaved.keepEditing"), danger: true })) c();
  };
  useEffect(() => {
    const back = document.getElementById("back");
    if (!back) return;
    const onClick = (e: Event) => { if (live.current.dirty) { e.stopPropagation(); e.preventDefault(); void leave(); } };
    back.addEventListener("click", onClick, true);
    return () => back.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { leave, dialog };
}
