"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { usePendingCheckout } from "@/components/checkout-watcher";
import { Spinner } from "@/components/ui";
import { qk } from "@/lib/api/hooks";
import { PRICING_PATH } from "@/lib/pricing";

/**
 * Polar sends the browser back to /billing?checkout=done, which lands on Pricing. The payment is
 * real at that point, but the plan only changes when Polar's webhook reaches the backend, so say
 * so and keep asking for a little while. Reads the query, so it sits in a Suspense boundary.
 */
export function CheckoutReturn() {
  const qc = useQueryClient();
  const router = useRouter();
  const done = useSearchParams().get("checkout") === "done";
  const pending = usePendingCheckout();

  useEffect(() => {
    if (!done) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: qk.subscription });
      void qc.invalidateQueries({ queryKey: qk.credits });
      void qc.invalidateQueries({ queryKey: qk.me });
    };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    // By now the webhook has almost always arrived; stop asking and tidy the address.
    const stop = window.setTimeout(() => router.replace(PRICING_PATH), 45_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [done, qc, router]);

  // Once the watcher has confirmed the payment (and cleared it), the banner has done its job.
  useEffect(() => {
    if (done && !pending) {
      const tidy = window.setTimeout(() => router.replace(PRICING_PATH), 6000);
      return () => window.clearTimeout(tidy);
    }
  }, [done, pending, router]);

  if (!done) return null;
  return (
    <p role="status" className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px]">
      <Spinner size={14} className="shrink-0 text-accent" />
      <span>
        <strong className="font-semibold">Payment received.</strong> Your plan and credits update here as soon as Polar confirms it, usually within a few
        seconds.
      </span>
    </p>
  );
}
