'use client';
// ONE toast (take race, saved, reconnecting), on the Base UI Toast primitive (animate-ui has no animated toast).
// Toasts rise from the bottom edge and leave the same way; announced politely (13.9).
import * as React from 'react';
import { Toast } from '@base-ui/react/toast';
import { X } from 'lucide-react';

export const toastManager = Toast.createToastManager();

export function toast(title: React.ReactNode, opts: { description?: React.ReactNode; tone?: 'info' | 'error' | 'ok' } = {}) {
  toastManager.add({ title, description: opts.description, type: opts.tone ?? 'info' });
}

function List() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className="hallmark glass pointer-events-auto absolute bottom-0 end-0 flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl bg-[var(--pop)] px-4 py-3 text-label transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] [transform:translateY(calc(var(--toast-index)*-110%))] data-[starting-style]:[transform:translateY(150%)] data-[ending-style]:[transform:translateY(150%)] data-[type=error]:bg-carnelian-b data-[type=error]:text-carnelian"
    >
      <div className="min-w-0 flex-1">
        <Toast.Title className="font-semibold" />
        <Toast.Description className="text-secondary" />
      </div>
      <Toast.Close aria-label="Close" className="grid size-7 place-items-center rounded-full text-secondary hover:bg-fill">
        <X className="size-4" aria-hidden />
      </Toast.Close>
    </Toast.Root>
  ));
}

export function Toaster({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 end-4 z-[60] w-[min(24rem,calc(100vw-2rem))]">
          <List />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
