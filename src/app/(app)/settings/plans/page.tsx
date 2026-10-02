"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { usePendingCheckout } from "@/components/checkout-watcher";
import { PageBody } from "@/components/page";
import { PlanColumns } from "@/components/settings/plans-columns";
import { SubscriptionCard } from "@/components/settings/plans-subscription";
import { ErrorState, Spinner } from "@/components/ui";
import { qk, usePlans, useSubscription } from "@/lib/api/hooks";

const NOTES = [
  {
    label: "1 credit ≈ 1 cent",
    body: "Credits cover the time Tex spends working and paid tools, and the AI too unless it runs on your own key or Claude plan.",
  },
  {
    label: "Credits last 90 days",
    body: "From the day you get them, whether from your plan, a top-up or a code. The oldest are used first.",
  },
];

/**
 * Polar sends the browser back to /billing?checkout=done, which lands here. The payment is real
 * at that point, but the plan only changes when Polar's webhook reaches the backend, so say so
 * and keep asking for a little while.
 */
function CheckoutReturn() {
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
    const stop = window.setTimeout(() => router.replace("/settings/plans"), 45_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [done, qc, router]);

  // Once the watcher has confirmed the payment (and cleared it), the banner has done its job.
  useEffect(() => {
    if (done && !pending) {
      const tidy = window.setTimeout(() => router.replace("/settings/plans"), 6000);
      return () => window.clearTimeout(tidy);
    }
  }, [done, pending, router]);

  if (!done) return null;
  return (
    <p role="status" className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px]">
      <Spinner size={14} className="text-accent" />
      <span>
        <strong className="font-semibold">Payment received.</strong> Your plan and credits update here as soon as Polar confirms it, usually within a few
        seconds.
      </span>
    </p>
  );
}

export default function PlansPage() {
  const plans = usePlans();
  const subscription = useSubscription();

  if (plans.isError) {
    return (
      <PageBody>
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      </PageBody>
    );
  }
  if (subscription.isError) {
    return (
      <PageBody>
        <ErrorState error={subscription.error} onRetry={() => subscription.refetch()} />
      </PageBody>
    );
  }

  if (plans.isPending || subscription.isPending) {
    return (
      <PageBody>
        <div aria-hidden className="h-[104px] animate-pulse rounded-xl bg-surface-2" />
        <div aria-hidden className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[340px] animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </PageBody>
    );
  }

  const plan = plans.data.plans.find((p) => p.id === subscription.data.plan);

  return (
    <PageBody>
      {/* Reads ?checkout= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <CheckoutReturn />
      </Suspense>

      <SubscriptionCard subscription={subscription.data} plan={plan} />

      <PlanColumns plans={plans.data.plans} topUps={plans.data.topUps} subscription={subscription.data} />

      <p className="flex items-start gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-[13.5px] text-accent-dark">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-[2px] shrink-0">
          <path d="M4 12.5V5.5a1.5 1.5 0 0 1 1.5-1.5h7L20 11.5 12.5 19 4 12.5Z" />
          <path d="M8.5 8.5h.01" />
        </svg>
        <span>Waitlist members get 50% off their first month of Pro or Max. If it applies to you, checkout shows it before you pay.</span>
      </p>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-x-6 gap-y-4 border-t border-line pt-5">
        {NOTES.map((note) => (
          <div key={note.label} className="flex flex-col gap-1">
            <dt className="text-[12px] font-medium">{note.label}</dt>
            <dd className="text-[13px] text-muted">{note.body}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <dt className="text-[12px] font-medium">No surprise bills</dt>
          <dd className="text-[13px] text-muted">
            At zero, Tex pauses and tells you in chat.{" "}
            <Link href="/settings/credits" className="font-medium text-accent hover:text-accent-dark">
              Buy a top-up
            </Link>{" "}
            to carry on.
          </dd>
        </div>
      </dl>

      <p className="text-[12px] text-muted">
        Checkout and billing are handled by Polar; we never see card details. Your plan changes once Polar confirms the payment.
      </p>
    </PageBody>
  );
}
