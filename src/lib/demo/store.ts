// The demo account's live state: one object on globalThis, plus the few operations that
// more than one endpoint needs (events, credits, the activity log).

import type { ActivityEntry, AgentStatus, CreditBalance, StreamEvent } from "@/lib/api/client";
import { createSeed, dayKey, emptyDay, type DayUsage, type DemoData } from "./seed";

export type Listener = (event: StreamEvent) => void;

export type DemoState = DemoData & {
  seq: number;
  listeners: Set<Listener>;
  timers: Set<ReturnType<typeof setTimeout>>;
};

// On globalThis so a hot reload of this module doesn't hand every request a fresh account.
const KEY = "__textcrewDemoStore";
type Holder = { [KEY]?: DemoState };
const holder = globalThis as unknown as Holder;

function createState(now: Date): DemoState {
  return { ...createSeed(now), seq: 0, listeners: new Set(), timers: new Set() };
}

export function getStore(): DemoState {
  holder[KEY] ??= createState(new Date());
  return holder[KEY];
}

/** Starts the account over (tests call this before each case). */
export function resetDemoStore(now: Date = new Date()): DemoState {
  const previous = holder[KEY];
  if (previous) {
    for (const timer of previous.timers) clearTimeout(timer);
    previous.listeners.clear();
  }
  holder[KEY] = createState(now);
  return holder[KEY];
}

export function nextId(state: DemoState, prefix: string): string {
  state.seq += 1;
  return `${prefix}_${Date.now().toString(36)}${state.seq.toString(36)}`;
}

// ---------------------------------------------------------------- events

export function subscribe(state: DemoState, listener: Listener): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function emit(state: DemoState, type: StreamEvent["type"], data: StreamEvent["data"]): void {
  // A copy, so later changes to the stored object can't alter an event already sent.
  const event: StreamEvent = { type, data: structuredClone(data) };
  for (const listener of [...state.listeners]) listener(event);
}

/** Runs something a little later, the way the real agent answers after a moment. */
export function schedule(state: DemoState, delayMs: number, run: () => void): void {
  const timer = setTimeout(() => {
    state.timers.delete(timer);
    // The account may have been reset while this was waiting.
    if (holder[KEY] === state) run();
  }, delayMs);
  state.timers.add(timer);
}

export function setAgentState(state: DemoState, next: AgentStatus["state"]): void {
  state.agentStatus = { state: next, lastActiveAt: new Date().toISOString() };
  emit(state, "agent.status", state.agentStatus);
}

// ---------------------------------------------------------------- credits

const isLive = (expiresAt: string | null | undefined, now: number) => !expiresAt || Date.parse(expiresAt) > now;

/** Grants that can still be spent, oldest-expiring first (never-expiring ones last). */
function spendable(state: DemoState, now: number) {
  return state.grants
    .filter((grant) => grant.remaining > 0 && isLive(grant.expiresAt, now))
    .sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity));
}

export function balanceOf(state: DemoState, now = Date.now()): number {
  return spendable(state, now).reduce((sum, grant) => sum + grant.remaining, 0);
}

export function nextExpiryOf(state: DemoState, now = Date.now()): string | null {
  return spendable(state, now)[0]?.expiresAt ?? null;
}

export function creditBalance(state: DemoState): CreditBalance {
  return { balance: balanceOf(state), grants: state.grants };
}

/**
 * Takes credits from the oldest-expiring grants and writes the ledger line.
 * Never goes below zero; returns what was actually charged.
 */
function spend(state: DemoState, amount: number, description: string, now: number): number {
  let left = amount;
  let firstGrant: string | null = null;
  for (const grant of spendable(state, now)) {
    if (left === 0) break;
    const take = Math.min(left, grant.remaining);
    grant.remaining -= take;
    left -= take;
    firstGrant ??= grant.id;
  }
  const charged = amount - left;
  if (charged === 0) return 0;

  state.ledger.unshift({
    id: nextId(state, "led"),
    delta: -charged,
    reason: "charge",
    grantId: firstGrant,
    description,
    createdAt: new Date(now).toISOString(),
  });
  return charged;
}

function usageToday(state: DemoState, now: number): DayUsage {
  return (state.usage[dayKey(new Date(now))] ??= emptyDay());
}

/**
 * Charges for a turn the way the backend does: the time the agent ran, plus the AI when it ran
 * on Textcrew AI. With the user's own AI there is no AI part. Returns what was charged.
 */
export function chargeUsage(state: DemoState, credits: { ai?: number; awake: number }): number {
  const now = Date.now();
  const ai = credits.ai ?? 0;
  const parts = [ai > 0 ? `AI ${ai}` : null, credits.awake > 0 ? `awake time ${credits.awake}` : null].filter(Boolean);
  const charged = spend(state, ai + credits.awake, `Usage: ${parts.join(", ") || "none"}`, now);
  if (charged === 0) return 0;

  const day = usageToday(state, now);
  const aiCharged = Math.min(ai, charged);
  day.ai += aiCharged;
  day.awake += charged - aiCharged;
  emit(state, "credits.updated", creditBalance(state));
  return charged;
}

/** One credit for an app action that changed something (sending, creating, updating, deleting). */
export function chargeAppAction(state: DemoState, action: string): number {
  const now = Date.now();
  const charged = spend(state, 1, `App action: ${action}`, now);
  if (charged === 0) return 0;

  usageToday(state, now).actions += charged;
  emit(state, "credits.updated", creditBalance(state));
  return charged;
}

/** Adds a grant with its ledger line, and tells the stream. */
export function grantCredits(
  state: DemoState,
  grant: { source: "coupon" | "topup"; amount: number; expiresInDays: number; cheapModelOnly: boolean; description: string },
): string {
  const now = Date.now();
  const expiresAt = new Date(now + grant.expiresInDays * 86_400_000).toISOString();
  const id = nextId(state, "grant");
  state.grants.push({
    id,
    source: grant.source,
    amount: grant.amount,
    remaining: grant.amount,
    cheapModelOnly: grant.cheapModelOnly,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  });
  state.ledger.unshift({
    id: nextId(state, "led"),
    delta: grant.amount,
    reason: "grant",
    grantId: id,
    description: grant.description,
    createdAt: new Date(now).toISOString(),
  });
  emit(state, "credits.updated", creditBalance(state));
  return expiresAt;
}

// ---------------------------------------------------------------- activity

export function logActivity(
  state: DemoState,
  entry: Pick<ActivityEntry, "actor" | "action" | "summary"> & { creditsCharged?: number | null },
): void {
  state.activity.unshift({
    id: nextId(state, "act"),
    actor: entry.actor,
    action: entry.action,
    summary: entry.summary,
    creditsCharged: entry.creditsCharged ?? null,
    createdAt: new Date().toISOString(),
  });
}
