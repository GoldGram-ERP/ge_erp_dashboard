'use client';
// Compact filter inputs (owner, 2026-11-25: "make the board filters compact pills too"): the same 32 px pill as the
// Picker, hugging a sensible width, no box border. `PillInput` is one text/search field with an optional icon,
// prefix and unit inside the pill; `RangePill` is a from–to pair in ONE pill («الوزن 1 – 5 جم»).
// Focus shows the tint ring on the whole pill; an invalid value shows the danger ring.
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWords } from './words';

const shell =
  'relative inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-fill ps-3 pe-2 text-body text-label transition-colors duration-150 hover:bg-fill-strong focus-within:bg-fill focus-within:shadow-[inset_0_0_0_1.5px_var(--tint)] has-[[aria-invalid=true]]:shadow-[inset_0_0_0_1.5px_var(--danger)]';
const bare = 'min-w-0 flex-1 bg-transparent outline-none placeholder:text-tertiary [&::-webkit-search-cancel-button]:hidden';

export function PillInput({ value, onChange, placeholder, ariaLabel, search, prefix, unit, width = '14rem', invalid, inputMode, dir, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel: string; search?: boolean; prefix?: string; unit?: string;
  width?: string; invalid?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; dir?: 'ltr' | 'rtl' | 'auto'; className?: string;
}) {
  const w = useWords();
  return (
    <label className={cn(shell, className)} style={{ width }}>
      {search && <Search aria-hidden className="size-3.5 shrink-0 text-tertiary" />}
      {prefix && <span className="shrink-0 text-tertiary">{prefix}</span>}
      <input type={search ? 'search' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel}
        aria-invalid={invalid || undefined} inputMode={inputMode} dir={dir ?? 'auto'} className={bare} />
      {unit && <span className="shrink-0 text-tertiary">{unit}</span>}
      {search && value && (
        <button type="button" aria-label={w.close} onClick={() => onChange('')}
          className="grid size-5 shrink-0 place-items-center rounded-full bg-fill-strong text-secondary transition-transform active:scale-[.9]">
          <X aria-hidden className="size-3" />
        </button>
      )}
    </label>
  );
}

export function RangePill({ label, from, to, onFrom, onTo, fromLabel, toLabel, unit, invalid, className }: {
  label: string; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void;
  fromLabel: string; toLabel: string; unit?: string; invalid?: boolean; className?: string;
}) {
  const num = 'w-[3.25rem] bg-transparent text-center tabular-nums outline-none placeholder:text-tertiary';
  return (
    <div role="group" aria-label={label} className={cn(shell, 'w-fit', className)}>
      <span className="shrink-0 text-tertiary">{label}</span>
      <input inputMode="decimal" dir="ltr" value={from} onChange={(e) => onFrom(e.target.value)} placeholder="0" aria-label={fromLabel} aria-invalid={invalid || undefined} className={num} />
      <span aria-hidden className="text-tertiary">–</span>
      <input inputMode="decimal" dir="ltr" value={to} onChange={(e) => onTo(e.target.value)} placeholder="∞" aria-label={toLabel} aria-invalid={invalid || undefined} className={num} />
      {unit && <span className="shrink-0 text-tertiary">{unit}</span>}
    </div>
  );
}
