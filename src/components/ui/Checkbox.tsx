"use client";
import { useEffect, useRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";

type InputRest = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange" | "role">;

/** The bare checkbox box (16 px, gold check, soft focus ring: see the checkbox skin in globals.css). For a screen that lays out its own label; otherwise use Checkbox. */
export function CheckInput({ checked, onChange, indeterminate = false, ...rest }: { checked: boolean; onChange: (checked: boolean) => void; indeterminate?: boolean } & InputRest) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />;
}

/** The one checkbox with its label. Never a bare <input type="checkbox"> in a screen (the library ratchet test fails on it). */
export function Checkbox({ checked, onChange, children, className = "", style, indeterminate, ...rest }: { checked: boolean; onChange: (checked: boolean) => void; children?: ReactNode; className?: string; style?: CSSProperties; indeterminate?: boolean } & InputRest) {
  return (
    <label className={`chk${className ? ` ${className}` : ""}`} htmlFor={rest.id} style={style}>
      <CheckInput checked={checked} onChange={onChange} indeterminate={indeterminate} {...rest} />
      {children !== undefined && <span>{children}</span>}
    </label>
  );
}

/** The bare toggle (28 x 16, green when on, beige when off). Same rule as CheckInput: screens never write <input role="switch">. */
export function SwitchInput({ checked, onChange, ...rest }: { checked: boolean; onChange: (checked: boolean) => void } & InputRest) {
  return <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />;
}

/** The one toggle with its label: every yes-no setting (never a checkbox for an on/off choice; a checkbox is only for picking rows or items out of a list). */
export function Toggle({ checked, onChange, children, className = "", style, ...rest }: { checked: boolean; onChange: (checked: boolean) => void; children?: ReactNode; className?: string; style?: CSSProperties } & InputRest) {
  return (
    <label className={`chk${className ? ` ${className}` : ""}`} htmlFor={rest.id} style={style}>
      <SwitchInput checked={checked} onChange={onChange} {...rest} />
      {children !== undefined && <span>{children}</span>}
    </label>
  );
}
