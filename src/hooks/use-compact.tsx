'use client';
import * as React from 'react';

const QUERY = '(max-width: 699px)';
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/**
 * Compact size class (< 700 px, Hallmark size classes). Read straight from the media query (no state set in an effect):
 * every Person and Sheet uses this, and a set-state-on-mount version made each newly mounted one update once more, so
 * crossing 700 px on a page with many avatars chained dozens of updates (React error #185 under load).
 */
export function useCompact() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
