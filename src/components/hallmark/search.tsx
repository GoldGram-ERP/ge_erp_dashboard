'use client';
// ONE search field: a compact 32 px pill that hugs ~16rem, a magnifier inside it, a clear cross once something is typed.
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWords } from './words';

export function SearchPill({ value, onChange, placeholder, label, id, className }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; id?: string; className?: string }) {
  const w = useWords();
  return (
    <label className={cn('relative inline-flex h-8 w-[16rem] max-w-full items-center rounded-full bg-fill transition-colors focus-within:shadow-[inset_0_0_0_1.5px_var(--tint)] hover:bg-fill-strong pointer-coarse:h-11', className)}>
      <Search aria-hidden className="pointer-events-none absolute start-2.5 size-3.5 text-tertiary" />
      <input id={id} type="search" dir="auto" autoComplete="off" value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)}
        className="h-full w-full min-w-0 rounded-full bg-transparent ps-8 pe-8 text-body text-label outline-none placeholder:text-tertiary [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" aria-label={w.clear} title={w.clear} onClick={() => onChange('')}
          className="absolute end-1.5 grid size-5 place-items-center rounded-full bg-fill-strong text-secondary transition-transform duration-100 active:scale-90 after:absolute after:-inset-2 after:content-['']">
          <X aria-hidden className="size-3" />
        </button>
      )}
    </label>
  );
}
