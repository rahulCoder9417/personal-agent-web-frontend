// Profile, linked chats, billing, credits and the activity log for the demo account.

import type { ChannelLink, ChannelType, LinkCode, Me, PlanId, UsagePeriod, UsageTotals } from "@/lib/api/client";
import { nowIso, type Handler } from "./context";
import {
  badRequest,
  channelDisabled,
  conflict,
  HttpError,
  isRecord,
  json,
  noContent,
  notFound,
  oneOf,
  paginate,
  planLimit,
  readJson,
  requiredString,
  stringField,
} from "./http";
import { dayKey, emptyDay } from "./seed";
import { balanceOf, creditBalance, grantCredits, logActivity, nextExpiryOf, nextId, schedule, type DemoState } from "./store";

// ---------------------------------------------------------------- me

function me(state: DemoState): Me {
  return { ...state.user, credits: { balance: balanceOf(state), nextExpiry: nextExpiryOf(state) } };
}

export const getMe: Handler = ({ state }) => json(me(state));

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const updateMe: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const name = stringField(body, "name", { max: 80 })?.trim();
  const timezone = stringField(body, "timezone");
  if (name !== undefined && name.length === 0) throw badRequest("name can't be empty");
  if (timezone !== undefined && !isTimezone(timezone)) throw badRequest("timezone isn't a known time zone");
  if (name !== undefined) state.user.name = name;
  if (timezone !== undefined) state.user.timezone = timezone;
  return json(me(state));
};

// ---------------------------------------------------------------- channels

type Linkable = Exclude<ChannelType, "web">;

const LINK_TARGETS: Record<Linkable, { label: string; where: string; displayId: string; deepLink: (code: string) => string | null }> = {
  whatsapp: {
    label: "WhatsApp",
    where: "+1 555 010 0000 on WhatsApp",
    displayId: "+91 •••• ••42 10",
    deepLink: (code) => `https://wa.me/15550100000?text=${encodeURIComponent(code)}`,
  },
  telegram: {
    label: "Telegram",
    where: "@textcrew_bot on Telegram",
    displayId: "@aarav_s",
    deepLink: (code) => `https://t.me/textcrew_bot?start=${encodeURIComponent(code)}`,
  },
  imessage: { label: "iMessage", where: "+1 555 010 0000 in Messages", displayId: "+91 •••• ••42 10", deepLink: () => null },
};

const LINK_CODE_MINUTES = 10;
/** The demo "sends the code" for you after this long, so linking can be watched finishing. */
const AUTO_LINK_MS = 6000;

/** A chat linked before its channel was switched off stays in `items`, so it can still be unlinked. */
export const listChannels: Handler = ({ state }) => json({ items: state.channels, available: state.availableChannels });

function makeLinkCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const letter = () => letters[Math.floor(Math.random() * letters.length)];
  return `LINK-${String(Math.floor(1000 + Math.random() * 9000))}-${letter()}${letter()}`;
}

function linkChannel(state: DemoState, channel: Linkable): void {
  if (state.channels.some((link) => link.channel === channel)) return;
  const link: ChannelLink = {
    id: nextId(state, "ch"),
    channel,
    displayId: LINK_TARGETS[channel].displayId,
    linkedAt: nowIso(),
    ...(channel === "whatsapp" ? { within24hWindow: true } : {}),
  };
  state.channels.push(link);
  logActivity(state, { actor: "user", action: "channel_linked", summary: `Linked ${LINK_TARGETS[channel].label}` });
}

export const createLinkCode: Handler = async ({ state, request }) => {
  const body = await readJson(request);
  const channel = oneOf(body.channel, ["whatsapp", "telegram", "imessage", "web"] as const, "channel");
  if (channel === "web") throw badRequest("The web app doesn't need linking");

  const target = LINK_TARGETS[channel];
  if (!state.availableChannels.includes(channel)) throw channelDisabled(channel, `${target.label} is switched off right now`);
  const code = makeLinkCode();
  const linkCode: LinkCode = {
    code,
    channel,
    expiresAt: new Date(Date.now() + LINK_CODE_MINUTES * 60_000).toISOString(),
    instructions: `Send ${code} to ${target.where}`,
    deepLink: target.deepLink(code),
  };
  schedule(state, AUTO_LINK_MS, () => linkChannel(state, channel));
  return json(linkCode, 201);
};

export const unlinkChannel: Handler = ({ state, params }) => {
  const index = state.channels.findIndex((link) => link.id === params.channelLinkId);
  if (index === -1) throw notFound("That chat isn't linked");
  state.channels.splice(index, 1);
  return noContent();
};

