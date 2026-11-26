"use client";
// Desk two: one progressive-disclosure row (title, a one-line summary of what is inside, a chevron) on Animate UI's Base UI collapsible.
import type { ReactNode } from "react";
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible";
import { Icon } from "@/components/engine";
import "./TwoCollapsible.css";

type Props = { title: string; summary?: ReactNode; defaultOpen?: boolean; invalid?: boolean; id?: string; children: ReactNode };

export function TwoCollapsible({ title, summary, defaultOpen, invalid, id, children }: Props) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="two-co" data-invalid={invalid ? "" : undefined} id={id}>
      <Collapsible.Trigger className="two-co-head">
        <span className="two-co-title">{title}</span>
        {summary ? <span className="two-co-sum">{summary}</span> : null}
        <span className="two-co-chev"><Icon name="back" size={16} /></span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="two-co-panel"><div className="two-co-body">{children}</div></Collapsible.Panel>
    </Collapsible.Root>
  );
}
