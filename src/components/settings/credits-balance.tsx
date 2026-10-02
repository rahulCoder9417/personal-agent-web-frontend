import type { CreditBalance, CreditGrant } from "@/lib/api/client";
import { Card, Meta, Pill, SectionLabel } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/format";

const SOURCE_LABEL: Record<CreditGrant["source"], string> = {
  signup: "Sign-up",
  coupon: "Coupon",
  monthly: "Monthly",
  topup: "Top-up",
  admin: "Added by Textcrew",
  refund: "Refund",
};

const SOURCE_VERB: Partial<Record<CreditGrant["source"], string>> = {
  coupon: "redeemed",
  topup: "bought",
};

function expiryTime(grant: CreditGrant): number {
  return grant.expiresAt ? new Date(grant.expiresAt).getTime() : Number.POSITIVE_INFINITY;
}

/** Live grants first, soonest to expire on top (that's the order they're spent in); used-up ones last. */
export function sortGrants(grants: readonly CreditGrant[]): CreditGrant[] {
  return [...grants].sort((a, b) => {
    const aUsed = a.remaining <= 0;
    const bUsed = b.remaining <= 0;
    if (aUsed !== bUsed) return aUsed ? 1 : -1;
    return expiryTime(a) - expiryTime(b);
  });
}

/** The grant that will lapse next, if any credit has an expiry at all. */
export function nextToExpire(grants: readonly CreditGrant[]): CreditGrant | undefined {
  return sortGrants(grants).find((g) => g.remaining > 0 && g.expiresAt);
}

function expiryLabel(grant: CreditGrant): string {
  if (grant.remaining <= 0) return "used up";
  if (!grant.expiresAt) return "never expires";
  return `expires ${formatDate(grant.expiresAt)}`;
}

function GrantRow({ grant }: { grant: CreditGrant }) {
  const used = grant.remaining <= 0;
  const share = grant.amount > 0 ? Math.min(100, Math.max(0, (grant.remaining / grant.amount) * 100)) : 0;
  const label = SOURCE_LABEL[grant.source];
  return (
    <li className="flex items-center gap-4 border-t border-line py-[11px]">
      <div className="flex w-[150px] shrink-0 flex-col max-sm:w-[96px]">
        <span className={used ? "font-medium text-muted" : "font-medium"}>{label}</span>
        <Meta className="text-[12px]">
          {SOURCE_VERB[grant.source] ?? "added"} {formatDate(grant.createdAt)}
        </Meta>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          role="img"
          aria-label={`${label}: ${formatNumber(Math.max(0, grant.remaining))} of ${formatNumber(grant.amount)} credits left`}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-1.5 rounded-full bg-fg" style={{ width: `${share}%` }} />
        </div>
        <Meta className="text-[12px]">
          {formatNumber(Math.max(0, grant.remaining))} of {formatNumber(grant.amount)} left
        </Meta>
      </div>
      <span className={`w-[118px] shrink-0 text-right text-[12px] max-sm:w-[92px] ${used ? "text-muted" : "text-fg"}`}>{expiryLabel(grant)}</span>
    </li>
  );
}

/** The balance and the grants it is made of, each with its expiry date. */
export function BalanceCard({ credits }: { credits: CreditBalance }) {
  const grants = sortGrants(credits.grants);
  const next = nextToExpire(credits.grants);

  return (
    <Card role="group" aria-label="Balance" className="flex flex-col gap-[18px] px-6 py-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <SectionLabel as="span">Balance</SectionLabel>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[48px] leading-none font-semibold tracking-[-0.04em]">{formatNumber(credits.balance)}</span>
            <span className="text-[15px] text-muted">credits</span>
          </div>
        </div>
        {next?.expiresAt && (
          <Pill className="px-2.5 py-1 font-normal">
            {formatNumber(next.remaining)} expire {formatDate(next.expiresAt)}
          </Pill>
        )}
        {credits.balance <= 0 && <Pill tone="danger">Tex is paused</Pill>}
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 pb-2">
          <SectionLabel>What it’s made of</SectionLabel>
          <Meta className="text-[12px]">oldest-expiring credits are used first</Meta>
        </div>
        {grants.length === 0 ? (
          <p className="border-t border-line py-4 text-[13.5px] text-muted">No credits yet. Redeem a code or pick a plan to get started.</p>
        ) : (
          <ul className="flex flex-col">
            {grants.map((grant) => (
              <GrantRow key={grant.id} grant={grant} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
