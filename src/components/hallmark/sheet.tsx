'use client';
// ONE panel-over-the-page component, on animate-ui's Base UI Dialog:
//  - kind="dialog": centred, with scrim; it materialises (scale + blur, critically damped spring). On compact width it
//    becomes a bottom sheet that rises from the bottom edge and leaves the same way.
//  - kind="side": a side sheet from the inline end (inspector on regular width); leaves along the same path.
// No opacity fade on the panel itself (owner rule); only the scrim fades. Focus is trapped and returned (13.9).
import * as React from 'react';
import { Dialog, DialogBackdrop, DialogClose, DialogDescription, DialogPopup, DialogPortal, DialogTitle } from '@/components/animate-ui/primitives/base/dialog';
import { X } from 'lucide-react';
import { useWords } from './words';
import { cn } from '@/lib/cn';
import { useCompact } from '@/hooks/use-compact';

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  kind = 'dialog',
  width = 'md',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  kind?: 'dialog' | 'side';
  width?: 'sm' | 'md' | 'lg';
}) {
  const words = useWords();
  const compact = useCompact();
  const from = kind === 'side' ? 'end' : compact ? 'bottom' : 'center';
  const w = width === 'sm' ? 'sm:w-[26rem]' : width === 'lg' ? 'sm:w-[40rem]' : 'sm:w-[33rem]';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogPortal>
            <DialogBackdrop className="hallmark fixed inset-0 z-40 bg-[var(--scrim)]" />
            <DialogPopup
              from={from}
              className={cn(
                'hallmark fixed z-50 flex max-h-[min(90dvh,52rem)] flex-col bg-content text-label shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(40,30,10,.25)] outline-none',
                from === 'center' && cn('start-1/2 top-[8vh] w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[22px] rtl:translate-x-1/2', w),
                from === 'bottom' && 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[22px] pb-[env(safe-area-inset-bottom)]',
                from === 'end' && 'inset-y-2 end-2 max-h-none w-[min(26rem,calc(100vw-1rem))] rounded-[20px]',
              )}
            >
              <div className="flex items-start gap-3 px-6 pb-2 pt-5">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-title font-bold leading-tight">{title}</DialogTitle>
                  {description && <DialogDescription className="mt-1 text-secondary">{description}</DialogDescription>}
                </div>
                <DialogClose aria-label={words.close} className="grid size-8 shrink-0 place-items-center rounded-full bg-fill text-secondary transition-transform duration-100 active:scale-[.97] pointer-coarse:size-11 [&_svg]:size-4">
                  <X aria-hidden />
                </DialogClose>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 scroll-thin">{children}</div>
              {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-6 pb-5 pt-2">{footer}</div>}
            </DialogPopup>
          </DialogPortal>
    </Dialog>
  );
}
