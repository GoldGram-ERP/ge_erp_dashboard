import { create } from "zustand";

type ToastState = { msg: string; error: boolean; n: number; show: (msg: string, error?: boolean) => void; hide: () => void };
export const useToast = create<ToastState>((set) => ({
  msg: "", error: false, n: 0,
  show: (msg, error = false) => set((s) => ({ msg, error, n: s.n + 1 })),
  hide: () => set({ msg: "" }),
}));
export const toast = (msg: string, error = false) => useToast.getState().show(msg, error);
