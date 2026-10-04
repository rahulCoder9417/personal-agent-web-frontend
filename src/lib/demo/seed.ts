// The demo account's starting data. Every timestamp is worked out from "now", so today's
// messages are always today's and the credits always have the same number of days left.

import type {
  ActivityEntry,
  AgentSettings,
  AgentStatus,
  App,
  Approval,
  Attachment,
  Automation,
  ByokKey,
  ChannelLink,
  ChannelType,
  CreditGrant,
  LedgerEntry,
  McpServer,
  Me,
  Message,
  Plan,
  PlanId,
  Subscription,
  TopUpPack,
} from "@/lib/api/client";

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The account signed up, linked Telegram and redeemed its beta coupon this many days ago. */
export const SIGNUP_DAYS_AGO = 19;
const PRO_SINCE_DAYS_AGO = 10;
const CREDIT_LIFETIME_DAYS = 90;

/**
 * Credits used in a day, by what they paid for. `tools` is paid tools (Scout's web search).
 * There is no browser part: Scout's browser isn't built yet, as `GET /v1/crew` says.
 */
export type DayUsage = { ai: number; awake: number; actions: number; tools: number };

export const emptyDay = (): DayUsage => ({ ai: 0, awake: 0, actions: 0, tools: 0 });

export type DemoData = {
  user: Omit<Me, "credits">;
  /** The channels that are switched on, like the backend's ENABLED_CHANNELS: Telegram and the web chat at launch. */
  availableChannels: ChannelType[];
  channels: ChannelLink[];
  /** Newest first, like the API returns them. */
  messages: Message[];
  /** clientMessageId → message id, for idempotent sends. */
  sentIds: Record<string, string>;
  attachments: Record<string, Attachment>;
  approvals: Approval[];
  /** What Tex says after an approval is decided. */
  approvalReplies: Record<string, { approved: string; rejected: string }>;
  apps: App[];
  mcpServers: McpServer[];
  byok: ByokKey[];
  automations: Automation[];
  agentStatus: AgentStatus;
  agentSettings: AgentSettings;
  /** Like the backend's AI_ACCESS_MODE: `platform` offers Textcrew AI, `own_only` requires the user's own AI. */
  aiMode: AiMode;
  /** loginId → expiresAt */
  claudeLogins: Record<string, string>;
  plans: Plan[];
  topUps: TopUpPack[];
  subscription: Subscription;
  grants: CreditGrant[];
  ledger: LedgerEntry[];
  activity: ActivityEntry[];
  /** Credits used per local day (`YYYY-MM-DD`). */
  usage: Record<string, DayUsage>;
  redeemedCoupons: string[];
};