// ---------------------------------------------------------------- billing

const PAID_PLANS: readonly PlanId[] = ["pro", "max"];

export const listPlans: Handler = ({ state }) => json({ plans: state.plans, topUps: state.topUps });

export const getSubscription: Handler = ({ state }) => json(state.subscription);

/** Nothing is bought in the demo: the "checkout" is a page of this app that says so. */
export const createCheckout: Handler = async ({ state, request, url }) => {
  const body = await readJson(request);
  const kind = oneOf(body.kind, ["plan", "topup"] as const, "kind");
  const checkoutUrl = `${url.origin}/connected?checkout=demo`;

  if (kind === "plan") {
    oneOf(body.planId, PAID_PLANS, "planId");
    return json({ checkoutUrl, discountApplied: true });
  }
  const topUpId = requiredString(body, "topUpId");
  if (!state.topUps.some((pack) => pack.id === topUpId)) throw badRequest("That top-up doesn't exist");
  if (!PAID_PLANS.includes(state.user.plan)) throw planLimit("Top-ups are for Pro and Max. Upgrade first, or redeem a code.");
  return json({ checkoutUrl, discountApplied: false });
};

export const cancelSubscription: Handler = ({ state }) => {
  if (state.subscription.plan === "free" || state.subscription.status !== "active") {
    throw conflict("There's no active paid subscription to cancel");
  }
  state.subscription = { ...state.subscription, status: "cancel_at_period_end" };
  return json(state.subscription);
};

// ---------------------------------------------------------------- credits

export const getCredits: Handler = ({ state }) => json(creditBalance(state));

export const listLedger: Handler = ({ state, url }) => json(paginate(state.ledger, url));

const MAX_USAGE_DAYS = 366;

function readDate(url: URL, name: string): Date {
  const raw = url.searchParams.get(name);
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) throw badRequest(`${name} must be a date-time`);
  return date;
}

export const getUsage: Handler = ({ state, url }) => {
  const from = readDate(url, "from");
  const to = readDate(url, "to");
  if (to < from) throw badRequest("to must not be before from");
  if (to.getTime() - from.getTime() > MAX_USAGE_DAYS * 86_400_000) throw badRequest("Ask for a year at most");

  const items: UsagePeriod[] = [];
  const totals: UsageTotals = { aiCredits: 0, awakeCredits: 0, appActionCredits: 0, browserCredits: 0, toolCredits: 0, totalCredits: 0 };
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  while (day < to) {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const { ai, awake, actions, tools } = state.usage[dayKey(day)] ?? emptyDay();
    items.push({
      periodStart: day.toISOString(),
      periodEnd: next.toISOString(),
      aiCredits: ai,
      // One credit per 10 minutes the agent ran.
      awakeSeconds: awake * 600,
      awakeCredits: awake,
      appActionCredits: actions,
      // Scout's browser isn't built yet, so there is no browser time to charge.
      browserSeconds: 0,
      browserCredits: 0,
      // Paid tools only (web search); browser time has its own number.
      toolCredits: tools,
      totalCredits: ai + awake + actions + tools,
    });
    totals.aiCredits += ai;
    totals.awakeCredits += awake;
    totals.appActionCredits += actions;
    totals.toolCredits += tools;
    totals.totalCredits += ai + awake + actions + tools;
    day.setTime(next.getTime());
  }
  return json({ items, totals });
};

// ---------------------------------------------------------------- coupons

const DEMO_COUPON = "TEXTCREW-DEMO";
const DEMO_COUPON_CREDITS = 200;

export const redeemCoupon: Handler = async ({ state, request }) => {
  // Every failure looks the same on purpose, so codes can't be probed.
  const invalid = new HttpError(400, "invalid_or_expired_code", "This code is invalid or has expired");
  const body = await readJson(request);
  const code = isRecord(body) && typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (code !== DEMO_COUPON || state.redeemedCoupons.includes(code)) throw invalid;

  state.redeemedCoupons.push(code);
  const expiresAt = grantCredits(state, {
    source: "coupon",
    amount: DEMO_COUPON_CREDITS,
    expiresInDays: 90,
    cheapModelOnly: true,
    description: "Coupon redeemed",
  });
  logActivity(state, { actor: "user", action: "coupon_redeemed", summary: `Redeemed a coupon for ${DEMO_COUPON_CREDITS} credits` });
  return json({ creditsAdded: DEMO_COUPON_CREDITS, expiresAt, cheapModelOnly: true, balance: balanceOf(state) });
};

// ---------------------------------------------------------------- activity

export const listActivity: Handler = ({ state, url }) => json(paginate(state.activity, url));
