"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { qk, useCredits, usePlans, useSubscription } from "@/lib/api/hooks";
import {
  CHECKOUT_MAX_AGE_MS,
  checkoutResult,
  clearPendingCheckout,
  readPendingCheckout,
  subscribePendingCheckout,
  type PendingCheckout,
} from "@/lib/checkout";
import { toast } from "./toast";

const POLL_MS = 4000;

/** The checkout this app is waiting on, if any. Shared by every window through localStorage. */
export function usePendingCheckout(): PendingCheckout | null {
  return useSyncExternalStore(subscribePendingCheckout, readPendingCheckout, () => null);
}

/**
 * After a Polar checkout, asks the backend every few seconds whether the payment has landed
 * (there is no live event for a plan change), then confirms it and stops.
 */
export function CheckoutWatcher() {
  const qc = useQueryClient();
  const pending = usePendingCheckout();
  // Asked for only while a checkout is waiting; the rest of the time the watcher costs nothing.
  const watching = pending !== null;
  const subscription = useSubscription(watching);
  const credits = useCredits(watching);
  const plans = usePlans(watching);

  useEffect(() => {
    if (!pending) return;
    const refresh = () => {
      if (Date.now() - new Date(pending.startedAt).getTime() > CHECKOUT_MAX_AGE_MS) {
        clearPendingCheckout();
        return;
      }
      void qc.invalidateQueries({ queryKey: qk.subscription });
      void qc.invalidateQueries({ queryKey: qk.credits });
      void qc.invalidateQueries({ queryKey: qk.me });
    };
    const timer = window.setInterval(refresh, POLL_MS);
    // Coming back to this tab is the likeliest moment for it to be done.
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [pending, qc]);

  const result = pending ? checkoutResult(pending, { subscription: subscription.data, credits: credits.data, plans: plans.data?.plans }) : null;
  useEffect(() => {
    if (!result) return;
    clearPendingCheckout();
    toast(result);
    void qc.invalidateQueries({ queryKey: qk.ledger });
    void qc.invalidateQueries({ queryKey: qk.activity });
  }, [result, qc]);

  return null;
}
