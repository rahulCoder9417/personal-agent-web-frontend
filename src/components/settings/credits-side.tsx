"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ApiError, errorMessage, type CouponRedemption, type TopUpPack } from "@/lib/api/client";
import { useCreateCheckout, useRedeemCoupon } from "@/lib/api/hooks";
import { Button, ButtonLink, Card, inputClass, SectionLabel } from "@/components/ui";
import { usePendingCheckout } from "@/components/checkout-watcher";
import { startPendingCheckout } from "@/lib/checkout";
import { leaveTo } from "@/lib/navigate";
import { cn, formatDate, formatMoney, formatNumber } from "@/lib/format";

function TopUpOption({ pack }: { pack: TopUpPack }) {
  const checkout = useCreateCheckout();

  const buy = () =>
    checkout.mutate(
      { kind: "topup", topUpId: pack.id },
      {
        onSuccess: ({ checkoutUrl }) => {
          startPendingCheckout({ kind: "topup", topUpId: pack.id, credits: pack.credits, startedAt: new Date().toISOString() });
          leaveTo(checkoutUrl);
        },
      },
    );

  const error = checkout.error;
  const message =
    error instanceof ApiError && (error.planLimit || error.status === 403)
      ? "Top-ups aren’t part of your plan. Upgrade to buy one."
      : error
        ? errorMessage(error)
        : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] leading-none font-semibold tracking-[-0.03em]">{formatMoney(pack.priceCents)}</span>
        <span className="text-muted">for {formatNumber(pack.credits)} credits</span>
      </div>
      <p className="text-[13px] text-muted">Good for {pack.expiresInDays} days from the day you buy them.</p>
      <Button variant="primary" pending={checkout.isPending} onClick={buy}>
        Buy a top-up
      </Button>
      {message && (
        <p role="alert" className="text-[12.5px] text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

/** Buy more credits. Only paid plans can; Free is pointed at the plans instead. */
export function TopUpCard({ packs, allowed }: { packs: TopUpPack[]; allowed: boolean }) {
  const pending = usePendingCheckout();
  const started = pending?.kind === "topup";

  return (
    <Card role="group" aria-label="Buy a top-up" className="flex flex-col gap-3.5 p-5">
      <SectionLabel>Top-up</SectionLabel>
      {!allowed ? (
        <>
          <p className="text-[13.5px]">Top-ups come with Pro and Max. On Free, credits come from codes.</p>
          <ButtonLink href="/settings/plans" variant="primary">
            Upgrade
          </ButtonLink>
        </>
      ) : packs.length === 0 ? (
        <p className="text-[13.5px] text-muted">No top-up packs are on sale right now.</p>
      ) : (
        packs.map((pack, index) => (
          <div key={pack.id} className={cn(index > 0 && "border-t border-line pt-3.5")}>
            <TopUpOption pack={pack} />
          </div>
        ))
      )}
      {started && (
        <p role="status" className="rounded-[10px] bg-accent-soft px-3 py-2 text-[12.5px] text-accent-dark">
          Waiting for Polar to confirm your payment. Your credits land here by themselves; if you didn’t finish paying, start again.
        </p>
      )}
      <p className="text-[12px] text-muted">Checkout by Polar. We never see card details.</p>
    </Card>
  );
}

/** One message for every refused code, whatever the reason: the API is deliberately vague so codes can't be probed. */
function redeemError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many tries. Wait a little and try again.";
    if (error.status === 400) return "This code is invalid or has expired";
  }
  return errorMessage(error);
}

export function RedeemCard() {
  const id = useId();
  const redeem = useRedeemCoupon();
  const [code, setCode] = useState("");
  const [done, setDone] = useState<CouponRedemption | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (!value || redeem.isPending) return;
    setDone(null);
    redeem.mutate(value, {
      onSuccess: (result) => {
        setDone(result);
        setCode("");
      },
    });
  };

  return (
    <Card role="group" aria-label="Redeem a code" className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <SectionLabel>Redeem a code</SectionLabel>
        <label htmlFor={id} className="text-[12.5px] font-medium">
          Coupon code
        </label>
        <input
          id={id}
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          placeholder="AGT-7KQ2-M9XP-4RWD"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (redeem.isError) redeem.reset();
          }}
          aria-describedby={`${id}-msg`}
          aria-invalid={redeem.isError || undefined}
          className={cn(inputClass, "font-mono text-[13px]", redeem.isError && "border-danger")}
        />
        <div id={`${id}-msg`} className="empty:hidden">
          {redeem.isError && (
            <p role="alert" className="text-[12.5px] text-danger">
              {redeemError(redeem.error)}
            </p>
          )}
          {done && !redeem.isError && (
            <p role="status" className="text-[12.5px] font-medium text-success">
              +{formatNumber(done.creditsAdded)} credits added
              {done.expiresAt && <span className="font-normal text-muted"> · good until {formatDate(done.expiresAt)}</span>}
            </p>
          )}
        </div>
        <Button type="submit" pending={redeem.isPending} disabled={!code.trim()}>
          Redeem
        </Button>
      </form>
    </Card>
  );
}

export function CreditsExplainer() {
  return (
    <Card role="group" aria-label="How credits work" className="flex flex-col gap-3 bg-chrome p-5 text-[13px] text-fg-2">
      <p>
        <strong className="font-semibold text-fg">1 credit ≈ 1 cent.</strong> Credits pay for the time Tex spends working and for paid tools. Every task shows what it cost.
      </p>
      <p>
        <strong className="font-semibold text-fg">Every credit lasts 90 days</strong> from the day you get it, whether it came from your plan, a top-up or a code. The oldest are used first.
      </p>
      <p>
        <strong className="font-semibold text-fg">No surprise bills.</strong> At zero, Tex pauses and tells you in chat.
      </p>
      <Link href="/settings/plans" className="self-start font-medium text-accent hover:text-accent-dark">
        Compare plans
      </Link>
    </Card>
  );
}
