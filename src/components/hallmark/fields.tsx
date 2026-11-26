'use client';
// ONE hm-field wrapper (label, hint, error), text input, text area, Select and Combobox — ported from the GE ticker.
// Select and Combobox are Base UI primitives (animate-ui has no animated Select/Combobox), styled here.
// The ticker's PersonPicker became Combobox with plain options (an optional avatar per option).
import * as React from 'react';
import { Picker } from './picker';
import { cn } from '@/lib/cn';
import { Avatar, type AvatarUser } from './avatar';
import { useWords } from './words';

export function Field({ label, hint, error, required, children, htmlFor, className, optional }: { label: React.ReactNode; hint?: React.ReactNode; error?: string; required?: boolean; optional?: boolean; children: React.ReactNode; htmlFor?: string; className?: string }) {
  const w = useWords();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-body font-semibold text-label">
        {label}
        {required && <span className="ms-0.5 text-danger" aria-hidden>*</span>}
        {optional && <span className="ms-1.5 font-normal text-tertiary">{w.optional}</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="meta">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} dir="auto" className={cn('hm-field', className)} {...p} />;
});
export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...p }, ref) {
  return <textarea ref={ref} dir="auto" className={cn('hm-field', className)} {...p} />;
});

// `hallmark` on the popup: it is portalled out of the page root and needs the roles itself.

export type Option = { value: string; label: string; hint?: string; disabled?: boolean };

// Choosing from a list: one component, the Picker (a pill that drops an animated sheet from itself). Select and
// Combobox keep their props and delegate to it; Combobox always has the search field.
export function Select(p: { id?: string; value: string | null; onChange: (v: string) => void; options: Option[]; placeholder?: string; invalid?: boolean; disabled?: boolean; ariaLabel?: string; className?: string; prefix?: string }) {
  return <Picker {...p} />;
}

export type ComboOption = Option & { avatar?: AvatarUser };

/** Type to pick one of many (the ticker's person picker, with plain options). */
export function Combobox({ id, options, value, onChange, placeholder, invalid }: { id?: string; options: ComboOption[]; value: string | null; onChange: (v: string | null) => void; placeholder?: string; invalid?: boolean }) {
  return <Picker id={id} options={options} value={value} onChange={onChange} placeholder={placeholder} invalid={invalid} searchable />;
}
