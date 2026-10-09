import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActivityEntry,
  AgentProgress,
  AgentSettings,
  Approval,
  App,
  Automation,
  ChannelLink,
  CreditBalance,
  CrewMember,
  LedgerEntry,
  Me,
  Memory,
  Message,
  PrReviewRepo,
  StreamEvent,
  UsagePeriod,
  UsageTotals,
} from "@/lib/api/client";
import { threadIsWorking } from "@/lib/chat-thread";
import { handleDemoRequest, resetDemoStore } from "./index";
import { getStore, subscribe } from "./store";

const ORIGIN = "http://localhost:3100";
const NOW = new Date("2026-10-01T14:30:00");

type ErrorBody = { error: { code: string; message: string } };
type Page<T> = { items: T[]; nextCursor: string | null };

/** Calls the demo backend the way the proxy route does. */
async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const [pathname] = path.split("?");
  const request = new Request(`${ORIGIN}/api/v1/${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  const response = await handleDemoRequest(request, pathname.split("/"));
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("account", () => {
  it("derives the balance and the next expiry from the grants", async () => {
    const me = await call<Me>("GET", "me");
    const credits = await call<CreditBalance>("GET", "credits");
    const coupon = credits.body.grants.find((grant) => grant.source === "coupon");

    expect(me.status).toBe(200);
    expect(me.body.name).toBe("Aarav Shah");
    expect(me.body.credits.balance).toBe(1884);
    expect(credits.body.balance).toBe(1884);
    expect(coupon?.remaining).toBe(384);
    expect(credits.body.grants.find((grant) => grant.source === "signup")?.remaining).toBe(0);
    expect(me.body.credits.nextExpiry).toBe(coupon?.expiresAt);
  });

  it("keeps the ledger in step with what the grants have spent", async () => {
    const store = getStore();
    const charged = store.ledger.filter((entry) => entry.reason === "charge").reduce((sum, entry) => sum - entry.delta, 0);
    const granted = store.grants.reduce((sum, grant) => sum + grant.amount, 0);
    expect(granted - charged).toBe(1884);
  });

  it("updates the profile and rejects an unknown time zone", async () => {
    const ok = await call<Me>("PATCH", "me", { name: "Aarav S", timezone: "Europe/London" });
    expect(ok.body).toMatchObject({ name: "Aarav S", timezone: "Europe/London" });
    const bad = await call<ErrorBody>("PATCH", "me", { timezone: "Mars/Olympus" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_request");
  });

  it("reports today's usage and one period per day", async () => {
    const from = new Date("2026-09-25T00:00:00").toISOString();
    const usage = await call<{ items: UsagePeriod[]; totals: UsageTotals }>(
      "GET",
      `usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(NOW.toISOString())}`,
    );
    const today = usage.body.items.at(-1);
    expect(usage.body.items).toHaveLength(7);
    expect(today).toMatchObject({ aiCredits: 0, awakeCredits: 5, appActionCredits: 3, browserCredits: 0, toolCredits: 1, totalCredits: 9 });
    expect(usage.body.totals.totalCredits).toBe(usage.body.items.reduce((sum, day) => sum + day.totalCredits, 0));
    // Browser use and paid tools are separate numbers, and every part is in the total.
    for (const day of usage.body.items) {
      expect(day.aiCredits + day.awakeCredits + day.appActionCredits + day.browserCredits + day.toolCredits).toBe(day.totalCredits);
    }
    expect(usage.body.totals.browserCredits).toBe(0);
    expect(usage.body.totals.toolCredits).toBe(usage.body.items.reduce((sum, day) => sum + day.toolCredits, 0));
  });

  it("charges running time, app actions and web searches as separate ledger lines, and reading for nothing", async () => {
    const store = getStore();
    const charges = store.ledger.filter((entry) => entry.reason === "charge");
    const actions = charges.filter((entry) => entry.description?.startsWith("App action: "));
    const usage = charges.filter((entry) => entry.description?.startsWith("Usage: awake time "));
    const searches = charges.filter((entry) => entry.description === "Web search");
    expect(actions.length + usage.length + searches.length).toBe(charges.length);
    expect(actions.every((entry) => entry.delta === -1)).toBe(true);
    expect(searches.length).toBeGreaterThan(3);

    const days = Object.values(store.usage);
    expect(days.reduce((sum, day) => sum + day.actions, 0)).toBe(actions.length);
    expect(days.reduce((sum, day) => sum + day.awake, 0)).toBe(usage.reduce((sum, entry) => sum - entry.delta, 0));
    expect(days.reduce((sum, day) => sum + day.tools, 0)).toBe(searches.reduce((sum, entry) => sum - entry.delta, 0));
    // Each search is in the activity log with what it cost.
    expect(store.activity.filter((entry) => entry.action === "web_search" && entry.creditsCharged === 1)).toHaveLength(searches.length);

    const done = store.activity.filter((entry) => entry.action === "run_app_action");
    expect(done.filter((entry) => entry.creditsCharged === 1)).toHaveLength(actions.length);
    expect(done.some((entry) => entry.creditsCharged === 0)).toBe(true);
  });
});

describe("chat", () => {
  it("sends a message once per clientMessageId, then Tex answers and credits are charged", async () => {
    const before = (await call<Page<Message>>("GET", "messages")).body.items.length;
    const first = await call<Message>("POST", "messages", { text: "What's on my calendar today?", clientMessageId: uuid(1) });
    const again = await call<Message>("POST", "messages", { text: "What's on my calendar today?", clientMessageId: uuid(1) });

    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ channel: "web", direction: "in", status: "queued" });
    expect(again.body.id).toBe(first.body.id);
    expect((await call<Page<Message>>("GET", "messages")).body.items).toHaveLength(before + 1);

    vi.advanceTimersByTime(2000);
    const after = (await call<Page<Message>>("GET", "messages")).body.items;
    expect(after).toHaveLength(before + 2);
    expect(after[0]).toMatchObject({ direction: "out", channel: "web" });
    expect(after[1]).toMatchObject({ id: first.body.id, status: "read" });
    // With the user's own AI key only the time Tex ran is charged.
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1883);
    expect(getStore().ledger[0]).toMatchObject({ delta: -1, reason: "charge", description: "Usage: awake time 1" });
  });

  it("shows Tex at work in the web thread and in all chats, not in the Telegram thread, while it answers a web message", async () => {
    await call<Message>("POST", "messages", { text: "What's on my calendar today?", clientMessageId: uuid(40) });
    const working = async (filter: "all" | "web" | "telegram") => {
      const busy = (await call<{ state: string }>("GET", "agent/status")).body.state === "busy";
      const thread = (await call<Page<Message>>("GET", filter === "all" ? "messages" : `messages?channel=${filter}`)).body.items;
      return threadIsWorking(filter, busy, thread);
    };

    vi.advanceTimersByTime(500);
    expect([await working("all"), await working("web"), await working("telegram")]).toEqual([true, true, false]);
    vi.advanceTimersByTime(1500);
    expect([await working("all"), await working("web"), await working("telegram")]).toEqual([false, false, false]);
  });

  it("has Scout report what it is doing, charges its search and then answers", async () => {
    const events: StreamEvent[] = [];
    subscribe(getStore(), (event) => events.push(event));
    await call<Message>("POST", "messages", { text: "Research what other tools charge for seats", clientMessageId: uuid(20) });

    // Still working after the time a plain answer takes: the lines come one by one.
    vi.advanceTimersByTime(2000);
    expect(events.filter((event) => event.type === "agent.progress")).toHaveLength(1);
    expect(getStore().agentStatus.state).toBe("busy");

    vi.advanceTimersByTime(3000);
    const lines = events.filter((event) => event.type === "agent.progress").map((event) => event.data as AgentProgress);
    expect(lines.map((line) => [line.text, line.crew])).toEqual([
      ["Scout: searching the web", "scout"],
      ["Scout: reading 3 pages", "scout"],
      ["Scout: done", "scout"],
    ]);
    // A line that names a crew member is in the activity log too, under that member.
    const log = getStore().activity.slice(0, 4);
    expect(log.map((entry) => [entry.action, entry.crew])).toEqual([
      ["web_search", null],
      ["crew_progress", "scout"],
      ["crew_progress", "scout"],
      ["crew_progress", "scout"],
    ]);
    expect(log[0]).toMatchObject({ creditsCharged: 1 });
    expect(getStore().ledger.slice(0, 2).map((entry) => entry.description)).toEqual(["Usage: awake time 1", "Web search"]);
    expect((await call<Page<Message>>("GET", "messages?channel=web")).body.items[0].text).toContain("Scout looked into it");
    expect(getStore().agentStatus.state).toBe("awake");
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1882);
  });

  it("hands code to Byte and reviews to Patch, and to nobody who isn't on the crew yet", async () => {
    const lines: string[] = [];
    subscribe(getStore(), (event) => {
      if (event.type === "agent.progress") lines.push((event.data as AgentProgress).text);
    });
    await call<Message>("POST", "messages", { text: "Fix the bug in the signup form", clientMessageId: uuid(21) });
    vi.advanceTimersByTime(5000);
    await call<Message>("POST", "messages", { text: "Review my last pull request", clientMessageId: uuid(22) });
    vi.advanceTimersByTime(5000);
    expect(lines).toEqual(["Byte: reading the code", "Byte: writing the change", "Byte: done", "Patch: reading the diff", "Patch: running the tests", "Patch: done"]);

    getStore().crewAvailable = [];
    await call<Message>("POST", "messages", { text: "Research what other tools charge for seats", clientMessageId: uuid(23) });
    vi.advanceTimersByTime(2000);
    expect(lines).toHaveLength(6);
    expect((await call<Page<Message>>("GET", "messages?channel=web")).body.items[0].text).toContain("Got it.");
  });

  it("asks for an OK instead of acting when the request is risky", async () => {
    await call<Message>("POST", "messages", { text: "Email Maya the kickoff notes", clientMessageId: uuid(2) });
    vi.advanceTimersByTime(2000);
    const pending = (await call<Page<Approval>>("GET", "approvals")).body.items;
    const [words, ask] = (await call<Page<Message>>("GET", "messages?channel=web")).body.items;
    expect(pending).toHaveLength(4);
    // Like the backend: the ask is its own message carrying the approval, followed by Tex's words.
    expect(ask.approvalId).toBe(pending[0].id);
    expect(ask.text).toBe(`Approval needed: ${pending[0].summary}`);
    expect(words.approvalId).toBeNull();
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1884);
  });

  it("starts a new web chat: the messages stay listed, the start is kept, logged and not charged", async () => {
    type Thread = Page<Message> & { chatStartedAt: string | null };
    const before = await call<Thread>("GET", "messages");
    expect(before.body.chatStartedAt).toBeNull();

    vi.advanceTimersByTime(60_000);
    const started = await call<{ chatStartedAt: string }>("POST", "chats/new");
    expect(started.status).toBe(200);
    expect(started.body.chatStartedAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    expect(getStore().webChat).toEqual({ epoch: 1, startedAt: started.body.chatStartedAt });

    // Earlier messages are still there; every page and filter says when the new chat started.
    const after = await call<Thread>("GET", "messages");
    expect(after.body.items).toEqual(before.body.items);
    expect(after.body.chatStartedAt).toBe(started.body.chatStartedAt);
    expect((await call<Thread>("GET", "messages?channel=telegram")).body.chatStartedAt).toBe(started.body.chatStartedAt);

    // Logged with the channel and no text; no turn ran and nothing was charged.
    expect(getStore().activity[0]).toMatchObject({ actor: "user", action: "chat_started", summary: "Started a new chat in web chat", creditsCharged: null });
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1884);
    expect(getStore().agentStatus.state).toBe("awake");

    const again = await call<{ chatStartedAt: string }>("POST", "chats/new");
    expect(getStore().webChat.epoch).toBe(2);
    expect(Date.parse(again.body.chatStartedAt)).toBeGreaterThanOrEqual(Date.parse(started.body.chatStartedAt));
  });

  it("allows 30 new chats an hour", async () => {
    for (let i = 0; i < 30; i++) expect((await call("POST", "chats/new")).status).toBe(200);
    const limited = await call<ErrorBody>("POST", "chats/new");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    expect(getStore().webChat.epoch).toBe(30);

    vi.advanceTimersByTime(3_600_001);
    expect((await call("POST", "chats/new")).status).toBe(200);
  });

  it("answers 402 when there are no credits left", async () => {
    for (const grant of getStore().grants) grant.remaining = 0;
    const sent = await call<ErrorBody>("POST", "messages", { text: "hello", clientMessageId: uuid(3) });
    expect(sent.status).toBe(402);
    expect(sent.body.error.code).toBe("out_of_credits");
  });

  it("rejects a message without a valid clientMessageId", async () => {
    const sent = await call<ErrorBody>("POST", "messages", { text: "hello", clientMessageId: "nope" });
    expect(sent.status).toBe(400);
  });

  it("streams a ready event, then whatever happens next", async () => {
    const abort = new AbortController();
    const request = new Request(`${ORIGIN}/api/v1/stream`, { signal: abort.signal });
    const response = await handleDemoRequest(request, ["stream"]);
    const reader = response.body!.getReader();
    const read = async () => new TextDecoder().decode((await reader.read()).value);

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await read()).toBe("event: ready\ndata: {}\n\n");

    await call("PATCH", "automations/aut_meetings", { enabled: false });
    const frame = await read();
    expect(frame.startsWith("event: automation.updated\ndata: ")).toBe(true);
    expect(JSON.parse(frame.split("data: ")[1])).toMatchObject({ type: "automation.updated", data: { id: "aut_meetings", enabled: false, pausedReason: "user" } });

    abort.abort();
    expect(getStore().listeners.size).toBe(0);
  });
});

describe("approvals", () => {
  it("records a decision once, then answers 409", async () => {
    const decided = await call<Approval>("POST", "approvals/ap_email/decision", { decision: "approve" });
    expect(decided.status).toBe(200);
    expect(decided.body.status).toBe("approved");
    expect(decided.body.decidedAt).toBeTruthy();

    const second = await call<ErrorBody>("POST", "approvals/ap_email/decision", { decision: "reject" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("conflict");

    vi.advanceTimersByTime(1000);
    const thread = (await call<Page<Message>>("GET", "messages?channel=telegram")).body.items;
    expect(thread[0].text).toBe("Done. Moved to tomorrow at 3pm and Maya has the note.");
    // One credit, for the action that changed something.
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1883);
    expect(getStore().ledger[0]).toMatchObject({ delta: -1, description: "App action: GMAIL_SEND_EMAIL" });
    expect(getStore().activity[0]).toMatchObject({ action: "run_app_action", creditsCharged: 1 });
    expect((await call<Page<Approval>>("GET", "approvals")).body.items).toHaveLength(2);
  });

  it("doesn't charge for a rejected action", async () => {
    await call<Approval>("POST", "approvals/ap_drafts/decision", { decision: "reject" });
    vi.advanceTimersByTime(1000);
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1884);
    expect((await call<Page<Approval>>("GET", "approvals?status=rejected")).body.items).toHaveLength(1);
  });

  it("answers 404 for an approval that doesn't exist", async () => {
    expect((await call<ErrorBody>("POST", "approvals/nope/decision", { decision: "approve" })).status).toBe(404);
  });
});

describe("credits", () => {
  it("redeems the demo coupon once, and gives every other code the same answer", async () => {
    const redeemed = await call<{ creditsAdded: number; balance: number }>("POST", "coupons/redeem", { code: "textcrew-demo" });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body).toMatchObject({ creditsAdded: 200, balance: 2084 });

    const twice = await call<ErrorBody>("POST", "coupons/redeem", { code: "TEXTCREW-DEMO" });
    const wrong = await call<ErrorBody>("POST", "coupons/redeem", { code: "AGT-7KQ2-M9XP-4RWD" });
    for (const failure of [twice, wrong]) {
      expect(failure.status).toBe(400);
      expect(failure.body.error).toEqual({ code: "invalid_or_expired_code", message: "This code is invalid or has expired" });
    }
  });

  it("pages through a list until the cursor runs out", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { body: Page<ActivityEntry> } = await call("GET", `activity?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      seen.push(...page.body.items.map((entry) => entry.id));
      cursor = page.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBeGreaterThan(2);
    expect(seen.length).toBeGreaterThanOrEqual(40);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(getStore().activity.length);

    const ledger = await call<Page<LedgerEntry>>("GET", "credits/ledger");
    expect(ledger.body.items).toHaveLength(30);
    expect(ledger.body.nextCursor).not.toBeNull();
    expect((await call<ErrorBody>("GET", "activity?limit=0")).status).toBe(400);
  });

  it("refuses a top-up on the Free plan and never changes the plan from checkout", async () => {
    const plan = await call<{ checkoutUrl: string; discountApplied: boolean }>("POST", "billing/checkout", { kind: "plan", planId: "max" });
    expect(plan.body).toEqual({ checkoutUrl: `${ORIGIN}/connected?checkout=demo`, discountApplied: true });
    expect((await call<Me>("GET", "me")).body.plan).toBe("pro");

    getStore().user.plan = "free";
    const topUp = await call<ErrorBody>("POST", "billing/checkout", { kind: "topup", topUpId: "topup_10" });
    expect(topUp.status).toBe(403);
    expect(topUp.body.error.code).toBe("plan_limit");
  });
});

