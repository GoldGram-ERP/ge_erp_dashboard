"use client";
import { useState, useEffect, type ReactNode } from "react";
import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { applyStep } from "@/lib/text-size";
import { useUi } from "@/stores/ui";

// Server state: TanStack Query, persisted in localStorage so a reload paints from the last answers (stale-while-revalidate) and refetches.
export const persister = typeof window === "undefined" ? undefined : createSyncStoragePersister({ storage: window.localStorage, key: "ge-erp:query" });
export const makeClient = () => new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 24 * 3600_000, retry: 1, refetchOnWindowFocus: false, placeholderData: keepPreviousData } },
});

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  const step = useUi((s) => s.textStep);
  useEffect(() => applyStep(step), [step]);
  if (!persister) return <PersistQueryClientProvider client={client} persistOptions={{ persister: { persistClient: async () => {}, restoreClient: async () => undefined, removeClient: async () => {} } }}>{children}</PersistQueryClientProvider>;
  return <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: 24 * 3600_000, buster: "1", dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && q.queryKey[0] !== "todo" } }}>{children}</PersistQueryClientProvider>;
}
