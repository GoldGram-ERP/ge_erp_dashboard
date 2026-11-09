"use client";
// The one row "Action" menu: a small button that opens a short menu of what can be done to that row (owner, 2026-11-09, bug reports).
// It lives inside table rows, so every click and key stays inside it (the row would open its record). The popup is the shared Popover,
// placed under (or above) the button and aligned to it in RTL. Keyboard: Enter/Space/↓ open, ↑/↓ move, Home/End, Esc closes and gives the focus back.
import { useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { Popover } from "../fields/Popover";
import { Icon } from "../engine/ui";

export type MenuAction = { id: string; label: string; icon?: string; danger?: boolean; hidden?: boolean; run: () => void | Promise<void> };

export function ActionMenu({ label, items, menuLabel }: { label: string; items: MenuAction[]; menuLabel?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = items.filter((i) => !i.hidden);
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const focusAt = (i: number) => { const els = list.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]"); if (els?.length) els[(i + els.length) % els.length].focus(); };
  const show = (at = 0) => { setOpen(true); requestAnimationFrame(() => focusAt(at)); };
  const shut = (refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); };

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const els = [...(list.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])], at = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusAt(at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusAt(at - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusAt(0); }
    else if (e.key === "End") { e.preventDefault(); focusAt(els.length - 1); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); shut(true); }
  }
  async function pick(a: MenuAction) {
    shut(true);
    setBusy(true);
    try { await a.run(); } finally { setBusy(false); }
  }

  return (
    <span className="act-menu" onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      <button ref={btn} type="button" className="act-btn" aria-haspopup="menu" aria-expanded={open} disabled={busy || shown.length === 0}
        onClick={() => (open ? shut(false) : show())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(e.key === "ArrowUp" ? shown.length - 1 : 0); } }}>
        {label}<Icon name="chev-down" size={14} />
      </button>
      {open && (
        <Popover trigger={btn} onClose={() => shut(false)} className="act-pop" role="menu" label={menuLabel ?? label}>
          <div ref={list} className="act-list" onKeyDown={onMenuKey} onClick={stop}>
            {shown.map((a) => (
              <button key={a.id} type="button" role="menuitem" tabIndex={-1} className={`act-item${a.danger ? " danger" : ""}`} onClick={() => pick(a)}>
                {a.icon && <Icon name={a.icon} size={14} />}<span>{a.label}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </span>
  );
}
