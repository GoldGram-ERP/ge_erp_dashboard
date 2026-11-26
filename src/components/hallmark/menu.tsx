'use client';
// ONE dropdown menu (More actions, Escalate, Outcome, user menu), on animate-ui's Base UI Menu. It grows from the
// control that opened it (transform-origin = trigger) with a critically damped spring and a blur, never a fade.
// Shortcuts are shown in the menu (build note B).
import * as React from 'react';
import { Menu as Root, MenuTrigger, MenuPortal, MenuPositioner, MenuPopup, MenuItem, MenuHighlight, MenuHighlightItem, MenuSeparator, MenuGroupLabel, MenuGroup } from '@/components/animate-ui/primitives/base/menu';
import { cn } from '@/lib/cn';

export type MenuEntry =
  | { label: React.ReactNode; icon?: React.ReactNode; shortcut?: string; onSelect: () => void; disabled?: boolean; danger?: boolean; hint?: React.ReactNode }
  | 'separator'
  | { heading: React.ReactNode };

export function Menu({ trigger, items, align = 'end', label }: { trigger: React.ReactElement; items: MenuEntry[]; align?: 'start' | 'end' | 'center'; label?: string }) {
  return (
    <Root>
      <MenuTrigger render={trigger} aria-label={label} />
      <MenuPortal>
        <MenuPositioner align={align} sideOffset={6} className="z-50">
          <MenuPopup className="hallmark glass min-w-[14rem] origin-[var(--transform-origin)] rounded-2xl bg-[var(--pop)] p-1.5 text-label outline-none">
            <MenuHighlight className="absolute inset-0 z-0 rounded-[10px] bg-fill-strong">
              <MenuGroup>
                {items.map((it, i) => {
                  if (it === 'separator') return <MenuSeparator key={i} className="mx-2 my-1 h-px bg-line" />;
                  if ('heading' in it)
                    return (
                      <MenuGroupLabel key={i} className="px-2.5 pb-1 pt-2 text-meta font-semibold text-tertiary">
                        {it.heading}
                      </MenuGroupLabel>
                    );
                  return (
                    <MenuHighlightItem key={i} disabled={it.disabled}>
                      <MenuItem
                        disabled={it.disabled}
                        onClick={it.onSelect}
                        className={cn(
                          'relative z-[1] flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-[10px] px-2.5 text-body font-medium outline-none [&[data-disabled]:not([data-disabled=false])]:opacity-45 pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-secondary',
                          it.danger && 'text-carnelian [&_svg]:text-carnelian',
                        )}
                      >
                        {it.icon}
                        <span className="flex min-w-0 flex-1 flex-col py-1.5">
                          <span>{it.label}</span>
                          {it.hint && <span className="text-meta font-normal text-tertiary">{it.hint}</span>}
                        </span>
                        {it.shortcut && <kbd className="ms-4 rounded-[5px] bg-fill px-1.5 py-px font-sans text-[0.6875rem] font-semibold text-secondary">{it.shortcut}</kbd>}
                      </MenuItem>
                    </MenuHighlightItem>
                  );
                })}
              </MenuGroup>
            </MenuHighlight>
          </MenuPopup>
        </MenuPositioner>
      </MenuPortal>
    </Root>
  );
}
