"use client";

import Link from "next/link";
import { usePendingCheckout } from "@/components/checkout-watcher";
import { toastError } from "@/components/toast";
import { Button, Card } from "@/components/ui";
import { ApiError, type TopUpPack } from "@/lib/api/client";
import { useCreateCheckout } from "@/lib/api/hooks";
import { startPendingCheckout } from "@/lib/checkout";
import { formatMoney, formatNumber } from "@/lib/format";
import { leaveTo } from "@/lib/navigate";
import { PRICING_PATH } from "@/lib/pricing";

/** A pack's price and what it gives. */
function TopUpPrice({ pack }: { pack: TopUpPack }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[28px] leading-none font-semibold tracking-[-0.03em]">{formatMoney(pack.priceCents)}</span>
        <span className="text-muted">for {formatNumber(pack.credits)} credits</span>
      </div>
      <p className="text-[13px] text-muted">Good for {pack.expiresInDays} days from the day you buy them. Paid once; nothing renews.</p>
    </>
  );
}

/** One pack with its Buy button: a Polar checkout, then the app waits for the credits to land. */
export function TopUpOption({ pack }: { pack: TopUpPack }) {
  const checkout = useCreateCheckout();

  const buy = () =>
    checkout.mutate(
      { kind: "topup", topUpId: pack.id },
      {
        onSuccess: ({ checkoutUrl }) => {
          startPendingCheckout({ kind: "topup", topUpId: pack.id, credits: pack.credits, startedAt: new Date().toISOString() });
          leaveTo(checkoutUrl);
        },
        onError: (error) => {
          if (error instanceof ApiError && (error.planLimit || error.status === 403)) {
            toastError("Top-ups aren’t part of your plan", "Upgrade to buy one.", { label: "See plans", href: PRICING_PATH });
          } else {
            toastError("Couldn’t start the top-up checkout", error);
          }
        },
      },
    );

  return (
    <div className="flex flex-col gap-3">
      <TopUpPrice pack={pack} />
      <Button variant="primary" pending={checkout.isPending} onClick={buy}>
        Buy a top-up
      </Button>
    </div>
  );
}

/** Said while a top-up checkout is waiting for Polar. */
export function TopUpWaiting() {
  const pending = usePendingCheckout();
  if (pending?.kind !== "topup") return null;
  return (
    <p role="status" className="rounded-[10px] bg-accent-soft px-3 py-2 text-[12.5px] text-accent-dark">
      Waiting for Polar to confirm your payment. Your credits land by themselves; if you didn’t finish paying, start again.
    </p>
  );
}

/**
 * Pricing → Top-ups: every pack with its price. Pro and Max can buy one; on Free the price is still
 * shown, with the way to a plan that can.
 */
export function TopUps({ packs, allowed }: { packs: TopUpPack[]; allowed: boolean }) {
  if (packs.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-[13.5px] text-muted">No top-up packs are on sale right now.</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-4">
        {packs.map((pack) => (
          <Card key={pack.id} role="group" aria-label={`Top-up: ${formatNumber(pack.credits)} credits`} className="flex flex-col gap-3 p-5">
            {allowed ? (
              <TopUpOption pack={pack} />
            ) : (
              <>
                <TopUpPrice pack={pack} />
                <p className="text-[13px]">
                  Top-ups come with Pro and Max.{" "}
                  <Link href="#plans" className="font-medium text-accent hover:text-accent-dark">
                    Pick a plan
                  </Link>{" "}
                  to buy one. On Free, extra credits come from coupon codes.
                </p>
              </>
            )}
          </Card>
        ))}
      </div>
      <TopUpWaiting />
    </div>
  );
}
