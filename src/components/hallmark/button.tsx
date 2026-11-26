'use client';
// ONE button set for the app: capsule buttons and icon buttons (Hallmark `.cap`). Feedback is on press
// (scale .97 in 100 ms on pointer-down, apple-design §1); 44 px targets on touch pointers.
import * as React from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { LoaderCircle } from 'lucide-react';

export type ButtonVariant = 'plain' | 'soft' | 'primary' | 'danger' | 'quiet';
type Common = {
  variant?: ButtonVariant;
  size?: 'md' | 'sm' | 'lg';
  icon?: React.ReactNode;
  /** Icon-only button: `label` becomes the accessible name and tooltip. */
  iconOnly?: boolean;
  label?: string;
  pending?: boolean;
  shortcut?: string;
  className?: string;
  children?: React.ReactNode;
};

const base =
  'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium leading-none transition-[transform,background-color] duration-100 ease-out active:scale-[.97] disabled:active:scale-100 disabled:opacity-45 pointer-coarse:min-h-11 pointer-coarse:px-4 [&_svg]:size-4 [&_svg]:shrink-0';
const sizes = { sm: 'min-h-7 px-2.5 text-meta', md: 'min-h-8 px-3.5 text-body', lg: 'min-h-10 px-5 text-[0.9375rem]' };
const iconSizes = { sm: 'size-7', md: 'size-8', lg: 'size-10' };
const variants: Record<ButtonVariant, string> = {
  plain: 'bg-transparent text-label hover:bg-fill',
  quiet: 'bg-transparent text-secondary hover:bg-fill hover:text-label',
  soft: 'bg-fill text-label hover:bg-fill-strong',
  primary:
    'bg-tint text-on-tint font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_1px_2px_rgba(110,78,0,.25)] hover:bg-[var(--tint-hover)]',
  danger: 'bg-carnelian-b text-carnelian font-semibold hover:brightness-95',
};

export function buttonClass({ variant = 'plain', size = 'md', iconOnly, className }: Pick<Common, 'variant' | 'size' | 'iconOnly' | 'className'>) {
  return cn(base, iconOnly ? cn(iconSizes[size], 'p-0 pointer-coarse:size-11 pointer-coarse:px-0') : sizes[size], variants[variant], className);
}

function Inner({ icon, iconOnly, pending, children, shortcut }: Common) {
  return (
    <>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {!iconOnly && children}
      {shortcut && !iconOnly && <kbd className="ms-1 rounded-[5px] bg-fill px-1.5 py-px text-[0.6875rem] font-semibold text-secondary">{shortcut}</kbd>}
    </>
  );
}

export type ButtonProps = Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, iconOnly, label, pending, shortcut, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={buttonClass({ variant, size, iconOnly, className })}
      {...rest}
    >
      <Inner icon={icon} iconOnly={iconOnly} pending={pending} shortcut={shortcut}>
        {children}
      </Inner>
    </button>
  );
});

export function ButtonLink({ href, variant, size, icon, iconOnly, label, className, children, ...rest }: Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'>) {
  return (
    <Link href={href} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} className={buttonClass({ variant, size, iconOnly, className })} {...rest}>
      <Inner icon={icon} iconOnly={iconOnly}>
        {children}
      </Inner>
    </Link>
  );
}
