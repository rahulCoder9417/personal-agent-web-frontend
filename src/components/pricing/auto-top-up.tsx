"use client";

import { useId, useState } from "react";
import { SettingsGroup } from "@/components/settings/settings-rows";
import { toast, toastError } from "@/components/toast";
import { Button, Card, Pill, inputClass } from "@/components/ui";
import { ApiError, errorMessage, type AutoTopUp, type TopUpPack } from "@/lib/api/client";
import { useAutoTopUp, useSetAutoTopUp } from "@/lib/api/hooks";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

// Pricing → Auto top-up. Shown only while the server allows it (`available`, the backend's
// AUTO_TOPUP_ENABLED); otherwise nothing on the page mentions it. It charges the user's card when
// they are not there, so switching it on needs a ticked box that says exactly what will be charged.

/** The lines a user can pick (the API allows 20 to 1,000). */
const THRESHOLDS = [50, 100, 200, 300, 500];
const CAPS = [1, 2, 3, 4, 5];

const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;

function cardName(card: AutoTopUp["card"]): string {
  if (!card) return "the card Polar keeps for your plan";
  const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
  return card.last4 ? `your ${brand} ending ${card.last4}` : `your ${brand}`;
}

/** What the user agrees to, word for word, beside the box they tick. */
export function consentText(pack: TopUpPack, threshold: number, cap: number, card: AutoTopUp["card"]): string {
  return (
    `I allow Textcrew to have Polar charge ${cardName(card)} ${formatMoney(pack.priceCents)} for ${formatNumber(pack.credits)} credits ` +
    `each time my balance drops under ${formatNumber(threshold)} credits, at most ${times(cap)} a month. I can switch this off here at any time.`
  );
}

/** The price, plainly: per top-up, and the most a month can cost. */
export function priceText(pack: TopUpPack, cap: number): string {
  return `Each top-up is ${formatMoney(pack.priceCents)} for ${formatNumber(pack.credits)} credits, plus tax where it applies. At most ${times(cap)} a month, so ${formatMoney(pack.priceCents * cap)} a month at the very most.`;
}

export function turnedOffText(reason: AutoTopUp["turnedOffReason"]): string | null {
  switch (reason) {
    case "declined":
      return "Auto top-up switched itself off: your card was declined twice, so nothing was charged. Check your card with Polar, then switch it on again.";
    case "no_card":
      return "Auto top-up switched itself off: Polar has no saved card for you, so nothing was charged.";
    case "refused":
      return "Auto top-up switched itself off: Polar refused the charge, so nothing was charged.";
    default:
      return null;
  }
}

export function lastAttemptText(last: AutoTopUp["lastAttempt"]): string | null {
  if (!last) return null;
  const day = formatDate(last.at);
  const credits = formatNumber(last.credits);
  switch (last.status) {
    case "charging":
      return "A top-up is being charged now.";
    case "waiting":
      return `Charged ${formatMoney(last.amountCents)} on ${day}. The ${credits} credits are on their way.`;
    case "credited":
      return `Last top-up on ${day}: ${credits} credits added for ${formatMoney(last.amountCents)}.`;
    case "declined":
      return `Your card was declined on ${day}. Nothing was charged.`;
    case "failed":
      return `Polar couldn’t make the charge on ${day}. Nothing was charged.`;
  }
}

function saveError(error: unknown): string {
  if (error instanceof ApiError && (error.planLimit || error.status === 403)) return "Auto top-up comes with Pro and Max.";
  return errorMessage(error);
}

