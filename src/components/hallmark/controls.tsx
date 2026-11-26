'use client';
// ONE checkbox (24 px, C6), ONE switch, ONE radio group, ONE progress bar — animate-ui Base UI primitives, styled.
import * as React from 'react';
import { Checkbox as CheckboxRoot, CheckboxIndicator } from '@/components/animate-ui/primitives/base/checkbox';
import { Switch as SwitchRoot, SwitchThumb } from '@/components/animate-ui/primitives/base/switch';
import { RadioGroup as RadioRoot, Radio, RadioIndicator } from '@/components/animate-ui/primitives/base/radio';
import { Progress as ProgressRoot, ProgressTrack, ProgressIndicator } from '@/components/animate-ui/primitives/base/progress';
import { cn } from '@/lib/cn';

export function Checkbox({ checked, onChange, label, hint, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean; id?: string }) {
  const auto = React.useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn('flex cursor-pointer items-start gap-2.5 py-1', disabled && 'cursor-default opacity-50')}>
      <CheckboxRoot
        nativeButton // the animate-ui primitive renders a <button>
        id={cid}
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        disabled={disabled}
        className="mt-[-2px] grid size-6 shrink-0 place-items-center rounded-[7px] bg-content text-on-tint shadow-[inset_0_0_0_1.5px_var(--tertiary)] transition-colors data-[checked]:bg-tint data-[checked]:shadow-none"
      >
        <CheckboxIndicator className="size-4" />
      </CheckboxRoot>
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {hint && <span className="meta">{hint}</span>}
      </span>
    </label>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean }) {
  const id = React.useId();
  return (
    <div className="flex items-center gap-3">
      <span className="flex flex-1 flex-col">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {hint && <span className="meta">{hint}</span>}
      </span>
      <SwitchRoot
        id={id}
        nativeButton // the animate-ui primitive renders a <button>
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        disabled={disabled}
        className="relative flex h-[1.875rem] w-[3.125rem] shrink-0 items-center rounded-full bg-fill-strong px-[3px] data-[checked]:justify-end data-[checked]:bg-[#3E8E56] data-[unchecked]:justify-start"
      >
        <SwitchThumb className="size-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" />
      </SwitchRoot>
    </div>
  );
}

export function RadioGroup<T extends string>({ value, onChange, options, label }: { value: T | null; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean }[]; label: string }) {
  return (
    <RadioRoot aria-label={label} value={value} onValueChange={(v) => onChange(v as T)} className="flex flex-col gap-1">
      {options.map((o) => (
        <label key={o.value} className={cn('flex cursor-pointer items-start gap-2.5 rounded-xl px-1 py-1.5', o.disabled && 'cursor-default opacity-50')}>
          <Radio value={o.value} disabled={o.disabled} className="mt-[-1px] grid size-[1.375rem] shrink-0 place-items-center rounded-full bg-content shadow-[inset_0_0_0_1.5px_var(--tertiary)] data-[checked]:shadow-[inset_0_0_0_1.5px_var(--tint-text)]">
            <RadioIndicator className="size-2.5 rounded-full bg-tint-text" />
          </Radio>
          <span className="flex flex-col">
            <span className="font-medium">{o.label}</span>
            {o.hint && <span className="meta">{o.hint}</span>}
          </span>
        </label>
      ))}
    </RadioRoot>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <ProgressRoot value={value} aria-label={label}>
      <ProgressTrack className="h-1 w-full overflow-hidden rounded-full bg-fill-strong">
        <ProgressIndicator className="h-full rounded-full bg-tint" />
      </ProgressTrack>
    </ProgressRoot>
  );
}
