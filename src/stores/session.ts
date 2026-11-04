"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Me } from "./ui";

// The last /access/me answer, shown at once on the next load and re-checked (stale-while-revalidate). No password or token: the session is an HttpOnly cookie.
type SessionState = { me: Me | null; setMe: (me: Me | null) => void };
export const useSession = create<SessionState>()(persist((set) => ({ me: null, setMe: (me) => set({ me }) }), { name: "ge-erp:me" }));
