"use client";

import { createContext, useContext } from "react";
import { DEFAULT_THRESHOLDS, type PriorityThresholds } from "@/lib/utils/priority";

const PrioritySettingsContext = createContext<PriorityThresholds>(DEFAULT_THRESHOLDS);

export function PrioritySettingsProvider({
  settings,
  children,
}: {
  settings: PriorityThresholds;
  children: React.ReactNode;
}) {
  return (
    <PrioritySettingsContext.Provider value={settings}>
      {children}
    </PrioritySettingsContext.Provider>
  );
}

export function usePrioritySettings(): PriorityThresholds {
  return useContext(PrioritySettingsContext);
}
