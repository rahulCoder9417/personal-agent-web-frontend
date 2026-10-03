import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActivityEntry,
  AgentSettings,
  Approval,
  App,
  ChannelLink,
  CreditBalance,
  LedgerEntry,
  Me,
  Message,
  UsagePeriod,
} from "@/lib/api/client";
import { handleDemoRequest, resetDemoStore } from "./index";
import { getStore } from "./store";

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
    const usage = await call<{ items: UsagePeriod[]; totals: { totalCredits: number } }>(
      "GET",
      `usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(NOW.toISOString())}`,
    );
    const today = usage.body.items.at(-1);
    expect(usage.body.items).toHaveLength(7);
    expect(today).toMatchObject({ aiCredits: 0, awakeCredits: 4, appActionCredits: 2, toolCredits: 0, totalCredits: 6 });
    expect(usage.body.totals.totalCredits).toBe(usage.body.items.reduce((sum, day) => sum + day.totalCredits, 0));
  });

  it("charges running time and app actions as separate ledger lines, and reading for nothing", async () => {
    const store = getStore();
    const charges = store.ledger.filter((entry) => entry.reason === "charge");
    const actions = charges.filter((entry) => entry.description?.startsWith("App action: "));
    const usage = charges.filter((entry) => entry.description?.startsWith("Usage: awake time "));
    expect(actions.length + usage.length).toBe(charges.length);
    expect(actions.every((entry) => entry.delta === -1)).toBe(true);

    const days = Object.values(store.usage);
    expect(days.reduce((sum, day) => sum + day.actions, 0)).toBe(actions.length);
    expect(days.reduce((sum, day) => sum + day.awake, 0)).toBe(usage.reduce((sum, entry) => sum - entry.delta, 0));

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

    await call("PATCH", "automations/aut_week", { enabled: false });
    const frame = await read();
    expect(frame.startsWith("event: automation.updated\ndata: ")).toBe(true);
    expect(JSON.parse(frame.split("data: ")[1])).toMatchObject({ type: "automation.updated", data: { id: "aut_week", enabled: false, pausedReason: "user" } });

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
    await call("POST", "apps/github/connect");
    const apps = (await call<{ items: App[] }>("GET", "apps")).body.items;
    expect(apps.find((app) => app.slug === "linear")?.connections).toMatchObject([{ status: "active" }]);
    expect(apps.find((app) => app.slug === "github")?.connections).toMatchObject([{ status: "active" }]);
    expect((await call("POST", "apps/linear/connect", { returnUrl: "https://evil.example/" })).status).toBe(400);
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
    expect(today).toMatchObject({ aiCredits: 2, awakeCredits: 5, appActionCredits: 2, totalCredits: 9 });

    const saved = await call<{ last4: string }>("PUT", "byok/openrouter", { apiKey: "sk-or-0123456789abcd" });
    expect(saved.body.last4).toBe("abcd");
    expect((await call<AgentSettings>("GET", "agent/settings")).body.aiAccess).toBe("own_key");
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

describe("routing", () => {
  it("answers 404 in the contract's error shape for anything it doesn't know", async () => {
    const unknown = await call<ErrorBody>("GET", "nope");
    const wrongMethod = await call<ErrorBody>("DELETE", "me");
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: { code: "not_found", message: "Not found" } });
    expect(wrongMethod.status).toBe(404);
  });
});