describe("setup", () => {
  it("keeps own MCP servers for Max", async () => {
    const server = { name: "Northwind CRM", url: "https://mcp.northwind.studio/crm" };
    const onPro = await call<ErrorBody>("POST", "mcp-servers", server);
    expect(onPro.status).toBe(403);
    expect(onPro.body.error.code).toBe("plan_limit");

    getStore().user.plan = "max";
    expect((await call("POST", "mcp-servers", { ...server, url: "http://insecure.example" })).status).toBe(400);
    expect((await call("POST", "mcp-servers", { ...server, authSecret: "s3cret" })).status).toBe(201);
    expect((await call<Page<{ hasSecret: boolean }>>("GET", "mcp-servers")).body.items).toMatchObject([{ name: "Northwind CRM", hasSecret: true }]);
  });

  it("connects an app and reconnects an expired one", async () => {
    const connect = await call<{ redirectUrl: string }>("POST", "apps/linear/connect", { returnUrl: `${ORIGIN}/apps` });
    expect(connect.body.redirectUrl).toBe(`${ORIGIN}/apps?app=linear`);
    await call("POST", "apps/googledrive/connect");
    const apps = (await call<{ items: App[] }>("GET", "apps")).body.items;
    expect(apps.find((app) => app.slug === "linear")?.connections).toMatchObject([{ status: "active" }]);
    expect(apps.find((app) => app.slug === "googledrive")?.connections).toMatchObject([{ status: "active" }]);
    expect((await call("POST", "apps/linear/connect", { returnUrl: "https://evil.example/" })).status).toBe(400);
  });

  it("lists a few apps as not connectable yet, and refuses to connect them the way the backend does", async () => {
    const apps = (await call<{ items: App[] }>("GET", "apps")).body.items;
    const off = apps.filter((app) => !app.connectable).map((app) => app.slug);
    expect(off).toEqual(["hubspot", "asana", "airtable"]);
    // Nothing that is already connected, and most of the catalog, stays connectable.
    expect(apps.filter((app) => app.connections.length > 0).every((app) => app.connectable)).toBe(true);
    expect(apps.filter((app) => app.connectable).length).toBeGreaterThan(off.length);

    const refused = await call<{ error: { code: string; message: string } }>("POST", "apps/hubspot/connect", { returnUrl: `${ORIGIN}/apps` });
    expect(refused.status).toBe(404);
    expect(refused.body.error).toMatchObject({ code: "not_found", message: "HubSpot isn't configured yet" });
    const after = (await call<{ items: App[] }>("GET", "apps")).body.items;
    expect(after.find((app) => app.slug === "hubspot")?.connections).toEqual([]);
  });

  it("needs a connected Claude plan before Claude Code can run", async () => {
    expect((await call("PATCH", "agent/settings", { runtime: "claude_code" })).status).toBe(409);

    const login = await call<{ loginId: string }>("POST", "agent/claude/login");
    expect(login.status).toBe(201);
    expect((await call("POST", `agent/claude/login/${login.body.loginId}/complete`, { code: "ab" })).status).toBe(400);
    const done = await call<AgentSettings>("POST", `agent/claude/login/${login.body.loginId}/complete`, { code: "abcd-1234" });
    expect(done.body).toMatchObject({ runtime: "claude_code", effectiveRuntime: "claude_code", aiAccess: "claude_plan", claude: { connected: true } });

    expect((await call("DELETE", "agent/claude")).status).toBe(204);
    expect((await call<AgentSettings>("GET", "agent/settings")).body).toMatchObject({ runtime: "hermes", aiAccess: "own_key" });
  });

  it("falls back to Textcrew AI once the last API key is removed, and charges the AI in credits", async () => {
    expect((await call("PUT", "byok/openai", { apiKey: "short" })).status).toBe(400);
    expect((await call("DELETE", "byok/anthropic")).status).toBe(204);
    expect((await call<AgentSettings>("GET", "agent/settings")).body).toMatchObject({ effectiveRuntime: "hermes", aiAccess: "platform", ownKeyProviders: [] });

    await call<Message>("POST", "messages", { text: "What's on my calendar today?", clientMessageId: uuid(4) });
    vi.advanceTimersByTime(2000);
    expect(getStore().ledger[0]).toMatchObject({ delta: -3, description: "Usage: AI 2, awake time 1" });
    const today = (await call<{ items: UsagePeriod[] }>("GET", `usage?from=${encodeURIComponent(new Date("2026-10-01T00:00:00").toISOString())}&to=${encodeURIComponent(new Date("2026-10-01T23:00:00").toISOString())}`)).body.items[0];
    expect(today).toMatchObject({ aiCredits: 2, awakeCredits: 6, appActionCredits: 3, toolCredits: 1, totalCredits: 12 });

    const saved = await call<{ last4: string }>("PUT", "byok/openrouter", { apiKey: "sk-or-0123456789abcd" });
    expect(saved.body.last4).toBe("abcd");
    expect((await call<AgentSettings>("GET", "agent/settings")).body.aiAccess).toBe("own_key");
  });

  it("lets Textcrew AI be chosen over a saved key, charges the AI in credits, and goes back", async () => {
    const before = (await call<AgentSettings>("GET", "agent/settings")).body;
    expect(before).toMatchObject({ aiAccess: "own_key", aiPreference: "auto", platformAvailable: true });

    const chosen = await call<AgentSettings>("PATCH", "agent/settings", { aiPreference: "platform" });
    expect(chosen.status).toBe(200);
    // The key stays saved.
    expect(chosen.body).toMatchObject({ effectiveRuntime: "hermes", aiAccess: "platform", aiPreference: "platform", ownKeyProviders: ["anthropic"] });
    expect(getStore().activity[0]).toMatchObject({ actor: "user", action: "ai_preference_changed" });

    await call<Message>("POST", "messages", { text: "What's on my calendar today?", clientMessageId: uuid(5) });
    vi.advanceTimersByTime(2000);
    expect(getStore().ledger[0]).toMatchObject({ delta: -3, description: "Usage: AI 2, awake time 1" });

    const back = await call<AgentSettings>("PATCH", "agent/settings", { runtime: "hermes", aiPreference: "auto" });
    expect(back.body).toMatchObject({ aiAccess: "own_key", aiPreference: "auto" });
  });

  it("refuses Textcrew AI when it isn't on offer, and ignores a preference saved before", async () => {
    getStore().aiMode = "own_only";
    expect((await call<AgentSettings>("GET", "agent/settings")).body.platformAvailable).toBe(false);
    const refused = await call<ErrorBody>("PATCH", "agent/settings", { aiPreference: "platform" });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("conflict");

    getStore().agentSettings.aiPreference = "platform";
    expect((await call<AgentSettings>("GET", "agent/settings")).body).toMatchObject({ aiAccess: "own_key", platformAvailable: false });
    expect((await call("PATCH", "agent/settings", {})).status).toBe(400);
    expect((await call("PATCH", "agent/settings", { aiPreference: "sometimes" })).status).toBe(400);
  });

  it("offers Claude Code's models and efforts, with Claude Code's defaults to start", async () => {
    const settings = (await call<AgentSettings>("GET", "agent/settings")).body;
    expect(settings).toMatchObject({ claudeModel: null, claudeEffort: null });
    expect(settings.claudeChoices).toEqual({
      models: [
        { id: "claude-opus-5-5", label: "Opus 5.5" },
        { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
        { id: "claude-haiku-4-5", label: "Haiku 4.5" },
        { id: "claude-fable-5-1", label: "Fable 5.1" },
      ],
      efforts: ["low", "medium", "high", "xhigh", "max"],
    });
  });

  it("saves Claude Code's model and effort whatever runs now, and null goes back to the default", async () => {
    // Hermes runs on the saved key and no Claude plan is connected: they are kept for when Claude Code runs.
    const chosen = await call<AgentSettings>("PATCH", "agent/settings", { claudeModel: "claude-opus-5-5", claudeEffort: "xhigh" });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toMatchObject({ claudeModel: "claude-opus-5-5", claudeEffort: "xhigh", effectiveRuntime: "hermes", aiAccess: "own_key" });

    const effortOnly = await call<AgentSettings>("PATCH", "agent/settings", { claudeEffort: "low" });
    expect(effortOnly.body).toMatchObject({ claudeModel: "claude-opus-5-5", claudeEffort: "low" });

    const back = await call<AgentSettings>("PATCH", "agent/settings", { claudeModel: null, claudeEffort: null });
    expect(back.body).toMatchObject({ claudeModel: null, claudeEffort: null });
    // No credits move.
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1884);
  });

  it("refuses a model or effort that isn't offered, and changes nothing when part of a change is refused", async () => {
    for (const body of [{ claudeModel: "gpt-6.1-sol" }, { claudeModel: 5 }, { claudeEffort: "extreme" }, { claudeModel: "claude-opus-5-5", claudeEffort: "ultra" }]) {
      const refused = await call<ErrorBody>("PATCH", "agent/settings", body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect(refused.body.error.code).toBe("invalid_request");
    }
    // Claude Code can't be chosen without a plan, so the model sent with it isn't saved either.
    expect((await call("PATCH", "agent/settings", { runtime: "claude_code", claudeModel: "claude-haiku-4-5" })).status).toBe(409);
    expect((await call<AgentSettings>("GET", "agent/settings")).body).toMatchObject({ claudeModel: null, claudeEffort: null });
  });

  it("drops the Textcrew AI choice when a Claude plan is connected", async () => {
    await call("PATCH", "agent/settings", { aiPreference: "platform" });
    const login = await call<{ loginId: string }>("POST", "agent/claude/login");
    const done = await call<AgentSettings>("POST", `agent/claude/login/${login.body.loginId}/complete`, { code: "abcd-1234" });
    expect(done.body).toMatchObject({ runtime: "claude_code", aiAccess: "claude_plan", aiPreference: "auto" });

    // Chosen again over the plan: Hermes runs, and the plan stays connected.
    const chosen = await call<AgentSettings>("PATCH", "agent/settings", { aiPreference: "platform" });
    expect(chosen.body).toMatchObject({ runtime: "claude_code", effectiveRuntime: "hermes", aiAccess: "platform", claude: { connected: true } });
  });

  it("has nothing to run on without a key when your own AI is required", async () => {
    getStore().aiMode = "own_only";
    expect((await call("DELETE", "byok/anthropic")).status).toBe(204);
    expect((await call<AgentSettings>("GET", "agent/settings")).body).toMatchObject({ effectiveRuntime: null, aiAccess: "none" });
  });

  it("runs Claude Code on a connected plan when Hermes has no AI of its own", async () => {
    getStore().aiMode = "own_only";
    const login = await call<{ loginId: string }>("POST", "agent/claude/login");
    await call("POST", `agent/claude/login/${login.body.loginId}/complete`, { code: "abcd-1234" });
    await call("DELETE", "byok/anthropic");
    const settings = await call<AgentSettings>("PATCH", "agent/settings", { runtime: "hermes" });
    expect(settings.body).toMatchObject({ runtime: "hermes", effectiveRuntime: "claude_code", aiAccess: "claude_plan" });
  });

  it("lists the crew, with who works yet and what Scout's browser needs", async () => {
    const crew = (await call<{ items: CrewMember[] }>("GET", "crew")).body.items;
    expect(crew.map((member) => [member.id, member.kind, member.available])).toEqual([
      ["tex", "lead", true],
      ["byte", "specialist", true],
      ["patch", "specialist", true],
      ["scout", "specialist", true],
    ]);
    expect(crew.find((member) => member.id === "scout")?.browser).toEqual({ requiresPlan: "max", available: false, enabled: false });
    expect(crew.filter((member) => member.browser !== null)).toHaveLength(1);

    getStore().crewAvailable = ["byte"];
    const fewer = (await call<{ items: CrewMember[] }>("GET", "crew")).body.items;
    expect(fewer.filter((member) => member.available).map((member) => member.id)).toEqual(["tex", "byte"]);
  });

  it("lists the channels that are switched on next to the linked chats", async () => {
    const channels = await call<{ items: ChannelLink[]; available: string[] }>("GET", "channels");
    expect(channels.body.available).toEqual(["telegram", "web"]);
    expect(channels.body.items.map((link) => link.channel)).toEqual(["telegram"]);
  });

  it("refuses a link code for a chat app that is switched off", async () => {
    const off = await call<ErrorBody & { error: { details?: { channel?: string } } }>("POST", "channels/link-codes", { channel: "imessage" });
    expect(off.status).toBe(403);
    expect(off.body.error).toMatchObject({ code: "channel_disabled", details: { channel: "imessage" } });
    expect((await call("POST", "channels/link-codes", { channel: "web" })).status).toBe(400);
  });

  it("links a chat a few seconds after a code is made", async () => {
    expect((await call("DELETE", "channels/ch_telegram")).status).toBe(204);
    const code = await call<{ code: string; deepLink: string | null }>("POST", "channels/link-codes", { channel: "telegram" });
    expect(code.status).toBe(201);
    expect(code.body.code).toMatch(/^LINK-\d{4}-[A-Z]{2}$/);
    expect(code.body.deepLink).toContain(encodeURIComponent(code.body.code));
    expect((await call<{ items: ChannelLink[] }>("GET", "channels")).body.items).toHaveLength(0);
    vi.advanceTimersByTime(6000);
    expect((await call<{ items: ChannelLink[] }>("GET", "channels")).body.items.map((link) => link.channel)).toEqual(["telegram"]);
  });

  it("keeps a chat that was linked before its channel was switched off, and refuses web chat when that is off", async () => {
    const store = getStore();
    store.availableChannels = ["web"];
    const channels = await call<{ items: ChannelLink[]; available: string[] }>("GET", "channels");
    expect(channels.body).toMatchObject({ available: ["web"], items: [{ channel: "telegram" }] });

    store.availableChannels = ["telegram"];
    const sent = await call<ErrorBody>("POST", "messages", { text: "hello", clientMessageId: uuid(9) });
    expect(sent.status).toBe(403);
    expect(sent.body.error.code).toBe("channel_disabled");
  });
});

describe("pull-request review", () => {
  type Reviews = { items: PrReviewRepo[] };
  const automations = async () => (await call<{ items: Automation[] }>("GET", "automations")).body.items;

  it("lists the repos with review on, each one an automation with the preset", async () => {
    const reviews = (await call<Reviews>("GET", "pr-reviews")).body.items;
    expect(reviews).toMatchObject([
      { id: "aut_pr_website", owner: "northwind", repo: "website", enabled: true, pausedReason: null, channel: "telegram" },
      { id: "aut_pr_api", owner: "northwind", repo: "api", enabled: false, pausedReason: "failures", channel: "telegram" },
    ]);
    expect(reviews[0].lastReviewAt).not.toBeNull();

    const list = await automations();
    expect(list.filter((item) => item.preset === "pr_review").map((item) => item.id)).toEqual(["aut_pr_website", "aut_pr_api"]);
    expect(list.filter((item) => item.preset === null)).toHaveLength(2);
  });

  it("turns review on for a repo once, whatever the spelling", async () => {
    const on = await call<PrReviewRepo>("PUT", "pr-reviews/northwind/docs.git");
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ owner: "northwind", repo: "docs", enabled: true, pausedReason: null, channel: "telegram", lastReviewAt: null });

    const again = await call<PrReviewRepo>("PUT", "pr-reviews/Northwind/DOCS");
    expect(again.body.id).toBe(on.body.id);
    expect((await call<Reviews>("GET", "pr-reviews")).body.items).toHaveLength(3);

    const automation = (await automations()).find((item) => item.id === on.body.id);
    expect(automation).toMatchObject({ kind: "event", preset: "pr_review", title: "Review pull requests in northwind/docs", trigger: { app: "github" } });
    expect(getStore().activity[0]).toMatchObject({ actor: "user", action: "pr_review_enabled", summary: "Turned on pull-request review for northwind/docs" });
  });

  it("counts each repo as one of the plan's automations", async () => {
    // Pro allows five: four are seeded, so one more repo fits and the next doesn't.
    expect((await call("PUT", "pr-reviews/northwind/docs")).status).toBe(200);
    const full = await call<ErrorBody>("PUT", "pr-reviews/northwind/mobile");
    expect(full.status).toBe(403);
    expect(full.body.error).toMatchObject({ code: "plan_limit", message: "Your pro plan allows 5 automations; cancel one or upgrade" });
    // A repo that is already on is not a new automation.
    expect((await call("PUT", "pr-reviews/northwind/website")).status).toBe(200);
  });

  it("needs GitHub connected", async () => {
    expect((await call("DELETE", "connections/con_github_1")).status).toBe(204);
    const refused = await call<ErrorBody>("PUT", "pr-reviews/northwind/docs");
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({ code: "conflict", message: "Connect GitHub first" });
  });

  it("refuses a repo the connected account can't administer, and anything that isn't a repo name", async () => {
    const noAdmin = await call<ErrorBody>("PUT", "pr-reviews/octocat/hello-world");
    expect(noAdmin.status).toBe(400);
    expect(noAdmin.body.error.code).toBe("invalid_request");
    expect(noAdmin.body.error.message).toContain("admin access");

    for (const path of ["pr-reviews/northwind/we$bsite", "pr-reviews/northwind/..", "pr-reviews/north wind/website"]) {
      const bad = await call<ErrorBody>("PUT", path);
      expect(bad.status, path).toBe(400);
      expect(bad.body.error.message).toBe("Not a GitHub repository name");
    }
    expect((await call<Reviews>("GET", "pr-reviews")).body.items).toHaveLength(2);
  });

  it("pauses with the automation's switch and resumes by turning review on again", async () => {
    const paused = await call<Automation>("PATCH", "automations/aut_pr_website", { enabled: false });
    expect(paused.body).toMatchObject({ enabled: false, pausedReason: "user" });
    expect((await call<Reviews>("GET", "pr-reviews")).body.items[0]).toMatchObject({ repo: "website", enabled: false, pausedReason: "user" });

    // The repo that was paused after failures comes back the same way.
    const resumed = await call<PrReviewRepo>("PUT", "pr-reviews/northwind/api");
    expect(resumed.body).toMatchObject({ id: "aut_pr_api", enabled: true, pausedReason: null });
  });

  it("turns review off, and answers 404 when it wasn't on", async () => {
    expect((await call("DELETE", "pr-reviews/northwind/website")).status).toBe(204);
    expect((await automations()).some((item) => item.id === "aut_pr_website")).toBe(false);
    expect(getStore().activity[0]).toMatchObject({ action: "pr_review_disabled", summary: "Turned off pull-request review for northwind/website" });

    const twice = await call<ErrorBody>("DELETE", "pr-reviews/northwind/website");
    expect(twice.status).toBe(404);
    expect(twice.body.error.code).toBe("not_found");

    // Deleting the automation takes the repo off the list too.
    expect((await call("DELETE", "automations/aut_pr_api")).status).toBe(204);
    expect((await call<Reviews>("GET", "pr-reviews")).body.items).toEqual([]);
  });

  it("sends the verdict to web chat when no Telegram chat is linked", async () => {
    await call("DELETE", "channels/ch_telegram");
    expect((await call<PrReviewRepo>("PUT", "pr-reviews/northwind/docs")).body.channel).toBe("web");
  });

  it("allows 30 changes an hour", async () => {
    for (let i = 0; i < 30; i++) expect((await call("PUT", "pr-reviews/northwind/website")).status).toBe(200);
    const limited = await call<ErrorBody>("PUT", "pr-reviews/northwind/website");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");

    vi.advanceTimersByTime(3_600_001);
    expect((await call("PUT", "pr-reviews/northwind/website")).status).toBe(200);
  });

  it("logs a page Scout asked for but had not been given, next to the ones it read", async () => {
    const store = getStore();
    expect(store.activity.filter((entry) => entry.action === "read_page_refused").map((entry) => entry.summary)).toEqual([
      "Refused to read https://collect.example/save",
    ]);
    expect(store.activity.filter((entry) => entry.action === "read_page")).toHaveLength(2);
    expect(store.activity.filter((entry) => entry.crew === "scout").map((entry) => entry.summary)).toEqual([
      "Scout: done",
      "Scout: find what other B2B tools send in week one",
    ]);
  });

  it("has today's review in the activity log and the history: asked for, done by Patch, one credit for the posted review", async () => {
    const store = getStore();
    const asked = store.activity.find((entry) => entry.action === "pr_review_requested");
    expect(asked).toMatchObject({ actor: "system", summary: "Review of northwind/website#128 at 4f2a9c1 requested" });
    expect(store.activity.filter((entry) => entry.crew === "patch").map((entry) => entry.action)).toEqual(["crew_progress", "crew_progress"]);
    expect(store.ledger.some((entry) => entry.description === "App action: GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST" && entry.delta === -1)).toBe(true);
    expect(store.messages.some((message) => message.direction === "out" && message.text.startsWith("Patch reviewed pull request #128"))).toBe(true);
  });
});

