"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ApiError, errorMessage, type CouponRedemption, type TopUpPack } from "@/lib/api/client";
import { useAutoTopUp, useRedeemCoupon } from "@/lib/api/hooks";
import { TopUpOption, TopUpWaiting } from "@/components/pricing/top-ups";
import { toastError } from "@/components/toast";
import { Button, ButtonLink, Card, inputClass, SectionLabel } from "@/components/ui";
import { refusedTypedValue } from "@/lib/action-errors";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { cn, formatDate, formatNumber } from "@/lib/format";
import { PRICING_PATH } from "@/lib/pricing";

/** Buy more credits. Only paid plans can; Free is pointed at the plans instead. */
export function TopUpCard({ packs, allowed }: { packs: TopUpPack[]; allowed: boolean }) {
  return (
    <Card role="group" aria-label="Buy a top-up" className="flex flex-col gap-3.5 p-5">
      <SectionLabel>Top-up</SectionLabel>
      {!allowed ? (
        <>
          <p className="text-[13.5px]">Top-ups come with Pro and Max. On Free, credits come from codes.</p>
          <ButtonLink href={PRICING_PATH} variant="primary">
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
      <TopUpWaiting />
      <p className="text-[12px] text-muted">Checkout by Polar. We never see card details.</p>
    </Card>
  );
}

/** One message for every refused code, whatever the reason: the API is deliberately vague so codes can't be probed. */
const REFUSED_CODE = "This code is invalid or has expired";

/** Why redeeming didn't happen when the code itself wasn't the problem. */
function redeemError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return "Too many tries. Wait a little and try again.";
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
      onError: (error) => {
        if (!refusedTypedValue(error)) toastError("Couldn’t redeem the code", redeemError(error));
      },
    });
  };
  // A refused code is said under the field; anything else (too many tries, the server) is a toast.
  const refused = refusedTypedValue(redeem.error);

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
          aria-invalid={refused || undefined}
          className={cn(inputClass, "font-mono text-[13px]", refused && "border-danger")}
        />
        <div id={`${id}-msg`} className="empty:hidden">
          {refused && (
            <p role="alert" className="text-[12.5px] text-danger">
              {REFUSED_CODE}
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
  // With auto top-up allowed on the server, "no surprise bills" says when a card can be charged.
  const autoTopUp = useAutoTopUp().data?.available === true;
  return (
    <Card role="group" aria-label="How credits work" className="flex flex-col gap-3 bg-chrome p-5 text-[13px] text-fg-2">
      <div className="flex flex-col gap-1.5">
        <p>
          <strong className="font-semibold text-fg">1 credit ≈ 1 cent.</strong> Credits pay for:
        </p>
        <ul className="flex flex-col gap-1.5">
          {CREDIT_COSTS.map((cost) => (
            <li key={cost.id} className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
              <span>
                <strong className="font-semibold text-fg">{cost.name}</strong>
                {cost.id === "ai" ? ", " : ": "}
                {cost.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p>
        <strong className="font-semibold text-fg">Credits last 90 days</strong> from the day you get them, whether they came from your plan, a top-up or a code. The 100 sign-up credits last 14 days. The ones that expire soonest are used first.
      </p>
      <p>
        <strong className="font-semibold text-fg">No surprise bills.</strong> At zero, Tex pauses and tells you in chat.
        {autoTopUp && " Your card is charged only if you switch on auto top-up in Pricing."}
      </p>
      <Link href={PRICING_PATH} className="self-start font-medium text-accent hover:text-accent-dark">
        Compare plans
      </Link>
    </Card>
  );
}
