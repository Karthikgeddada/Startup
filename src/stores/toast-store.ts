"use client";

import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id"> & { id?: string }) => void;
  dismiss: (id: string) => void;
}

const DURATION_DEFAULT_MS = 4500;
const MAX_TOASTS = 3;

let toastSeq = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: ({ id, variant, title, description }) => {
    const toastId = id ?? `toast-${Date.now()}-${(toastSeq += 1)}`;
    const toast: Toast = { id: toastId, variant, title, description };
    set({ toasts: [...get().toasts, toast].slice(-MAX_TOASTS) });
    setTimeout(() => get().dismiss(toastId), DURATION_DEFAULT_MS);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Convenience hook: the three toast actions with stable references. */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return {
    success: (title: string, description?: string) => push({ variant: "success", title, description }),
    error: (title: string, description?: string) => push({ variant: "error", title, description }),
    info: (title: string, description?: string) => push({ variant: "info", title, description }),
  };
}
