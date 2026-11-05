import type { HTMLAttributes, ReactNode } from "react";

/** The one bubble: a small rounded label (`.pill`). Never write a span with your own pill class. */
export function Badge({ children, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return <span className="pill" {...rest}>{children}</span>;
}

/** The one status chip: a dot and a label in one of four tones (`.st`). */
export function Status({ tone = "off", children, ...rest }: { tone?: "good" | "warn" | "info" | "off"; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={`st ${tone}`} {...rest}><i />{children}</span>;
}

/** The one card section (`.bubble`): a badge title on top, then content. */
export function Bubble({ title, children, className = "", ...rest }: { title?: ReactNode; children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return <section className={`bubble${className ? ` ${className}` : ""}`} {...rest}>{title !== undefined && <Badge>{title}</Badge>}{children}</section>;
}
