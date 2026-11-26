'use client';
// ONE way to choose from a list (owner, 2026-11-25): a compact pill that hugs its value and, when tapped, grows
// fluidly out of itself into a sheet right where it sits, then folds back into the pill on close.
// apple-design: the pill's own surface IS the sheet (a shared-layout morph on one critically damped spring, so it is
// interruptible and reverses from wherever it is, §3–4); it opens downward from the pill, or upward when there is no
// room below (§7 spatial consistency); glass material with depth (§12); content fades in only once the surface has
// started to grow. Reduced motion: no morph, a short fade.
// Inside: a title, a search field once the list is long (> 7) or for Combobox, the choices as one inset group with a
// check on the current one. Arrow keys move, Enter/Space picks, Esc or a tap outside closes, focus returns to the pill.
import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar, type AvatarUser } from './avatar';
import { useWords } from './words';

export type PickerOption = { value: string; label: string; hint?: string; disabled?: boolean; avatar?: AvatarUser };

const spring = { type: 'spring', bounce: 0, duration: 0.38 } as const;
const pillClass =
  'relative inline-flex h-8 w-fit self-start max-w-full items-center gap-1.5 rounded-full ps-3 pe-2.5 text-body text-label outline-none transition-transform duration-150 active:scale-[0.97] focus-visible:shadow-[inset_0_0_0_1.5px_var(--tint)] aria-[invalid=true]:shadow-[inset_0_0_0_1.5px_var(--danger)] disabled:opacity-50 disabled:active:scale-100 [&:hover>.pill-bg]:bg-fill-strong';

type Place = { left: number; width: number; top?: number; bottom?: number; maxH: number };

function placeUnder(el: HTMLElement): Place {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight, gap = 6, pad = 8;
  const width = Math.min(Math.max(r.width, 272), 352, vw - pad * 2);
  const rtl = getComputedStyle(el).direction === 'rtl';
  const left = Math.min(Math.max(rtl ? r.right - width : r.left, pad), vw - width - pad);
  const below = vh - r.bottom - gap - pad, above = r.top - gap - pad;
  return below >= 260 || below >= above
    ? { left, width, top: r.bottom + gap, maxH: below }
    : { left, width, bottom: vh - r.top + gap, maxH: above };
}

