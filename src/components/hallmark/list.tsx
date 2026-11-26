// ONE inset group with rows (inspector, settings, details) and ONE table style (lists).
import * as React from 'react';
import { cn } from '@/lib/cn';

export function Group({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-1.5 flex items-center justify-between px-3">
          {title && <h3 className="text-[0.75rem] font-semibold text-secondary">{title}</h3>}
          {action}
        </div>
      )}
      <div className="hm-grp">{children}</div>
    </section>
  );
}

export function Row({ label, children, className }: { label?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[2.375rem] items-center gap-3 px-3 py-1.5', className)}>
      {label !== undefined && <span className="w-24 shrink-0 text-meta text-tertiary">{label}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PageHeader({ title, sub, actions, chips }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; chips?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {chips && <div className="mb-2 flex flex-wrap items-center gap-2">{chips}</div>}
        <h1 tabIndex={-1} data-page-heading className="text-large font-bold leading-tight outline-none">
          {title}
        </h1>
        {sub && <p className="mt-1 text-secondary">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, count, action }: { children: React.ReactNode; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-title font-bold">
        {children}
        {count !== undefined && <span className="ms-1.5 text-meta font-semibold text-tertiary">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

/** A tappable row inside a `Group`/`.hm-grp` (a list of records): the whole row is one button, it darkens on pointer-down (apple-design §1). */
export function TapRow({ children, onClick, className, ...rest }: { children: React.ReactNode; onClick: () => void; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  return (
    <button type="button" onClick={onClick} {...rest}
      className={cn('flex w-full min-h-[2.75rem] items-center gap-3 px-3 py-2 text-start outline-none transition-colors duration-100 first:rounded-t-[12px] last:rounded-b-[12px] hover:bg-fill focus-visible:bg-fill focus-visible:shadow-[inset_0_0_0_1.5px_var(--tint)] active:bg-fill-strong', className)}>
      {children}
    </button>
  );
}

/** Table style: header row in tertiary, hairlines between rows, rows highlight on hover. */
export function Table({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('hm-grp relative overflow-x-auto', className)}>
      <table className="w-full border-collapse text-start">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" data-sort="none" className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-start text-meta font-semibold text-tertiary">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-line">{children}</tbody>
      </table>
    </div>
  );
}
export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('px-3.5 py-2.5 align-middle', className)}>
      {children}
    </td>
  );
}
