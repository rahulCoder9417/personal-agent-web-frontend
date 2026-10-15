"use client";

import { useSyncExternalStore } from "react";
import type { AuthMode } from "./auth-mode";
import { isOnboardedHere, subscribeOnboardedHere } from "./onboarded-here";

/**
 * Whether this browser has the note that the signed-in account finished or skipped the welcome
 * flow (src/lib/onboarded-here.ts). False while the page is drawn ahead and while it hydrates
 * (there is no browser there), then read straight away.
 */
export function useOnboardedHere(mode: AuthMode): boolean {
  return useSyncExternalStore(subscribeOnboardedHere, () => isOnboardedHere(mode), () => false);
}
