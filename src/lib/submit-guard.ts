// The one submit guard (owner, 2026-11-08): when a final action finds missing or wrong fields, the screen shows every field's own warning
// (FieldError, red outline) and then calls this to take the person to the first one: scroll it to the middle and focus its control.
// Call it right after the errors are set; it waits for the render (and for a closed section that opens because of an error).
const MARKS = "[data-err], [aria-invalid='true'], [data-field-error]";
const CONTROL = "input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button.sel-btn, button.dp-btn";

export function revealFirstError(root: ParentNode = document): void {
  if (typeof window === "undefined") return;
  const go = () => {
    const first = root.querySelector<HTMLElement>(MARKS);
    if (!first) return;
    const box = (first.closest("[data-k], .field") as HTMLElement | null) ?? first;
    const control = first.matches(CONTROL) ? first : (box.querySelector<HTMLElement>(CONTROL) ?? null);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    (control ?? box).scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    control?.focus({ preventScroll: true });
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(go));   // two frames: state is committed and a Disclosure has opened
}
