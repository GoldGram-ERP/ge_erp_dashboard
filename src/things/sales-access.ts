"use client";
import { useMe } from "@/lib/session";
import type { Access } from "@/components/engine";

/** The engine's `access` for a page: a view/chip/button shows when the person holds any of its screen keys. */
export function useAccess(): Access {
  const { data: me } = useMe();
  return { canOpen: (keys) => !keys || keys.length === 0 || keys.some((k) => me?.screens.includes(k)), isSuper: me?.userType === "super_admin" };
}
