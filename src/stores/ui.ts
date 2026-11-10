"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Per-browser interface state. The head script in the locale layout reads this key before paint (collapsed, textStep): keep the shape.
export type Me = {
  id: string; name: string; username: string; userType: "user" | "admin" | "super_admin"; branchId?: string | null;
  screens: string[]; jobs?: string[]; mustChangePassword?: boolean; actions?: string[]; businessRole?: string | null; userCode?: number | null;
  salesChannels?: { id: string; name: string }[];
};
type Recent = { id: string; at: number };
type UiState = {
  collapsed: boolean; openGroups: string[]; textStep: number; lastRoute: string;
  pins: Record<string, string[]>; recents: Record<string, Recent[]>;
  setCollapsed: (v: boolean) => void; toggleGroup: (id: string) => void; setGroups: (ids: string[]) => void;
  setTextStep: (i: number) => void; setLastRoute: (r: string) => void;
  togglePin: (userId: string, route: string) => void; recordRecent: (userId: string, route: string) => void;
};
export const UI_KEY = "ge-erp:ui";
export const useUi = create<UiState>()(persist((set) => ({
  collapsed: false, openGroups: ["pins", "sales"], textStep: 1, lastRoute: "",
  pins: {}, recents: {},
  setCollapsed: (collapsed) => set({ collapsed }),
  toggleGroup: (id) => set((s) => ({ openGroups: s.openGroups.includes(id) ? s.openGroups.filter((x) => x !== id) : [...s.openGroups, id] })),
  setGroups: (openGroups) => set({ openGroups }),
  setTextStep: (i) => set({ textStep: Math.max(0, Math.min(4, i)) }),
  setLastRoute: (lastRoute) => set({ lastRoute }),
  togglePin: (u, route) => set((s) => { const p = s.pins[u] ?? []; return { pins: { ...s.pins, [u]: p.includes(route) ? p.filter((x) => x !== route) : [...p, route] } }; }),
  recordRecent: (u, route) => set((s) => ({ recents: { ...s.recents, [u]: [{ id: route, at: Date.now() }, ...(s.recents[u] ?? []).filter((r) => r.id !== route)].slice(0, 5) } })),
}), { name: UI_KEY, partialize: (s) => ({ collapsed: s.collapsed, openGroups: s.openGroups, textStep: s.textStep, lastRoute: s.lastRoute, pins: s.pins, recents: s.recents }) }));