const iso = (ms: number) => new Date(ms).toISOString();

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Local calendar day as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A local clock time on the day `daysAgo` days back (negative = ahead). */
function atDay(now: Date, daysAgo: number, hour: number, minute = 0): string {
  const date = startOfDay(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/**
 * A moment `minutesAgo` back that is still today. Just after midnight there isn't that much
 * of today yet, so the moments are squeezed into what there is, keeping their order.
 */
function earlierToday(now: Date, minutesAgo: number): string {
  const start = startOfDay(now).getTime();
  const wanted = now.getTime() - minutesAgo * MINUTE;
  if (wanted >= start) return iso(wanted);
  const longest = 480;
  return iso(start + (now.getTime() - start) * (1 - Math.min(minutesAgo, longest) / longest));
}

/** The next (or previous) time the clock reads `hour`:00 on one of `weekdays` (0 = Sunday). */
function nearestRun(now: Date, hour: number, weekdays: readonly number[], direction: 1 | -1): string {
  const candidate = startOfDay(now);
  candidate.setHours(hour, 0, 0, 0);
  for (let step = 0; step < 8; step++) {
    const ahead = direction === 1 ? candidate > now : candidate <= now;
    if (ahead && weekdays.includes(candidate.getDay())) return candidate.toISOString();
    candidate.setDate(candidate.getDate() + direction);
  }
  return candidate.toISOString();
}

// ---------------------------------------------------------------- credits used so far

/** Credits charged on each day, index = days ago. They add up to what the grants have spent (516). */
function dailyCredits(): number[] {
  const today = 7;
  const yesterday = 2;
  const rest = 507;
  const days: number[] = [];
  for (let d = 2; d <= SIGNUP_DAYS_AGO; d++) days.push(3 + (((d * 2654435761) >>> 0) % 37));
  const weight = days.reduce((sum, w) => sum + w, 0);
  const scaled = days.map((w) => Math.floor((w * rest) / weight));
  let remainder = rest - scaled.reduce((sum, v) => sum + v, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % scaled.length, remainder--) scaled[i] += 1;
  return [today, yesterday, ...scaled];
}

/**
 * Something Tex did: a charge in the ledger, a line in the activity log, or both.
 * As in the backend, the time the agent ran is charged as "Usage: awake time N", each app
 * action that changed something as its own one-credit "App action: NAME" (reading is free),
 * and each web search as its own "Web search" (a paid tool).
 */
type Happened = {
  at: string;
  charge?: { amount: number; description: string; part: keyof DayUsage };
  did?: { action: string; summary: string; creditsCharged: number | null };
};

const ranFor = (at: string, credits: number): Happened => ({
  at,
  charge: { amount: credits, description: `Usage: awake time ${credits}`, part: "awake" },
});

const changed = (at: string, action: string, summary: string): Happened => ({
  at,
  charge: { amount: 1, description: `App action: ${action}`, part: "actions" },
  did: { action: "run_app_action", summary, creditsCharged: 1 },
});

const read = (at: string, summary: string): Happened => ({ at, did: { action: "run_app_action", summary, creditsCharged: 0 } });

/** Scout searched the web: a paid tool, one credit a search in the demo. */
const searched = (at: string, query: string): Happened => ({
  at,
  charge: { amount: 1, description: "Web search", part: "tools" },
  did: { action: "web_search", summary: `Searched the web: ${query}`, creditsCharged: 1 },
});

const automationRan = (at: string, title: string): Happened => ({
  ...ranFor(at, 1),
  did: { action: "automation_run", summary: `Ran “${title}”`, creditsCharged: null },
});

const PAST_CHANGES: readonly { action: string; summary: string }[] = [
  { action: "GMAIL_CREATE_EMAIL_DRAFT", summary: "Drafted a reply to Dana" },
  { action: "GOOGLECALENDAR_CREATE_EVENT", summary: "Found a free slot and sent the invite" },
  { action: "NOTION_CREATE_PAGE", summary: "Filed meeting notes in Notion" },
  { action: "SLACK_SEND_MESSAGE", summary: "Posted the stand-up summary in #team" },
  { action: "NOTION_UPDATE_PAGE", summary: "Updated the “Acme kickoff” page" },
  { action: "GOOGLECALENDAR_UPDATE_EVENT", summary: "Rescheduled the design review" },
  { action: "GMAIL_SEND_EMAIL", summary: "Sent this week’s invoice to Acme" },
];

const PAST_READS: readonly string[] = [
  "Read the #team thread",
  "Searched Gmail for this week’s invoices",
  "Checked your calendar for the week",
  "Looked up the “Acme kickoff” notes",
];

const PAST_SEARCHES: readonly string[] = [
  "pricing pages of three scheduling tools",
  "what changed in the Notion API this year",
  "places near the Acme office for a team dinner",
  "how other studios word a late-invoice reminder",
];

/** Everything Tex did since sign-up, oldest first. Each day's charges add up to `dailyCredits()`. */
function seedHappened(now: Date): Happened[] {
  const perDay = dailyCredits();
  const happened: Happened[] = [];
  for (let d = SIGNUP_DAYS_AGO; d >= 2; d--) {
    const total = perDay[d];
    const changes = Math.min(1 + (d % 3), total - 1);
    // On some days Scout looked something up. The rest of the day's credits are running time.
    const searches = d % 4 === 1 ? Math.max(0, Math.min(2, total - changes - 1)) : 0;
    const minute = (d * 7) % 50;
    happened.push(read(atDay(now, d, 10, minute), PAST_READS[d % PAST_READS.length]));
    for (let i = 0; i < changes; i++) {
      const change = PAST_CHANGES[(d + i * 3) % PAST_CHANGES.length];
      happened.push(changed(atDay(now, d, 10 + i * 2, minute + 2), change.action, change.summary));
    }
    for (let i = 0; i < searches; i++) {
      happened.push(searched(atDay(now, d, 11 + i * 2, minute + 5), PAST_SEARCHES[(d + i) % PAST_SEARCHES.length]));
    }
    happened.push(ranFor(atDay(now, d, 15, minute), total - changes - searches));
  }
  happened.push(
    automationRan(atDay(now, 1, 8), "Today’s meetings"),
    changed(atDay(now, 1, 17, 32), "SLACK_SEND_MESSAGE", "Posted yesterday’s update in #team"),
    automationRan(earlierToday(now, 390), "Today’s meetings"),
    changed(earlierToday(now, 207), "NOTION_CREATE_PAGE", "Filed notes from your voice note"),
    ranFor(earlierToday(now, 206), 2),
    searched(earlierToday(now, 140), "onboarding emails other B2B tools send in week one"),
    changed(earlierToday(now, 16), "GOOGLECALENDAR_UPDATE_EVENT", "Moved “Roadmap sync” to tomorrow, 3:00 PM"),
    ranFor(earlierToday(now, 15), 1),
  );
  return happened;
}

// ---------------------------------------------------------------- the seed

const PLAN_IDS: readonly PlanId[] = ["free", "pro", "max"];

/** `TEXTCREW_DEMO_PLAN=max` shows the Max-only screens (own MCP servers); the default is Pro. */
export function demoPlan(): PlanId {
  const wanted = process.env.TEXTCREW_DEMO_PLAN;
  return PLAN_IDS.includes(wanted as PlanId) ? (wanted as PlanId) : "pro";
}

export type AiMode = "platform" | "own_only";

/** `TEXTCREW_DEMO_AI_ACCESS_MODE=own_only` shows the screens as they are when Textcrew AI isn't on offer. */
export function demoAiMode(): AiMode {
  return process.env.TEXTCREW_DEMO_AI_ACCESS_MODE === "own_only" ? "own_only" : "platform";
}

function seedPlans(): Plan[] {
  const ownKey = "Your own AI, or Textcrew AI paid in credits";
  const topUp = "Top-ups: $10 for 800 credits";
  return [
    {
      id: "free", name: "Free", priceCents: 0, interval: null, monthlyCredits: 0, signupCredits: 100,
      limits: { apps: 10, automations: 1, ownMcpServers: false, topUps: false, models: "all", browser: false },
      features: ["100 credits at sign-up, plus coupon codes", "10 apps", "1 automation", ownKey],
    },
    {
      id: "pro", name: "Pro", priceCents: 1200, interval: "month", monthlyCredits: 1500, signupCredits: 0,
      limits: { apps: 25, automations: 5, ownMcpServers: false, topUps: true, models: "all", browser: false },
      features: ["1,500 credits every month", "All 25 apps", "5 automations", topUp, ownKey],
    },
    {
      id: "max", name: "Max", priceCents: 3000, interval: "month", monthlyCredits: 4500, signupCredits: 0,
      limits: { apps: 25, automations: 50, ownMcpServers: true, topUps: true, models: "all", browser: true },
      features: ["4,500 credits every month", "Priority when things get busy", "All 25 apps plus your own MCP servers", "50 automations", "Browser use: 2 credits per minute", topUp, ownKey],
    },
  ];
}

function seedApps(): App[] {
  const active = (id: string, accountLabel: string) => ({ id, accountLabel, status: "active" as const });
  const app = (slug: string, name: string, category: string, connections: App["connections"] = []): App => ({
    slug, name, iconUrl: null, category, availableOnPlan: true, connections,
  });
  return [
    app("gmail", "Gmail", "email", [active("con_gmail_1", "aarav@northwind.studio"), active("con_gmail_2", "aarav.shah@gmail.com")]),
    app("googlecalendar", "Google Calendar", "calendar", [active("con_calendar_1", "aarav@northwind.studio")]),
    app("notion", "Notion", "notes", [active("con_notion_1", "Northwind workspace")]),
    app("slack", "Slack", "chat", [active("con_slack_1", "Northwind")]),
    app("github", "GitHub", "dev", [{ id: "con_github_1", accountLabel: "aarav-shah", status: "expired" }]),
    app("googledrive", "Google Drive", "files"),
    app("googlesheets", "Google Sheets", "files"),
    app("linear", "Linear", "dev"),
    app("hubspot", "HubSpot", "crm"),
    app("trello", "Trello", "tasks"),
    app("asana", "Asana", "tasks"),
    app("todoist", "Todoist", "tasks"),
    app("airtable", "Airtable", "files"),
  ];
}

function seedAutomations(now: Date): Automation[] {
  const timezone = "Asia/Kolkata";
  const weekdays = [1, 2, 3, 4, 5];
  const created = atDay(now, SIGNUP_DAYS_AGO - 2, 11);
  return [
    {
      id: "aut_week", kind: "repeat", title: "Send me my week", instruction: "Read my calendar and inbox and send a short summary.",
      cron: "0 9 * * 1", timezone, enabled: true, pausedReason: null,
      nextRunAt: nearestRun(now, 9, [1], 1), lastRunAt: nearestRun(now, 9, [1], -1), createdAt: created,
    },
    {
      id: "aut_boss", kind: "event", title: "Tell me when my boss emails", instruction: "Message me the moment Dana emails.",
      trigger: { app: "gmail", event: "new_email_from_dana" }, timezone, enabled: true, pausedReason: null,
      nextRunAt: null, lastRunAt: atDay(now, 2, 16, 20), createdAt: created,
    },
    {
      id: "aut_meetings", kind: "repeat", title: "Today’s meetings", instruction: "Send me today’s meetings with who’s in each one.",
      cron: "0 8 * * 1-5", timezone, enabled: true, pausedReason: null,
      nextRunAt: nearestRun(now, 8, weekdays, 1), lastRunAt: nearestRun(now, 8, weekdays, -1), createdAt: created,
    },
    {
      id: "aut_invoice", kind: "once", title: "Chase the Acme invoice", instruction: "Remind me to chase invoice INV-2291.",
      runAt: atDay(now, -1, 10), timezone, enabled: true, pausedReason: null,
      nextRunAt: atDay(now, -1, 10), lastRunAt: null, createdAt: atDay(now, 3, 12, 5),
    },
    {
      id: "aut_lead", kind: "event", title: "New lead to CRM", instruction: "When a new lead fills my form, add it to my CRM.",
      trigger: { app: "hubspot", event: "new_form_submission" }, timezone, enabled: false, pausedReason: "failures",
      nextRunAt: null, lastRunAt: atDay(now, 1, 13, 40), createdAt: atDay(now, 6, 9, 30),
    },
  ];
}

function seedApprovals(now: Date): Approval[] {
  const pending = (createdAt: string) => ({ status: "pending" as const, createdAt, expiresAt: iso(Date.parse(createdAt) + DAY), decidedAt: null });
  return [
    {
      id: "ap_email", ...pending(earlierToday(now, 15)), summary: "Send this email to Maya", app: "gmail", action: "GMAIL_SEND_EMAIL",
      details: { arguments: { to: "maya@acme.com", from: "aarav@northwind.studio", subject: "Moving today’s 3pm",
        body: "Hi Maya, could we move today’s 3pm to tomorrow, same time? Thanks!",
      } },
    },
    {
      id: "ap_slack", ...pending(earlierToday(now, 88)), summary: "Post today’s update in #team", app: "slack", action: "SLACK_SEND_MESSAGE",
      details: { arguments: { channel: "#team", workspace: "Northwind", body: "Shipped the new onboarding flow, fixed 4 bugs, demo Thursday." } },
    },
    {
      id: "ap_drafts", ...pending(earlierToday(now, 230)), summary: "Delete 12 old drafts", app: "gmail", action: "GMAIL_DELETE_DRAFT",
      details: { arguments: { mailbox: "aarav@northwind.studio", count: 12, body: "Drafts older than 90 days in Gmail." } },
    },
    {
      id: "ap_update", status: "approved", summary: "Post yesterday’s update in #team", app: "slack", action: "SLACK_SEND_MESSAGE",
      details: { arguments: { channel: "#team", workspace: "Northwind", body: "Onboarding flow is in review, two bugs left, invoices went out." } },
      createdAt: atDay(now, 1, 17, 30), expiresAt: atDay(now, 0, 17, 30), decidedAt: atDay(now, 1, 17, 31),
    },
    {
      id: "ap_renew", status: "expired", summary: "Renew your Notion plan ($10)", app: "notion", action: "NOTION_RENEW_PLAN",
      details: { arguments: { amount: "$10.00", workspace: "Northwind", body: "Monthly renewal, same plan as last month." } },
      createdAt: atDay(now, 4, 9, 12), expiresAt: atDay(now, 3, 9, 12), decidedAt: null,
    },
  ];
}

function seedMessages(now: Date): Message[] {
  const message = (id: string, minutesAgo: number, rest: Omit<Message, "id" | "createdAt">): Message => ({
    id, createdAt: earlierToday(now, minutesAgo), ...rest,
  });
  const thread: Message[] = [
    message("msg_1", 208, {
      channel: "telegram", direction: "in", status: "read", approvalId: null,
      text: "Acme kickoff: budget signed off, launch moves to the 20th, Dana owns the brief.",
      attachments: [{ id: "att_voice_1", name: "voice-note.ogg", mimeType: "audio/ogg" }],
    }),
    message("msg_2", 207, {
      channel: "telegram", direction: "out", status: "delivered", approvalId: null,
      text: "Filed. Tidy notes are on your “Acme kickoff” page in Notion.",
    }),
    message("msg_3", 17, {
      channel: "telegram", direction: "in", status: "read", approvalId: null,
      text: "Move my 3pm with Maya to tomorrow and let her know",
    }),
    message("msg_4", 16, {
      channel: "telegram", direction: "out", status: "delivered", approvalId: null,
      text: "On it. Your 3pm is “Roadmap sync”. Moving it to tomorrow, same time.",
    }),
    // As the backend does it: the ask is its own message carrying the approval, then Tex's words.
    message("msg_5", 15, {
      channel: "telegram", direction: "out", status: "delivered", approvalId: "ap_email",
      text: "Approval needed: Send this email to Maya",
    }),
    message("msg_6", 15, {
      channel: "telegram", direction: "out", status: "delivered", approvalId: null,
      text: "The meeting is moved. I’ve drafted a note to Maya; it needs your OK before I send it.",
    }),
  ];
  return thread.reverse();
}

/** Ledger (newest first), activity (newest first), per-day usage and what's left of each grant. */
function seedMoney(now: Date) {
  const signedUp = atDay(now, SIGNUP_DAYS_AGO, 9, 40);
  const proSince = atDay(now, PRO_SINCE_DAYS_AGO, 9, 0);
  const lifetime = CREDIT_LIFETIME_DAYS * DAY;
  const grants: CreditGrant[] = [
    { id: "grant_signup", source: "signup", amount: 100, remaining: 100, cheapModelOnly: false, createdAt: signedUp, expiresAt: iso(Date.parse(signedUp) + lifetime) },
    { id: "grant_coupon", source: "coupon", amount: 800, remaining: 800, cheapModelOnly: true, createdAt: iso(Date.parse(signedUp) + 20 * MINUTE), expiresAt: iso(Date.parse(signedUp) + 20 * MINUTE + lifetime) },
    { id: "grant_monthly", source: "monthly", amount: 1500, remaining: 1500, cheapModelOnly: false, createdAt: proSince, expiresAt: iso(Date.parse(proSince) + lifetime) },
  ];

  const ledger: LedgerEntry[] = [
    { id: "led_g1", delta: 100, reason: "grant", grantId: "grant_signup", description: "Sign-up credits", createdAt: signedUp },
    { id: "led_g2", delta: 800, reason: "grant", grantId: "grant_coupon", description: "Coupon redeemed", createdAt: grants[1].createdAt },
    { id: "led_g3", delta: 1500, reason: "grant", grantId: "grant_monthly", description: "Pro monthly credits", createdAt: proSince },
  ];
  const activity: ActivityEntry[] = [
    { id: "act_s1", actor: "user", action: "channel_linked", summary: "Linked Telegram", creditsCharged: null, createdAt: iso(Date.parse(signedUp) + 5 * MINUTE) },
    { id: "act_s2", actor: "user", action: "coupon_redeemed", summary: "Redeemed a coupon for 800 credits", creditsCharged: null, createdAt: grants[1].createdAt },
    { id: "act_s3", actor: "user", action: "app_connected", summary: "Connected Gmail", creditsCharged: null, createdAt: atDay(now, SIGNUP_DAYS_AGO - 2, 10, 15) },
    { id: "act_s4", actor: "system", action: "approval_expired", summary: "“Renew your Notion plan ($10)” expired with no answer", creditsCharged: null, createdAt: atDay(now, 3, 9, 12) },
    { id: "act_s5", actor: "user", action: "approval_decided", summary: "Approved “Post yesterday’s update in #team”", creditsCharged: null, createdAt: atDay(now, 1, 17, 31) },
    { id: "act_s6", actor: "agent", action: "approval_requested", summary: "Asked to delete 12 old drafts", creditsCharged: null, createdAt: earlierToday(now, 230) },
    { id: "act_s7", actor: "agent", action: "approval_requested", summary: "Asked to post today’s update in #team", creditsCharged: null, createdAt: earlierToday(now, 88) },
    { id: "act_s8", actor: "agent", action: "approval_requested", summary: "Asked to send an email to Maya", creditsCharged: null, createdAt: earlierToday(now, 15) },
  ];

  // Spend the oldest-expiring credits first, exactly as the real ledger does.
  const usage: Record<string, DayUsage> = {};
  seedHappened(now).forEach(({ at, charge, did }, index) => {
    if (charge) {
      let left = charge.amount;
      let firstGrant: string | null = null;
      for (const grant of grants) {
        if (left === 0) break;
        const take = Math.min(left, grant.remaining);
        if (take === 0) continue;
        grant.remaining -= take;
        left -= take;
        firstGrant ??= grant.id;
      }
      ledger.push({ id: `led_c${index}`, delta: -charge.amount, reason: "charge", grantId: firstGrant, description: charge.description, createdAt: at });
      const day = (usage[dayKey(new Date(at))] ??= emptyDay());
      day[charge.part] += charge.amount;
    }
    if (did) activity.push({ id: `act_c${index}`, actor: "agent", ...did, createdAt: at });
  });

  const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return { grants, ledger: ledger.sort(newestFirst), activity: activity.sort(newestFirst), usage, proSince };
}

function seedSubscription(plan: PlanId, now: Date, proSince: string): Subscription {
  if (plan === "free") return { plan, status: "none", currentPeriodStart: null, currentPeriodEnd: null };
  return { plan, status: "active", currentPeriodStart: proSince, currentPeriodEnd: atDay(now, -20, 9, 0) };
}

function seedMcpServers(plan: PlanId, now: Date): McpServer[] {
  if (plan !== "max") return [];
  return [
    { id: "mcp_crm", name: "Northwind CRM", url: "https://mcp.northwind.studio/crm", enabled: true, hasSecret: true, lastError: null, createdAt: atDay(now, 6, 14, 0) },
    { id: "mcp_billing", name: "Billing tools", url: "https://tools.northwind.studio/mcp", enabled: false, hasSecret: true, lastError: "401 from server. Check the secret.", createdAt: atDay(now, 2, 11, 30) },
  ];
}

export function createSeed(now: Date, plan: PlanId = demoPlan()): DemoData {
  const money = seedMoney(now);
  const aiMode = demoAiMode();
  const signedUp = atDay(now, SIGNUP_DAYS_AGO, 9, 40);
  return {
    user: {
      id: "user_demo", email: "aarav@northwind.studio", emailVerified: true, name: "Aarav Shah",
      timezone: "Asia/Kolkata", plan, role: "user", createdAt: signedUp,
    },
    availableChannels: ["telegram", "web"],
    channels: [{ id: "ch_telegram", channel: "telegram", displayId: "@aarav_s", linkedAt: iso(Date.parse(signedUp) + 5 * MINUTE) }],
    messages: seedMessages(now),
    sentIds: {},
    attachments: {},
    approvals: seedApprovals(now),
    approvalReplies: {
      ap_email: {
        approved: "Done. Moved to tomorrow at 3pm and Maya has the note.",
        rejected: "Okay, I won’t send it. The meeting is still moved. Want me to change the note?",
      },
      ap_slack: { approved: "Posted in #team.", rejected: "Okay, I won’t post it." },
      ap_drafts: { approved: "Done. The 12 old drafts are gone.", rejected: "Okay, I’ll leave the drafts alone." },
    },
    apps: seedApps(),
    mcpServers: seedMcpServers(plan, now),
    byok: [
      { provider: "anthropic", set: true, last4: "x7Qd", model: "claude-sonnet-5-5", updatedAt: atDay(now, SIGNUP_DAYS_AGO, 9, 55) },
      { provider: "openai", set: false, last4: null, model: null, updatedAt: null },
      { provider: "openrouter", set: false, last4: null, model: null, updatedAt: null },
    ],
    automations: seedAutomations(now),
    agentStatus: { state: "awake", lastActiveAt: earlierToday(now, 15) },
    agentSettings: {
      runtime: "hermes", effectiveRuntime: "hermes", aiAccess: "own_key",
      aiPreference: "auto", platformAvailable: aiMode === "platform",
      claude: { connected: false, connectedAt: null }, ownKeyProviders: ["anthropic"],
    },
    aiMode,
    claudeLogins: {},
    plans: seedPlans(),
    topUps: [{ id: "topup_10", priceCents: 1000, credits: 800, expiresInDays: CREDIT_LIFETIME_DAYS }],
    subscription: seedSubscription(plan, now, money.proSince),
    grants: money.grants,
    ledger: money.ledger,
    activity: money.activity,
    usage: money.usage,
    redeemedCoupons: [],
  };
}
