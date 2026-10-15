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
  Conversation,
  CreditGrant,
  CrewJob,
  GithubRepo,
  LedgerEntry,
  McpServer,
  Me,
  Memory,
  Message,
  Plan,
  PlanId,
  Subscription,
  TopUpPack,
} from "@/lib/api/client";
import { AUTOMATIONS_TITLE } from "@/lib/conversations";
import { conversationTitle } from "./context";
import { prFindingsReply } from "./replies";

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

/** A crew job as the demo keeps it: the job, and the request id that made it (for idempotent sends). */
export type DemoCrewJob = CrewJob & { clientRequestId: string | null };

/** What the automation itself doesn't carry: which repo it watches and where the verdict goes. */
export type DemoPrReview = { automationId: string; owner: string; repo: string; channel: ChannelType };

export type DemoData = {
  user: Omit<Me, "credits">;
  /** The channels that are switched on, like the backend's ENABLED_CHANNELS: Telegram and the web chat at launch. */
  availableChannels: ChannelType[];
  channels: ChannelLink[];
  /**
   * Every conversation, in no order (the API sorts them by `lastMessageAt`). As the backend keeps
   * them: one per chat and epoch, the epoch rising by one at each new chat, and one web
   * conversation `active` at a time.
   */
  conversations: Conversation[];
  /** Newest first, like the API returns them. Each belongs to one conversation. */
  messages: Message[];
  /** clientMessageId → message id, for idempotent sends. */
  sentIds: Record<string, string>;
  /** When a new chat was last started, for the limit of 30 an hour. */
  newChatCalls: number[];
  attachments: Record<string, Attachment>;
  approvals: Approval[];
  /** What Tex says after an approval is decided. */
  approvalReplies: Record<string, { approved: string; rejected: string }>;
  apps: App[];
  mcpServers: McpServer[];
  byok: ByokKey[];
  automations: Automation[];
  /** The repos with pull-request review on. Each one belongs to an automation with `preset: pr_review`. */
  prReviews: DemoPrReview[];
  /** When review was last turned on, for the limit of 30 an hour. */
  prReviewCalls: number[];
  /** The crew jobs, newest first: a brief for Patch or Byte, run as one turn, with its report. */
  crewJobs: DemoCrewJob[];
  /** When a job was last given, for the limit of 20 an hour. */
  crewJobCalls: number[];
  /** The connected GitHub account's repos, as `GET /v1/github/repos` lists them. */
  githubRepos: GithubRepo[];
  agentStatus: AgentStatus;
  agentSettings: AgentSettings;
  /** Like the backend's AI_ACCESS_MODE: `platform` offers Textcrew AI, `own_only` requires the user's own AI. */
  aiMode: AiMode;
  /** Like the backend's CREW_AVAILABLE: the specialists that work yet. Tex always does. */
  crewAvailable: SpecialistId[];
  /** What Tex has saved about the person, newest first. */
  memories: Memory[];
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
  const today = 9;
  const yesterday = 2;
  const rest = 505;
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
  /** `actor` is the agent unless it says otherwise; `crew` names the specialist a progress line belongs to. */
  did?: {
    action: string;
    summary: string;
    creditsCharged: number | null;
    actor?: ActivityEntry["actor"];
    crew?: ActivityEntry["crew"];
    /** The memory a memory entry is about. The log never holds its text. */
    memoryId?: string;
  };
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

/** Scout read a page it was given (free). The address is logged without its query string, as in the backend. */
const readPage = (at: string, address: string): Happened => ({ at, did: { action: "read_page", summary: `Read ${address}`, creditsCharged: null } });

/** A page Scout asked for that it had not been given: not opened, and logged so it can be seen. */
const refusedPage = (at: string, address: string): Happened => ({
  at,
  did: { action: "read_page_refused", summary: `Refused to read ${address}`, creditsCharged: null },
});

/** A progress line from a specialist, as the backend saves it: the text starts with the member's name. */
const progress = (at: string, crew: NonNullable<ActivityEntry["crew"]>, text: string): Happened => ({
  at,
  did: { action: "crew_progress", summary: text, creditsCharged: null, crew },
});

/** The review Patch posted today, on the repo that has pull-request review on. */
export const REVIEWED = { owner: "northwind", repo: "website", number: 128, headSha: "4f2a9c1" } as const;

/**
 * One pull-request review, start to finish: the platform asks for it, Patch works, the review is
 * posted without a per-comment approval (review is on for that repo) and costs 1 credit like any
 * app action that changes something, plus the time the agent ran.
 */
function reviewedPullRequest(now: Date): Happened[] {
  const name = `${REVIEWED.owner}/${REVIEWED.repo}`;
  return [
    {
      at: earlierToday(now, 96),
      did: { actor: "system", action: "pr_review_requested", summary: `Review of ${name}#${REVIEWED.number} at ${REVIEWED.headSha} requested`, creditsCharged: null },
    },
    progress(earlierToday(now, 95), "patch", `Patch: review pull request #${REVIEWED.number} in ${name}`),
    changed(earlierToday(now, 93), "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST", `Ran GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST (pull-request review is on for ${name})`),
    progress(earlierToday(now, 93), "patch", "Patch: done"),
    ranFor(earlierToday(now, 92), 1),
  ];
}

// ---------------------------------------------------------------- memory

/** The most memories an account can hold, as in the backend. */
export const MEMORY_MAX = 200;

/** A memory Tex saved and the person later deleted: the log still names it, the list no longer has it. */
const DELETED_MEMORY = "mem_old_office";

/** What Tex has saved about the person, newest first, a few of each kind. */
function seedMemories(now: Date): Memory[] {
  const memory = (
    id: string, kind: Memory["kind"], content: string, savedDaysAgo: number,
    rest: { corrected?: string; used?: [count: number, last: string] } = {},
  ): Memory => {
    const createdAt = atDay(now, savedDaysAgo, 10, 30);
    return {
      id, kind, content, createdAt, updatedAt: rest.corrected ?? createdAt,
      lastUsedAt: rest.used?.[1] ?? null, useCount: rest.used?.[0] ?? 0,
    };
  };
  return [
    memory("mem_acme_launch", "project", "Acme is their biggest client; the launch is on the 20th and Dana owns the brief", 0, { used: [1, earlierToday(now, 16)] }),
    memory("mem_meetings", "preference", "Likes meetings after 11am, and none on Fridays", 2, { used: [3, earlierToday(now, 17)] }),
    memory("mem_maya", "person", "Maya is their main contact at Acme", 5, { corrected: atDay(now, 1, 17, 40), used: [5, earlierToday(now, 17)] }),
    memory("mem_website", "project", "northwind/website is the marketing site, built with Next.js", 8, { used: [2, earlierToday(now, 95)] }),
    memory("mem_cc_dana", "instruction", "Always cc Dana on emails to Acme", 12, { used: [4, atDay(now, 1, 17, 30)] }),
    memory("mem_dana", "person", "Dana is their boss and signs off on budgets", 12, { used: [6, atDay(now, 2, 16, 20)] }),
    memory("mem_city", "fact", "Works from Bengaluru, on India time", SIGNUP_DAYS_AGO - 1),
    memory("mem_short", "preference", "Prefers short replies with no emoji", SIGNUP_DAYS_AGO - 1, { used: [2, atDay(now, 9, 11, 0)] }),
  ];
}

/** What the memory tools left in the activity log. As in the backend, an entry names the memory and never holds its text. */
function memoryTrail(now: Date): Happened[] {
  const saved = (at: string, memoryId: string, kind: Memory["kind"]): Happened => ({
    at,
    did: { action: "remember", summary: `Saved a memory (${kind})`, creditsCharged: null, memoryId },
  });
  return [
    saved(atDay(now, SIGNUP_DAYS_AGO - 1, 10, 30), "mem_short", "preference"),
    saved(atDay(now, SIGNUP_DAYS_AGO - 1, 10, 31), "mem_city", "fact"),
    saved(atDay(now, 14, 15, 5), DELETED_MEMORY, "fact"),
    saved(atDay(now, 12, 10, 30), "mem_dana", "person"),
    saved(atDay(now, 12, 10, 31), "mem_cc_dana", "instruction"),
    { at: atDay(now, 10, 9, 12), did: { actor: "user", action: "memory_deleted", summary: "Deleted a memory", creditsCharged: null, memoryId: DELETED_MEMORY } },
    saved(atDay(now, 8, 10, 30), "mem_website", "project"),
    { at: atDay(now, 6, 14, 2), did: { action: "memory_refused", summary: "Refused to save a memory: it looked like an API key", creditsCharged: null } },
    saved(atDay(now, 5, 10, 30), "mem_maya", "person"),
    saved(atDay(now, 2, 10, 30), "mem_meetings", "preference"),
    { at: atDay(now, 1, 17, 40), did: { action: "forget", summary: "Corrected a memory", creditsCharged: null, memoryId: "mem_maya" } },
    { at: earlierToday(now, 17), did: { action: "recall", summary: "Searched memory (2 found)", creditsCharged: null } },
  ];
}

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
    ...memoryTrail(now),
    automationRan(atDay(now, 1, 8), "Today’s meetings"),
    changed(atDay(now, 1, 17, 32), "SLACK_SEND_MESSAGE", "Posted yesterday’s update in #team"),
    automationRan(earlierToday(now, 390), "Today’s meetings"),
    changed(earlierToday(now, 207), "NOTION_CREATE_PAGE", "Filed notes from your voice note"),
    { at: earlierToday(now, 207), did: { action: "remember", summary: "Saved a memory (project)", creditsCharged: null, memoryId: "mem_acme_launch" } },
    ranFor(earlierToday(now, 206), 2),
    // Scout looked something up: one paid search, two pages read for free, one address it had no business opening.
    progress(earlierToday(now, 141), "scout", "Scout: find what other B2B tools send in week one"),
    searched(earlierToday(now, 140), "onboarding emails other B2B tools send in week one"),
    readPage(earlierToday(now, 140), "https://saasletters.example/week-one-emails"),
    readPage(earlierToday(now, 139), "https://growthnotes.example/onboarding-teardowns"),
    refusedPage(earlierToday(now, 139), "https://collect.example/save"),
    progress(earlierToday(now, 138), "scout", "Scout: done"),
    ...reviewedPullRequest(now),
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

const ALL_EFFORTS: AgentSettings["claudeChoices"]["efforts"] = ["low", "medium", "high", "xhigh", "max"];
const NO_XHIGH: AgentSettings["claudeChoices"]["efforts"] = ["low", "medium", "high", "max"];
const FABLE_NOTE = "Pro: paid with usage credits. Max: up to half your weekly limit, then usage credits.";

/**
 * What Claude Code's model and effort can be set to, as the backend offers them (`claudeChoices`):
 * every Claude model Claude Code can use, the current ones first, each with the levels it takes.
 * Null in the settings is Claude Code's own default.
 */
export const CLAUDE_CHOICES: AgentSettings["claudeChoices"] = {
  models: [
    { id: "claude-opus-5-5", label: "Opus 5.5", group: "current", efforts: ALL_EFFORTS },
    { id: "claude-sonnet-5-5", label: "Sonnet 5.5", group: "current", efforts: ALL_EFFORTS },
    { id: "claude-haiku-5-5", label: "Haiku 5.5", group: "current", efforts: ALL_EFFORTS },
    { id: "claude-fable-5-1", label: "Fable 5.1", group: "current", efforts: ALL_EFFORTS, note: FABLE_NOTE },
    { id: "claude-fable-5", label: "Fable 5", group: "older", efforts: ALL_EFFORTS, note: FABLE_NOTE },
    { id: "claude-opus-5", label: "Opus 5", group: "older", efforts: ALL_EFFORTS },
    { id: "claude-sonnet-5", label: "Sonnet 5", group: "older", efforts: ALL_EFFORTS },
    { id: "claude-opus-4-8", label: "Opus 4.8", group: "older", efforts: ALL_EFFORTS },
    { id: "claude-opus-4-7", label: "Opus 4.7", group: "older", efforts: ALL_EFFORTS },
    { id: "claude-opus-4-6", label: "Opus 4.6", group: "older", efforts: NO_XHIGH },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", group: "older", efforts: NO_XHIGH },
    { id: "claude-opus-4-5", label: "Opus 4.5", group: "older", efforts: [] },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", group: "older", efforts: [] },
  ],
  efforts: ALL_EFFORTS,
};

/**
 * `TEXTCREW_DEMO_AUTOMATIONS_CHAT=none`: the account's automations were all made before the
 * Automations chat existed and none has run since, so the backend hasn't started it yet. The demo's
 * run, about 20 seconds after the app first connects, starts it.
 */
export function demoHasAutomationsChat(): boolean {
  return process.env.TEXTCREW_DEMO_AUTOMATIONS_CHAT !== "none";
}

const SPECIALISTS = ["byte", "patch", "scout"] as const;
export type SpecialistId = (typeof SPECIALISTS)[number];

/**
 * Like the backend's CREW_AVAILABLE: the specialists that are switched on. All three by default.
 * `TEXTCREW_DEMO_CREW_AVAILABLE=byte` shows the others as coming soon; set it to nothing for none.
 */
export function demoCrewAvailable(): SpecialistId[] {
  const wanted = process.env.TEXTCREW_DEMO_CREW_AVAILABLE;
  if (wanted === undefined) return [...SPECIALISTS];
  const asked = wanted.split(",").map((id) => id.trim().toLowerCase());
  return SPECIALISTS.filter((id) => asked.includes(id));
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

/**
 * Apps the demo has no setup for, the way a server only has a Composio setup for some of the
 * catalog (`connectable: false`). They are listed, and can't be connected yet.
 */
export const NOT_CONNECTABLE: readonly string[] = ["hubspot", "asana", "airtable"];

/** Whose sign-in comes next and what Tex can do with each app, in the backend's own words (its catalog). */
const APP_ABOUT: Record<string, { provider: string; description: string }> = {
  gmail: { provider: "Google", description: "Read and search your email, write drafts and send email for you." },
  googlecalendar: { provider: "Google", description: "See your events, find free time, and add or change events." },
  notion: { provider: "Notion", description: "Search and read your pages, and write new ones." },
  slack: { provider: "Slack", description: "Read your channels and messages, and send messages for you." },
  github: { provider: "GitHub", description: "Read your repos, issues and pull requests, and open or comment on them." },
  googledrive: { provider: "Google", description: "Find and read the files in your Drive, and add or organize files." },
  googlesheets: { provider: "Google", description: "Read your spreadsheets, and add or update rows." },
  linear: { provider: "Linear", description: "See your issues and projects, and open or update issues." },
  hubspot: { provider: "HubSpot", description: "Look up contacts, companies and deals, and add or update them." },
  trello: { provider: "Trello", description: "See your boards and cards, and add or move cards." },
  asana: { provider: "Asana", description: "See your projects and tasks, and add or update tasks." },
  todoist: { provider: "Todoist", description: "See your tasks, add new ones and tick them off." },
  airtable: { provider: "Airtable", description: "Read your bases, and add or update records." },
};

function seedApps(): App[] {
  const active = (id: string, accountLabel: string) => ({ id, accountLabel, status: "active" as const });
  const app = (slug: string, name: string, category: string, connections: App["connections"] = []): App => ({
    slug, name, ...APP_ABOUT[slug], iconUrl: null, category, availableOnPlan: true, connectable: !NOT_CONNECTABLE.includes(slug), connections,
  });
  return [
    app("gmail", "Gmail", "email", [active("con_gmail_1", "aarav@northwind.studio"), active("con_gmail_2", "aarav.shah@gmail.com")]),
    app("googlecalendar", "Google Calendar", "calendar", [active("con_calendar_1", "aarav@northwind.studio")]),
    app("notion", "Notion", "notes", [active("con_notion_1", "Northwind workspace")]),
    app("slack", "Slack", "chat", [active("con_slack_1", "Northwind")]),
    app("github", "GitHub", "dev", [active("con_github_1", "aarav-shah")]),
    app("googledrive", "Google Drive", "files", [{ id: "con_drive_1", accountLabel: "aarav@northwind.studio", status: "expired" }]),
    app("googlesheets", "Google Sheets", "files"),
    app("linear", "Linear", "dev"),
    app("hubspot", "HubSpot", "crm"),
    app("trello", "Trello", "tasks"),
    app("asana", "Asana", "tasks"),
    app("todoist", "Todoist", "tasks"),
    app("airtable", "Airtable", "files"),
  ];
}

/** The GitHub account's repos, pushed to most recently first. */
function seedGithubRepos(now: Date): GithubRepo[] {
  const repo = (owner: string, name: string, isPrivate: boolean, daysAgo: number, defaultBranch = "main"): GithubRepo => ({
    owner, name, fullName: `${owner}/${name}`, private: isPrivate, defaultBranch, pushedAt: atDay(now, daysAgo, 11, 20),
  });
  return [
    repo("northwind", "website", false, 0),
    repo("northwind", "api", true, 1),
    repo("northwind", "mobile", true, 3, "develop"),
    repo("northwind", "design-system", false, 9),
    repo("aarav-shah", "dotfiles", false, 40, "master"),
  ];
}

/** The report Patch wrote for the seeded job, in the report's shape. */
export const SEED_JOB_REPORT = [
  "**Verdict:** fix first",
  "",
  "**Findings**",
  "1. [high] `lib/checkout/discount.ts:41`: a coupon and a plan change in the same order are both applied, so the customer pays too little.",
  "2. [medium] `app/api/webhooks/route.ts:18`: the signature is checked after the body is parsed; a bad body throws before the check.",
  "3. [low] `lib/checkout/discount.test.ts`: no test for a coupon together with a plan change.",
  "",
  "**Tests run**",
  "- `pnpm install`: done",
  "- `pnpm test`: passed (214 passed, 0 failed)",
  "",
  "**Not checked**",
  "- The mobile layout of the checkout: it needs a browser.",
].join("\n");

/** One review Patch finished this morning, and one job of Byte's that failed yesterday. */
function seedCrewJobs(now: Date): DemoCrewJob[] {
  const base = {
    instructions: "", acceptance: "", commands: "", conversationId: null, source: "app" as const, clientRequestId: null,
  };
  return [
    {
      ...base,
      id: "crj_seed_review", member: "patch", status: "done", title: "Review northwind/website#131",
      owner: "northwind", repo: "website", pullNumber: 131, branch: null,
      instructions: "The discount code changed. Look hard at it.", focus: ["bugs", "security", "tests"],
      commands: "pnpm install && pnpm test", finish: null,
      reportTo: { channel: "web", pullRequest: true, issue: false },
      report: SEED_JOB_REPORT, error: null,
      createdAt: earlierToday(now, 70), startedAt: earlierToday(now, 70), finishedAt: earlierToday(now, 63),
    },
    {
      ...base,
      id: "crj_seed_fix", member: "byte", status: "failed", title: "Make the signup form remember the email in northwind/website",
      owner: "northwind", repo: "website", pullNumber: null, branch: null,
      instructions: "Make the signup form remember the email when the password is wrong.", focus: [],
      acceptance: "A wrong password keeps the email in the field.", finish: "pull_request",
      reportTo: { channel: "telegram", pullRequest: true, issue: false },
      report: null, error: "The agent couldn't finish the job. The chat says why.",
      createdAt: atDay(now, 1, 18, 5), startedAt: atDay(now, 1, 18, 5), finishedAt: atDay(now, 1, 18, 19),
    },
  ];
}

/** The repos with pull-request review on: one working, one paused after its reviews kept failing. */
const SEED_REVIEWS: readonly DemoPrReview[] = [
  { automationId: "aut_pr_website", owner: REVIEWED.owner, repo: REVIEWED.repo, channel: "telegram" },
  { automationId: "aut_pr_api", owner: "northwind", repo: "api", channel: "telegram" },
];

/** A repo with review on is an automation like any other, with the preset that marks it. */
export function reviewAutomation(id: string, name: string, timezone: string, createdAt: string): Automation {
  return {
    id, kind: "event", title: `Review pull requests in ${name}`, instruction: `Have Patch review each pull request in ${name}.`,
    trigger: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT" }, preset: "pr_review", timezone, enabled: true, pausedReason: null,
    nextRunAt: null, lastRunAt: null, createdAt,
  };
}

// Four of the Pro plan's five, so one more repo can be given review before the limit is reached.
function seedAutomations(now: Date): Automation[] {
  const timezone = "Asia/Kolkata";
  const weekdays = [1, 2, 3, 4, 5];
  const created = atDay(now, SIGNUP_DAYS_AGO - 2, 11);
  return [
    {
      id: "aut_meetings", kind: "repeat", title: "Today’s meetings", instruction: "Send me today’s meetings with who’s in each one.",
      cron: "0 8 * * 1-5", timezone, preset: null, enabled: true, pausedReason: null,
      nextRunAt: nearestRun(now, 8, weekdays, 1), lastRunAt: nearestRun(now, 8, weekdays, -1), createdAt: created,
    },
    {
      id: "aut_invoice", kind: "once", title: "Chase the Acme invoice", instruction: "Remind me to chase invoice INV-2291.",
      runAt: atDay(now, -1, 10), timezone, preset: null, enabled: true, pausedReason: null,
      nextRunAt: atDay(now, -1, 10), lastRunAt: null, createdAt: atDay(now, 3, 12, 5),
    },
    { ...reviewAutomation("aut_pr_website", "northwind/website", timezone, atDay(now, 8, 10, 30)), lastRunAt: earlierToday(now, 93) },
    {
      ...reviewAutomation("aut_pr_api", "northwind/api", timezone, atDay(now, 6, 9, 30)),
      enabled: false, pausedReason: "failures", lastRunAt: atDay(now, 2, 16, 20),
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

/** How the backend's copy of a run's answer reads in the chat app the automation was made in. */
export function runCopyText(title: string, icon: "⏰" | "⚡", text: string): string {
  return `${icon} ${title}\n\n${text}\n\nTo follow up, open the Automations chat in the Textcrew web app: https://app.textcrew.in/?chat=automations`;
}

/**
 * The chats so far: two on Telegram and two in the web chat, the later of each the active one, and
 * the Automations chat, where every run of every automation answers (pinned apart in the app).
 * All of Tex's replies are plain text but one, in the active web chat, which is written in Markdown.
 * Each conversation's title and `lastMessageAt` come from its messages, as the backend derives them.
 * The pull-request review was turned on with Telegram linked, so its verdict also went there as a copy.
 */
function seedChats(now: Date, withAutomationsChat: boolean): { conversations: Conversation[]; messages: Message[] } {
  type Line = Omit<Message, "id" | "createdAt" | "conversationId" | "channel" | "approvalId"> & { approvalId?: string };
  const conversations: Conversation[] = [];
  const messages: Message[] = [];

  /** One conversation, oldest message first. `at` is when each message was said. */
  const chat = (id: string, channel: ChannelType, epoch: number, active: boolean, lines: [id: string, at: string, line: Line][], kind: "chat" | "automations" = "chat") => {
    for (const [messageId, at, line] of lines) {
      messages.push({ id: messageId, conversationId: id, channel, createdAt: at, approvalId: null, ...line });
    }
    const firstIncoming = lines.find(([, , line]) => line.direction === "in");
    conversations.push({
      id, channel, kind, epoch, active,
      startedAt: lines[0][1],
      lastMessageAt: lines[lines.length - 1][1],
      title: kind === "automations" ? AUTOMATIONS_TITLE : conversationTitle(firstIncoming?.[2].text ?? ""),
    });
  };
  const verdict = `Patch reviewed pull request #${REVIEWED.number} in ${REVIEWED.owner}/${REVIEWED.repo}. Two things to fix before you merge: the discount is applied twice when a coupon and a plan change land together, and the new webhook handler has no test. The details are on the pull request.`;

  chat("cnv_tg_0", "telegram", 0, false, [
    ["msg_t1", atDay(now, 6, 10, 5), { direction: "in", status: "read", text: "What’s on my calendar on Thursday?" }],
    ["msg_t2", atDay(now, 6, 10, 6), { direction: "out", status: "delivered", text: "Thursday: “Roadmap sync” at 3pm and the dentist at 5:30. Nothing before noon." }],
  ]);
  chat("cnv_web_0", "web", 0, false, [
    ["msg_w1", atDay(now, 2, 16, 20), { direction: "in", status: "read", text: "Draft a short update for the team about Friday’s offsite" }],
    ["msg_w2", atDay(now, 2, 16, 21), { direction: "out", status: "sent", text: "Here’s a draft: “Offsite is Friday, 10 to 4, at the studio. Lunch is covered, bring a laptop.” Want it shorter?" }],
    ["msg_w3", atDay(now, 2, 16, 24), { direction: "in", status: "read", text: "That works, thanks" }],
    ["msg_w4", atDay(now, 2, 16, 24), { direction: "out", status: "sent", text: "Good. Say the word and I’ll post it in #team; that one will need your OK." }],
  ]);
  chat("cnv_tg_1", "telegram", 1, true, [
    ["msg_1", earlierToday(now, 208), {
      direction: "in", status: "read",
      text: "Acme kickoff: budget signed off, launch moves to the 20th, Dana owns the brief.",
      attachments: [{ id: "att_voice_1", name: "voice-note.ogg", mimeType: "audio/ogg" }],
    }],
    ["msg_2", earlierToday(now, 207), { direction: "out", status: "delivered", text: "Filed. Tidy notes are on your “Acme kickoff” page in Notion." }],
    // A copy of the verdict that is kept in the Automations chat (the review was turned on with Telegram linked).
    ["msg_review_copy", earlierToday(now, 92), {
      direction: "out", status: "delivered",
      text: runCopyText(`Review pull requests in ${REVIEWED.owner}/${REVIEWED.repo}`, "⚡", verdict),
    }],
    ["msg_3", earlierToday(now, 17), { direction: "in", status: "read", text: "Move my 3pm with Maya to tomorrow and let her know" }],
    ["msg_4", earlierToday(now, 16), { direction: "out", status: "delivered", text: "On it. Your 3pm is “Roadmap sync”. Moving it to tomorrow, same time." }],
    // As the backend does it: the ask is its own message carrying the approval, then Tex's words.
    ["msg_5", earlierToday(now, 15), { direction: "out", status: "delivered", approvalId: "ap_email", text: "I'd like to send this email to Maya. Approve or Deny below." }],
    ["msg_6", earlierToday(now, 15), { direction: "out", status: "delivered", text: "The meeting is moved. I’ve drafted a note to Maya; it needs your OK before I send it." }],
  ]);
  chat("cnv_web_1", "web", 1, true, [
    ["msg_w5", earlierToday(now, 55), { direction: "in", status: "read", text: "What did you get done for me yesterday?" }],
    ["msg_w6", earlierToday(now, 54), { direction: "out", status: "sent", text: "Yesterday I posted your update in #team once you gave the OK, and filed two sets of meeting notes in Notion. Nothing from then is waiting on you." }],
    ["msg_w7", earlierToday(now, 41), { direction: "in", status: "read", text: `What did Patch find in pull request #${REVIEWED.number}? What should I fix first?` }],
    // An answer written in Markdown, as Tex writes for the web chat: a heading, a table, code, a list, a link.
    ["msg_w8", earlierToday(now, 40), { direction: "out", status: "sent", text: prFindingsReply(REVIEWED.number) }],
  ]);

  // Every run answers here: the weekday meetings list, and the pull-request review's verdict.
  const weekdays = [1, 2, 3, 4, 5];
  const lastMeetings = nearestRun(now, 8, weekdays, -1);
  const meetingsBefore = nearestRun(new Date(Date.parse(lastMeetings) - 60_000), 8, weekdays, -1);
  const runs: [id: string, at: string, line: Line][] = [
    ["msg_run_1", meetingsBefore, { direction: "out", status: "sent", text: "Today: “Design review” at 11 with Priya, and a 1:1 with Dev at 4. The rest of your afternoon is free." }],
    ["msg_review", earlierToday(now, 92), { direction: "out", status: "sent", text: verdict }],
    ["msg_run_2", lastMeetings, { direction: "out", status: "sent", text: "Today: “Roadmap sync” at 3pm with Maya and Dev, and the dentist at 5:30. Nothing before noon." }],
  ];
  if (withAutomationsChat) chat("cnv_automations", "web", 2, false, runs.sort((a, b) => Date.parse(a[1]) - Date.parse(b[1])), "automations");

  // The API lists messages newest first. Two said in the same minute keep the order they were said in.
  messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return { conversations, messages: messages.reverse() };
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
    { id: "act_s1", actor: "user", action: "channel_linked", summary: "Linked Telegram", crew: null, memoryId: null, creditsCharged: null, createdAt: iso(Date.parse(signedUp) + 5 * MINUTE) },
    { id: "act_s2", actor: "user", action: "coupon_redeemed", summary: "Redeemed a coupon for 800 credits", crew: null, memoryId: null, creditsCharged: null, createdAt: grants[1].createdAt },
    { id: "act_s3", actor: "user", action: "app_connected", summary: "Connected Gmail", crew: null, memoryId: null, creditsCharged: null, createdAt: atDay(now, SIGNUP_DAYS_AGO - 2, 10, 15) },
    { id: "act_s4", actor: "system", action: "approval_expired", summary: "“Renew your Notion plan ($10)” expired with no answer", crew: null, memoryId: null, creditsCharged: null, createdAt: atDay(now, 3, 9, 12) },
    { id: "act_s5", actor: "user", action: "approval_decided", summary: "Approved “Post yesterday’s update in #team”", crew: null, memoryId: null, creditsCharged: null, createdAt: atDay(now, 1, 17, 31) },
    { id: "act_s6", actor: "agent", action: "approval_requested", summary: "Asked to delete 12 old drafts", crew: null, memoryId: null, creditsCharged: null, createdAt: earlierToday(now, 230) },
    { id: "act_s7", actor: "agent", action: "approval_requested", summary: "Asked to post today’s update in #team", crew: null, memoryId: null, creditsCharged: null, createdAt: earlierToday(now, 88) },
    { id: "act_s8", actor: "agent", action: "approval_requested", summary: "Asked to send an email to Maya", crew: null, memoryId: null, creditsCharged: null, createdAt: earlierToday(now, 15) },
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
    if (did) activity.push({ id: `act_c${index}`, actor: "agent", crew: null, memoryId: null, ...did, createdAt: at });
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

export type DemoAccount = "seeded" | "new";

/**
 * `TEXTCREW_DEMO_ACCOUNT=new` starts the demo as someone who has just signed up (see
 * `createNewAccount`); the default is the account in use for three weeks.
 */
export function demoAccount(): DemoAccount {
  return process.env.TEXTCREW_DEMO_ACCOUNT === "new" ? "new" : "seeded";
}

/**
 * Someone who has just signed up, as the backend leaves a new account: the 100 sign-up credits, the
 * web chat and nothing else. No chat linked, no app connected, no AI of their own, nothing said
 * yet, the time zone still UTC, and neither the welcome flow nor the checklist put away. With
 * Textcrew AI on offer Tex already works on credits; with `TEXTCREW_DEMO_AI_ACCESS_MODE=own_only`
 * (as the beta runs) it has no AI until one is connected. On the Free plan, unless
 * `TEXTCREW_DEMO_PLAN` says otherwise. Its id is new each time, like a new account's.
 */
export function createNewAccount(now: Date, plan: PlanId = process.env.TEXTCREW_DEMO_PLAN ? demoPlan() : "free"): DemoData {
  const signedUp = iso(now.getTime() - 2 * MINUTE);
  const aiMode = demoAiMode();
  const noKey = (provider: ByokKey["provider"], effectiveModel: string): ByokKey => ({
    provider, set: false, last4: null, model: null, effectiveModel, inUse: false, updatedAt: null,
  });
  return {
    user: {
      id: `user_new_${now.getTime().toString(36)}`, email: "meera@lumen.studio", emailVerified: true, name: "Meera Iyer",
      timezone: "UTC", timezoneSet: false, plan, role: "user", createdAt: signedUp,
      onboardingCompletedAt: null, gettingStartedDismissedAt: null,
    },
    availableChannels: ["telegram", "web"],
    channels: [],
    conversations: [],
    messages: [],
    sentIds: {},
    newChatCalls: [],
    attachments: {},
    approvals: [],
    approvalReplies: {},
    apps: seedApps().map((app) => ({ ...app, connections: [] })),
    mcpServers: [],
    byok: [noKey("anthropic", "claude-sonnet-5-5"), noKey("openai", "gpt-6.1-sol"), noKey("openrouter", "anthropic/claude-sonnet-5.5")],
    automations: [],
    prReviews: [],
    prReviewCalls: [],
    crewJobs: [],
    crewJobCalls: [],
    githubRepos: seedGithubRepos(now),
    // Made at sign-up, not started yet.
    agentStatus: { state: "stopped", lastActiveAt: null },
    agentSettings: {
      runtime: "hermes", effectiveRuntime: aiMode === "platform" ? "hermes" : null, aiAccess: aiMode === "platform" ? "platform" : "none",
      aiPreference: "auto", platformAvailable: aiMode === "platform",
      claude: { connected: false, connectedAt: null }, ownKeyProviders: [],
      claudeModel: null, claudeEffort: null, claudeChoices: structuredClone(CLAUDE_CHOICES),
    },
    aiMode,
    crewAvailable: demoCrewAvailable(),
    memories: [],
    claudeLogins: {},
    plans: seedPlans(),
    topUps: [{ id: "topup_10", priceCents: 1000, credits: 800, expiresInDays: CREDIT_LIFETIME_DAYS }],
    subscription: seedSubscription(plan, now, signedUp),
    grants: [
      { id: "grant_signup", source: "signup", amount: 100, remaining: 100, cheapModelOnly: false, createdAt: signedUp, expiresAt: iso(Date.parse(signedUp) + CREDIT_LIFETIME_DAYS * DAY) },
    ],
    ledger: [{ id: "led_g1", delta: 100, reason: "grant", grantId: "grant_signup", description: "Sign-up credits", createdAt: signedUp }],
    activity: [],
    usage: {},
    redeemedCoupons: [],
  };
}

export function createSeed(now: Date, plan: PlanId = demoPlan(), account: DemoAccount = demoAccount()): DemoData {
  if (account === "new") return createNewAccount(now);
  const money = seedMoney(now);
  const chats = seedChats(now, demoHasAutomationsChat());
  const aiMode = demoAiMode();
  const signedUp = atDay(now, SIGNUP_DAYS_AGO, 9, 40);
  return {
    user: {
      id: "user_demo", email: "aarav@northwind.studio", emailVerified: true, name: "Aarav Shah",
      timezone: "Asia/Kolkata", timezoneSet: true, plan, role: "user", createdAt: signedUp,
      // Went through the welcome flow when they signed up. The checklist was never hidden: it went
      // by itself once the AI, an app and a first message were done.
      onboardingCompletedAt: iso(Date.parse(signedUp) + 4 * MINUTE), gettingStartedDismissedAt: null,
    },
    availableChannels: ["telegram", "web"],
    channels: [{ id: "ch_telegram", channel: "telegram", displayId: "@aarav_s", linkedAt: iso(Date.parse(signedUp) + 5 * MINUTE) }],
    conversations: chats.conversations,
    messages: chats.messages,
    sentIds: {},
    newChatCalls: [],
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
      { provider: "anthropic", set: true, last4: "x7Qd", model: "claude-sonnet-5-5", effectiveModel: "claude-sonnet-5-5", inUse: true, updatedAt: atDay(now, SIGNUP_DAYS_AGO, 9, 55) },
      { provider: "openai", set: false, last4: null, model: null, effectiveModel: "gpt-6.1-sol", inUse: false, updatedAt: null },
      { provider: "openrouter", set: false, last4: null, model: null, effectiveModel: "anthropic/claude-sonnet-5.5", inUse: false, updatedAt: null },
    ],
    automations: seedAutomations(now),
    prReviews: SEED_REVIEWS.map((review) => ({ ...review })),
    prReviewCalls: [],
    crewJobs: seedCrewJobs(now),
    crewJobCalls: [],
    githubRepos: seedGithubRepos(now),
    agentStatus: { state: "awake", lastActiveAt: earlierToday(now, 15) },
    agentSettings: {
      runtime: "hermes", effectiveRuntime: "hermes", aiAccess: "own_key",
      aiPreference: "auto", platformAvailable: aiMode === "platform",
      claude: { connected: false, connectedAt: null }, ownKeyProviders: ["anthropic"],
      claudeModel: null, claudeEffort: null, claudeChoices: structuredClone(CLAUDE_CHOICES),
    },
    aiMode,
    crewAvailable: demoCrewAvailable(),
    memories: seedMemories(now),
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