export function Picker({ id, value, onChange, options, placeholder, invalid, disabled, ariaLabel, prefix, className, searchable }: {
  id?: string; value: string | null; onChange: (v: string) => void; options: PickerOption[]; placeholder?: string;
  invalid?: boolean; disabled?: boolean; ariaLabel?: string; prefix?: string; className?: string; searchable?: boolean;
}) {
  const w = useWords();
  const reduce = useReducedMotion();
  const uid = React.useId();
  const pillRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<Place | null>(null);
  const [q, setQ] = React.useState('');
  const open = place != null;

  const current = options.find((o) => o.value === value);
  const title = prefix ?? ariaLabel ?? placeholder ?? w.choose;
  const withSearch = searchable ?? options.length > 7;
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(needle)) : options;

  const close = React.useCallback((refocus = true) => {
    setPlace(null); setQ('');
    if (refocus) pillRef.current?.focus();
  }, []);
  const choose = (v: string) => { onChange(v); close(); };

  // Esc closes; the page moving under the sheet closes it too (it is anchored to the pill).
  React.useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    const moved = (e: Event) => { if (!(e.target instanceof Node && listRef.current?.closest('[data-picker-sheet]')?.contains(e.target))) close(false); };
    window.addEventListener('keydown', key);
    window.addEventListener('resize', moved);
    window.addEventListener('scroll', moved, true);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('resize', moved); window.removeEventListener('scroll', moved, true); };
  }, [open, close]);

  const moveFocus = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)') ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[e.key === 'ArrowDown' ? (at + 1) % items.length : at <= 0 ? items.length - 1 : at - 1]?.focus();
  };

  const surface = `picker-${uid}`;
  const radius = open ? 20 : 999;

  return (
    <LayoutGroup id={surface}>
      <button ref={pillRef} type="button" id={id} disabled={disabled} aria-label={ariaLabel ?? prefix} aria-haspopup="listbox" aria-expanded={open}
        aria-invalid={invalid || undefined} className={cn(pillClass, 'text-start', className)}
        onClick={() => (open ? close() : pillRef.current && setPlace(placeUnder(pillRef.current)))}>
        {/* the pill's surface: it travels into the sheet while open and comes back on close */}
        {!open || reduce
          ? <motion.span aria-hidden layoutId={reduce ? undefined : surface} transition={spring} style={{ borderRadius: 999 }} className="pill-bg absolute inset-0 bg-fill transition-colors" />
          : <span aria-hidden className="absolute inset-0 rounded-full bg-fill-strong" />}
        {prefix && <span className="relative shrink-0 text-tertiary">{prefix} ·</span>}
        <span className={cn('relative min-w-0 truncate', !current && 'text-tertiary')}>{current?.label ?? placeholder}</span>
        <ChevronDown aria-hidden className={cn('relative size-3.5 shrink-0 text-tertiary transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && place && (
            <React.Fragment key="sheet">
              <div aria-hidden className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); close(); }} />
              <motion.div
                data-picker-sheet
                layoutId={reduce ? undefined : surface}
                initial={reduce ? { opacity: 0 } : undefined}
                animate={reduce ? { opacity: 1 } : undefined}
                exit={reduce ? { opacity: 0 } : undefined}
                transition={spring}
                style={{ position: 'fixed', left: place.left, width: place.width, top: place.top, bottom: place.bottom, borderRadius: radius }}
                className="hallmark glass z-50 overflow-hidden text-label shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_4px_10px_rgb(0_0_0/0.06),0_18px_44px_-8px_rgb(0_0_0/0.3)]"
              >
                <motion.div
                  initial={{ opacity: 0, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.2, delay: reduce ? 0 : 0.08 } }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  className="flex flex-col gap-2 p-2" onKeyDown={moveFocus}
                >
                  <div className="px-2 pt-1 text-meta font-semibold text-secondary">{title}</div>
                  {withSearch && (
                    <div className="relative">
                      <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5 text-tertiary" />
                      <input autoFocus type="search" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={w.choose + '…'} aria-label={w.choose}
                        className="h-8 w-full rounded-full bg-fill ps-8 pe-3 text-body outline-none placeholder:text-tertiary focus-visible:shadow-[inset_0_0_0_1.5px_var(--tint)]" />
                    </div>
                  )}
                  <div ref={listRef} role="listbox" aria-label={title} style={{ maxHeight: Math.max(160, place.maxH - (withSearch ? 96 : 56)) }} className="hm-grp overflow-y-auto scroll-thin">
                    {shown.map((o) => {
                      const on = o.value === value;
                      return (
                        <button key={o.value} type="button" role="option" aria-selected={on} disabled={o.disabled} autoFocus={!withSearch && on}
                          onClick={() => choose(o.value)}
                          className="flex min-h-10 w-full items-center gap-2 px-3 text-start text-body outline-none transition-colors duration-100 hover:bg-fill focus-visible:bg-fill active:bg-fill-strong disabled:opacity-45 pointer-coarse:min-h-11">
                          {o.avatar && <Avatar user={o.avatar} size="sm" />}
                          <span className={cn('min-w-0 flex-1 truncate', on && 'font-semibold')}>{o.label}</span>
                          {o.hint && <span className="meta shrink-0">{o.hint}</span>}
                          <Check aria-hidden className={cn('size-4 shrink-0 text-tint-text', !on && 'invisible')} />
                        </button>
                      );
                    })}
                    {shown.length === 0 && <div className="px-3 py-2.5 text-tertiary">{w.noMatches}</div>}
                  </div>
                </motion.div>
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </LayoutGroup>
  );
}
