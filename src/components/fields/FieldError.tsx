import type { ReactNode } from "react";

/** The one per-field warning: red text under its control, announced to screen readers, found by the submit guard (lib/submit-guard.ts). Every screen renders this, never its own `<div className="err">`. */
export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return <div className="err" id={id} role="alert" data-field-error>{children}</div>;
}
