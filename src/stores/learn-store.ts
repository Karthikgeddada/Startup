"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Learn-domain UI state: the domain the user last viewed. Persisted so the
 * Learn experience reopens where the user left off.
 */
interface LearnState {
  activeDomainId: string | null;
  setActiveDomain: (domainId: string | null) => void;
}

export const useLearnStore = create<LearnState>()(
  persist(
    (set) => ({
      activeDomainId: null,
      setActiveDomain: (domainId) => set({ activeDomainId: domainId }),
    }),
    {
      name: "curvin-learn",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
