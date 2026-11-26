// ONE avatar: the person's photo when there is one, otherwise a person icon on a tinted circle — never initials.
// Ported from the GE ticker with plain props (no ticker user type).
import { UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AvatarUser = { id: string; name: string; photoUrl?: string | null };

/** A stable hue per id (stands in for the ticker's avatarColor). */
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 38% 46%)`;
}

export function Avatar({ user, size = 'md', className }: { user: AvatarUser; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const s = size === 'sm' ? 'size-6' : size === 'lg' ? 'size-9' : size === 'xl' ? 'size-14' : 'size-7';
  const icon = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : size === 'xl' ? 'size-8' : 'size-4';
  if (user.photoUrl)
    // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived photo URL, not a static asset
    return <img src={user.photoUrl} alt="" aria-hidden className={cn('shrink-0 rounded-full object-cover', s, className)} />;
  return (
    <span aria-hidden className={cn('inline-grid shrink-0 place-items-center rounded-full text-white', s, className)} style={{ background: avatarColor(user.id) }}>
      <UserRound className={icon} strokeWidth={2} />
    </span>
  );
}

export function AvatarStack({ users, max = 3 }: { users: AvatarUser[]; max?: number }) {
  return (
    <span className="inline-flex items-center">
      {users.slice(0, max).map((u, i) => (
        <Avatar key={u.id} user={u} size="sm" className={cn('ring-2 ring-content', i > 0 && '-ms-1.5')} />
      ))}
    </span>
  );
}