/** Off, or changing it: the line, the pack, the monthly limit, the price, and the box to tick. */
function SettingsForm({ settings, packs, onDone }: { settings: AutoTopUp; packs: TopUpPack[]; onDone?: () => void }) {
  const save = useSetAutoTopUp();
  const id = useId();
  const [threshold, setThreshold] = useState(settings.thresholdCredits);
  const [cap, setCap] = useState(settings.monthlyCap);
  const [packId, setPackId] = useState(packs.some((p) => p.id === settings.topUpId) ? settings.topUpId : packs[0].id);
  const [agreed, setAgreed] = useState(false);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const thresholds = [...new Set([...THRESHOLDS, settings.thresholdCredits])].sort((a, b) => a - b);
  const editing = settings.enabled;

  const submit = () =>
    save.mutate(
      { enabled: true, thresholdCredits: threshold, monthlyCap: cap, topUpId: pack.id, consent: true },
      {
        onSuccess: (next) => {
          toast({
            title: editing ? "Auto top-up updated" : "Auto top-up is on",
            body: `Under ${formatNumber(next.thresholdCredits)} credits, Polar adds ${formatNumber(pack.credits)} for ${formatMoney(pack.priceCents)}, at most ${times(next.monthlyCap)} a month.`,
          });
          onDone?.();
        },
        onError: (error) => toastError(editing ? "Couldn’t update auto top-up" : "Couldn’t switch on auto top-up", saveError(error)),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-threshold`} className="text-[12.5px] font-medium">
            When I have under
          </label>
          <select id={`${id}-threshold`} className={inputClass} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
            {thresholds.map((n) => (
              <option key={n} value={n}>
                {formatNumber(n)} credits
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-pack`} className="text-[12.5px] font-medium">
            Add
          </label>
          <select id={`${id}-pack`} className={inputClass} value={pack.id} onChange={(e) => setPackId(e.target.value)}>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {formatNumber(p.credits)} credits for {formatMoney(p.priceCents)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-cap`} className="text-[12.5px] font-medium">
            At most
          </label>
          <select id={`${id}-cap`} className={inputClass} value={cap} onChange={(e) => setCap(Number(e.target.value))}>
            {CAPS.map((n) => (
              <option key={n} value={n}>
                {times(n)} a month
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[13px] text-fg-2">{priceText(pack, cap)}</p>

      <label className="flex items-start gap-2.5 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13px]">
        <input type="checkbox" className="mt-[3px] size-4 shrink-0 accent-[var(--accent)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{consentText(pack, threshold, cap, settings.card)}</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" pending={save.isPending} disabled={!agreed} onClick={submit}>
          {editing ? "Save changes" : "Switch on auto top-up"}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/** On: what it does, this month's top-ups, the last try, and Change / Switch off. */
function Summary({ settings, packs, onChange }: { settings: AutoTopUp; packs: TopUpPack[]; onChange: () => void }) {
  const save = useSetAutoTopUp();
  const pack = packs.find((p) => p.id === settings.topUpId) ?? packs[0];
  const last = lastAttemptText(settings.lastAttempt);
  const off = () =>
    save.mutate(
      { enabled: false },
      {
        onSuccess: () => toast({ title: "Auto top-up is off", body: "Nothing more will be charged to your card. Tex pauses at zero, as before." }),
        onError: (error) => toastError("Couldn’t switch off auto top-up", error),
      },
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px]">
        When you have under <strong className="font-semibold">{formatNumber(settings.thresholdCredits)} credits</strong>, Polar charges {cardName(settings.card)}{" "}
        <strong className="font-semibold">{formatMoney(pack.priceCents)}</strong> for {formatNumber(pack.credits)} credits, at most {times(settings.monthlyCap)} a month.
      </p>
      <ul className="flex flex-col gap-1 text-[13px] text-muted">
        <li>
          This month: {settings.thisMonth.count} of {settings.monthlyCap}
          {settings.thisMonth.spentCents > 0 ? `, ${formatMoney(settings.thisMonth.spentCents)} so far` : ""}.
        </li>
        {last && <li>{last}</li>}
        {settings.consentedAt && <li>You allowed these charges on {formatDate(settings.consentedAt)}.</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onChange} disabled={save.isPending}>
          Change
        </Button>
        <Button variant="danger-outline" pending={save.isPending} onClick={off}>
          Switch off
        </Button>
      </div>
    </div>
  );
}

function AutoTopUpCard({ settings, packs, allowed }: { settings: AutoTopUp; packs: TopUpPack[]; allowed: boolean }) {
  const [changing, setChanging] = useState(false);
  const stopped = !settings.enabled ? turnedOffText(settings.turnedOffReason) : null;
  return (
    <Card role="group" aria-label="Auto top-up" className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <span className="text-[15px] font-semibold">Top up by itself</span>
        <Pill tone={settings.enabled ? "done" : "muted"}>{settings.enabled ? "On" : "Off"}</Pill>
      </div>
      {!allowed ? (
        <p className="text-[13.5px] text-muted">Auto top-up comes with Pro and Max, like top-ups.</p>
      ) : (
        <>
          {stopped && (
            <p role="status" className="rounded-[10px] bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {stopped}
            </p>
          )}
          {settings.enabled && !changing ? (
            <Summary settings={settings} packs={packs} onChange={() => setChanging(true)} />
          ) : (
            <SettingsForm settings={settings} packs={packs} onDone={settings.enabled ? () => setChanging(false) : undefined} />
          )}
        </>
      )}
    </Card>
  );
}

/** The section, or nothing at all while the server has auto top-up switched off. */
export function AutoTopUpSection({ packs, allowed }: { packs: TopUpPack[]; allowed: boolean }) {
  const settings = useAutoTopUp();
  if (!settings.data?.available || packs.length === 0) return null;
  return (
    <SettingsGroup
      id="auto-top-up"
      title="Auto top-up"
      description="Credits added by themselves before you run out, so Tex doesn’t pause. Your card is charged only if you switch this on."
    >
      <AutoTopUpCard settings={settings.data} packs={packs} allowed={allowed} />
    </SettingsGroup>
  );
}
