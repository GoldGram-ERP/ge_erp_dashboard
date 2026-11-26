'use client';
// ONE chip. Status and state chips are the same component with a tone; colour never stands alone,
// every chip carries a word (Hallmark "gem statuses"). Ported from the GE ticker; its data-bound chips are dropped.
import * as React from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'lapis' | 'faience' | 'amber' | 'amethyst' | 'malachite' | 'carnelian' | 'basalt' | 'neutral' | 'ink' | 'gold';
const tones: Record<Tone, string> = {
  lapis: 'bg-lapis-b text-lapis',
  faience: 'bg-faience-b text-faience',
  amber: 'bg-amber-b text-amber',
  amethyst: 'bg-amethyst-b text-amethyst',
  malachite: 'bg-malachite-b text-malachite',
  carnelian: 'bg-carnelian-b text-carnelian',
  basalt: 'bg-basalt-b text-basalt',
  neutral: 'bg-fill text-label',
  ink: 'bg-label text-content',
  gold: 'bg-tint text-on-tint',
};

export function Chip({ tone = 'neutral', icon, children, className, title }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex min-h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-meta font-semibold leading-none [&_svg]:size-3.5', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
