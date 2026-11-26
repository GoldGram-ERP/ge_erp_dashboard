'use client';
// ONE empty state, ONE banner, ONE skeleton, ONE inline error — the four states every screen has (SDD 13.8).
import * as React from 'react';
import { useWords } from './words';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function EmptyState({ title, body, action, icon }: { title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl bg-grouped p-6">
      {icon && <span className="mb-1 grid size-10 place-items-center rounded-xl bg-fill text-secondary [&_svg]:size-5">{icon}</span>}
      <p className="text-title font-bold">{title}</p>
      {body && <p className="max-w-prose text-secondary">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export type BannerTone = 'info' | 'warn' | 'error' | 'dark' | 'ok';
const tones: Record<BannerTone, string> = {
  info: 'bg-lapis-b text-lapis',
  warn: 'bg-amber-b text-amber',
  error: 'bg-carnelian-b text-carnelian',
  dark: 'bg-label text-content',
  ok: 'bg-malachite-b text-malachite',
};
export function Banner({ tone = 'info', children, action, icon, live, className }: { tone?: BannerTone; children: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; live?: boolean; className?: string }) {
  return (
    <div role={live ? 'status' : undefined} aria-live={live ? 'polite' : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-2xl px-4 py-2 font-medium [&_svg]:size-4 [&_svg]:shrink-0', tones[tone], className)}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  const w = useWords();
  return (
    <div role="status" aria-label={w.loading} className={cn('flex flex-col gap-2.5 rounded-2xl bg-grouped p-5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="h-3 animate-pulse rounded-full bg-fill-strong motion-reduce:animate-none" style={{ width: `${[70, 92, 55, 80, 64][i % 5]}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: React.ReactNode }) {
  const w = useWords();
  return (
    <Banner tone="error" action={onRetry && <Button variant="soft" size="sm" className="bg-content" onClick={onRetry}>{w.retry}</Button>}>
      {message ?? w.loadFailed}
    </Banner>
  );
}