describe("memory", () => {
  type Memories = { items: Memory[]; max: number };
  const list = async () => (await call<Memories>("GET", "memories")).body;

  it("lists what Tex has saved, newest first, with the most it can hold", async () => {
    const memories = await list();
    expect(memories.max).toBe(200);
    expect(memories.items).toHaveLength(8);
    expect(new Set(memories.items.map((memory) => memory.kind))).toEqual(new Set(["instruction", "preference", "person", "project", "fact"]));
    const saved = memories.items.map((memory) => Date.parse(memory.createdAt));
    expect(saved).toEqual([...saved].sort((a, b) => b - a));
    // One was corrected since it was saved; one has never been looked up.
    expect(memories.items.find((memory) => memory.id === "mem_maya")).toMatchObject({ kind: "person", useCount: 5 });
    expect(memories.items.filter((memory) => memory.updatedAt !== memory.createdAt).map((memory) => memory.id)).toEqual(["mem_maya"]);
    expect(memories.items.find((memory) => memory.id === "mem_city")).toMatchObject({ lastUsedAt: null, useCount: 0 });
  });

  it("deletes one memory, logs it without its text, and answers 404 the second time", async () => {
    expect((await call("DELETE", "memories/mem_short")).status).toBe(204);
    expect((await list()).items.some((memory) => memory.id === "mem_short")).toBe(false);
    expect(getStore().activity[0]).toMatchObject({ actor: "user", action: "memory_deleted", summary: "Deleted a memory", memoryId: "mem_short" });

    const twice = await call<ErrorBody>("DELETE", "memories/mem_short");
    expect(twice.status).toBe(404);
    expect(twice.body.error).toEqual({ code: "not_found", message: "Memory not found" });
  });

  it("deletes every memory and says how many went", async () => {
    const cleared = await call<{ deleted: number }>("DELETE", "memories");
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ deleted: 8 });
    expect((await list()).items).toEqual([]);
    expect(getStore().activity[0]).toMatchObject({ actor: "user", action: "memories_cleared", summary: "Deleted all memories (8)", memoryId: null });

    // Nothing left to delete: nothing is logged.
    const logged = getStore().activity.length;
    expect((await call<{ deleted: number }>("DELETE", "memories")).body).toEqual({ deleted: 0 });
    expect(getStore().activity).toHaveLength(logged);
  });

  it("has no way to add or edit a memory from the app", async () => {
    expect((await call("POST", "memories", { content: "x" })).status).toBe(404);
    expect((await call("PATCH", "memories/mem_short", { content: "x" })).status).toBe(404);
  });

  it("keeps the log free of memory text, and names memories that are gone too", async () => {
    const store = getStore();
    const contents = store.memories.map((memory) => memory.content);
    const entries = store.activity.filter((entry) => ["remember", "recall", "forget", "memory_refused", "memory_deleted"].includes(entry.action));
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.some((entry) => contents.some((content) => entry.summary.includes(content)))).toBe(false);

    const ids = new Set(store.memories.map((memory) => memory.id));
    const named = entries.filter((entry) => entry.memoryId).map((entry) => entry.memoryId as string);
    // Every memory in the list was saved at some point, and one that was saved has since been deleted.
    expect([...ids].every((id) => named.includes(id))).toBe(true);
    expect(named.filter((id) => !ids.has(id))).toEqual(["mem_old_office", "mem_old_office"]);
  });

  it("has Tex save a fact when asked, once, and the list shows it", async () => {
    await call<Message>("POST", "messages", { text: "Remember that I send invoices on the 1st", clientMessageId: uuid(30) });
    vi.advanceTimersByTime(2000);
    const memories = (await list()).items;
    expect(memories).toHaveLength(9);
    expect(memories[0]).toMatchObject({ kind: "fact", content: "I send invoices on the 1st", lastUsedAt: null, useCount: 0 });
    expect(getStore().activity[0]).toMatchObject({ actor: "agent", action: "remember", summary: "Saved a memory (fact)", memoryId: memories[0].id });
    // The words "send" and "invoices" did not turn it into an approval.
    expect((await call<Page<Approval>>("GET", "approvals")).body.items).toHaveLength(3);

    await call<Message>("POST", "messages", { text: "remember  I send invoices on the  1st", clientMessageId: uuid(31) });
    vi.advanceTimersByTime(2000);
    expect((await list()).items).toHaveLength(9);
    expect(getStore().activity[0]).toMatchObject({ action: "remember", summary: "Confirmed a memory (fact)", memoryId: memories[0].id });
  });

  it("refuses to save what looks like a secret, and logs that without the text", async () => {
    await call<Message>("POST", "messages", { text: "Remember that my Stripe password is hunter2-hunter2", clientMessageId: uuid(32) });
    vi.advanceTimersByTime(2000);
    expect((await list()).items).toHaveLength(8);
    expect(getStore().activity[0]).toMatchObject({ action: "memory_refused", summary: "Refused to save a memory: it looked like a password", memoryId: null });
    expect((await call<Page<Message>>("GET", "messages?channel=web")).body.items[0].text).toContain("I don’t save passwords");
  });
});

describe("routing", () => {
  it("answers 404 in the contract's error shape for anything it doesn't know", async () => {
    const unknown = await call<ErrorBody>("GET", "nope");
    const wrongMethod = await call<ErrorBody>("DELETE", "me");
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: { code: "not_found", message: "Not found" } });
    expect(wrongMethod.status).toBe(404);
  });
});
