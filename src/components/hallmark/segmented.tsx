'use client';
// ONE segmented control (language, filters, composer mode, priority, theme). Built on animate-ui's Base UI
// ToggleGroup with its Highlight: the selection pill springs from where it is now (interruptible), never fades.
// A segmented control only changes state; it never navigates or remounts the page.
import * as React from 'react';
import { Toggle, ToggleGroup, ToggleGroupHighlight, ToggleHighlight } from '@/components/animate-ui/primitives/base/toggle-group';
import { cn } from '@/lib/cn';

export type SegOption<T extends string> = { value: T; label: React.ReactNode; icon?: React.ReactNode; ariaLabel?: string };

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  stretch,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  stretch?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v: unknown[]) => {
        const next = v[0] as T | undefined;
        if (next) onChange(next); // a segmented control always has one selection
      }}
      className={cn('relative inline-flex items-center rounded-full bg-fill p-[3px]', stretch && 'flex w-full', className)}
    >
      <ToggleGroupHighlight
        className="rounded-full bg-content shadow-[0_1px_3px_rgba(60,48,20,.2)] dark:bg-[rgba(255,240,200,.18)] dark:shadow-none"
        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
      >
        {options.map((o) => (
          <ToggleHighlight key={o.value} value={o.value} className={cn(stretch && 'flex-1')}>
            <Toggle
              value={o.value}
              aria-label={o.ariaLabel}
              className={cn(
                'relative z-[1] inline-flex items-center justify-center gap-1.5 rounded-full px-3 font-medium text-secondary transition-colors data-[pressed]:font-semibold data-[pressed]:text-label pointer-coarse:min-h-11 [&_svg]:size-4',
                size === 'sm' ? 'min-h-7 text-meta' : 'min-h-[1.875rem] text-body',
                stretch && 'flex-1',
              )}
            >
              {o.icon}
              {o.label}
            </Toggle>
          </ToggleHighlight>
        ))}
      </ToggleGroupHighlight>
    </ToggleGroup>
  );
}
