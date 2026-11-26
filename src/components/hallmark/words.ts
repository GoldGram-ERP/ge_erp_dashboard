'use client';
// The few words the kit itself says (the ticker took them from its own `common` messages). Arabic in masri.
import { useLocale } from 'next-intl';

const W = {
  ar: { optional: 'اختياري', loading: 'بيحمّل', retry: 'جرّب تاني', loadFailed: 'ماعرفناش نحمّل، جرّب تاني', close: 'اقفل', noMatches: 'مفيش نتايج', choose: 'اختار', clear: 'امسح' },
  en: { optional: 'Optional', loading: 'Loading', retry: 'Try again', loadFailed: "Couldn't load. Try again", close: 'Close', noMatches: 'No matches', choose: 'Choose', clear: 'Clear' },
} as const;

export function useWords() {
  return useLocale() === 'ar' ? W.ar : W.en;
}
