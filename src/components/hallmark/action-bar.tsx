// ONE sticky bottom action bar for every action that finalizes a page, at every width (owner, 2026-11-25).
// A floating capsule centred at the bottom that hugs its content (no empty stretch between the total and the pills)
// and grows or shrinks from the middle when its content changes (apple-design §4: a critically damped spring, no overshoot).
// Translucent material (the kit's glass) with safe-area spacing; solid under prefers-reduced-transparency (the `.glass` rule);
// under prefers-reduced-motion the size change is instant.
'use client';
import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

export function ActionBar({ summary, children, className, label }: { summary?: React.ReactNode; children: React.ReactNode; className?: string; label?: string }) {
  const reduce = useReducedMotion();
  return (
    <div role="region" aria-label={label} className={cn('pointer-events-none sticky bottom-0 z-30 mt-4 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]', className)}>
      <motion.div
        layout={!reduce}
        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
        style={{ borderRadius: 999 }}
        className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 py-1.5 ps-4 pe-1.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_2px_6px_rgb(0_0_0/0.08),0_12px_32px_-6px_rgb(0_0_0/0.28)]"
      >
        {summary != null && <motion.div layout={!reduce ? 'position' : false} className="min-w-0">{summary}</motion.div>}
        <motion.div layout={!reduce ? 'position' : false} className="flex flex-wrap items-center gap-1.5">{children}</motion.div>
      </motion.div>
    </div>
  );
}
