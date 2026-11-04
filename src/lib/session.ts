"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure } from "@/lib/api";
import { useSession } from "@/stores/session";
import type { Me } from "@/stores/ui";

export const fetchMe = () => api<Me>("/access/me");

// The signed-in person. Starts from the server's answer (initial) or the remembered one, and re-checks in the background.
export function useMe(initial?: Me) {
  const remembered = useSession((s) => s.me);
  const q = useQuery({ queryKey: ["me"], queryFn: async () => { const me = await fetchMe(); useSession.getState().setMe(me); return me; }, initialData: initial ?? remembered ?? undefined, staleTime: 60_000, retry: (n, e) => !(e instanceof ApiFailure && e.status === 401) && n < 1 });
  return q;
}
export const isSuper = (me?: Me | null) => me?.userType === "super_admin";

// Clears everything remembered about the person (also the persisted query cache).
export function useForgetMe() {
  const qc = useQueryClient();
  return () => { useSession.getState().setMe(null); qc.clear(); try { localStorage.removeItem("ge-erp:query"); localStorage.removeItem("ge-erp:session-lock"); } catch { /* private mode */ } };
}
