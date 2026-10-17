import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActivityEntry,
  AgentProgress,
  AgentSettings,
  Approval,
  App,
  Automation,
  ChannelLink,
  Conversation,
  CreditBalance,
  CrewMember,
  LedgerEntry,
  Me,
  Memory,
  Message,
  MessageDraft,
  PrReviewRepo,
  StreamEvent,
  UsagePeriod,
  UsageTotals,
} from "@/lib/api/client";
import { QueryClient } from "@tanstack/react-query";
import { applyStreamEvent } from "@/lib/api/stream";
import { threadIsWorking } from "@/lib/chat-thread";
import { DRAFTS_KEY, type Drafts, NO_DRAFTS, stepsToShow, trailEntries, trailLine, turnOnScreen } from "@/lib/drafts";
import { hasMarkdown } from "@/lib/markdown";
import { draftCuts, runDemoAutomation } from "./handlers-chat";
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
    // The demo account's zone was chosen already, so the app never sets it from the browser.
    expect((await call<Me>("GET", "me")).body).toMatchObject({ timezone: "Asia/Kolkata", timezoneSet: true });
    const ok = await call<Me>("PATCH", "me", { name: "Aarav S", timezone: "Europe/London" });
    expect(ok.body).toMatchObject({ name: "Aarav S", timezone: "Europe/London", timezoneSet: true });
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

  it("shows Tex at work in the conversation it answers in, not in an earlier one or in Telegram's", async () => {
    const sent = await call<Message>("POST", "messages", { text: "What's on my calendar today?", clientMessageId: uuid(40) });
    expect(sent.body.conversationId).toBe("cnv_web_1");
    const working = async (conversationId: string) => {
      const busy = (await call<{ state: string }>("GET", "agent/status")).body.state === "busy";
      const thread = (await call<Page<Message>>("GET", `messages?conversationId=${conversationId}`)).body.items;
      return threadIsWorking(busy, thread);
    };

    vi.advanceTimersByTime(500);
    expect([await working("cnv_web_1"), await working("cnv_web_0"), await working("cnv_tg_1")]).toEqual([true, false, false]);
    vi.advanceTimersByTime(1500);
    expect([await working("cnv_web_1"), await working("cnv_web_0"), await working("cnv_tg_1")]).toEqual([false, false, false]);
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

  it("answers in Markdown where an answer is worth formatting: one seeded reply, and Scout's and Byte's", async () => {
    /** A heading, a table, a list, a block of code with its language, a link. */
    const parts = (text: string) => ({
      heading: /^## \S/m.test(text),
      table: /^\|.+\|\n\|[-:| ]+\|\n\|.+\|$/m.test(text),
      list: /^(?:- |1\. )\S/m.test(text),
      code: /^ *```[a-z]+\n[^]+?\n *```$/m.test(text),
      link: /\[[^\]]+\]\(https:\/\/[^)\s]+\.example[^)\s]*\)/.test(text),
    });
    const all = { heading: true, table: true, list: true, code: true, link: true };
    const newest = async () => (await call<Page<Message>>("GET", "messages?channel=web")).body.items[0];

    const seeded = await newest();
    expect(seeded).toMatchObject({ id: "msg_w8", direction: "out", conversationId: "cnv_web_1" });
    expect(parts(seeded.text)).toEqual(all);
    // Every other seeded message is plain text, shown as typed, but for the address at the end of a
    // run's copy on Telegram, and the draft's outline sent there, each drawn as a link.
    expect(getStore().messages.filter((message) => hasMarkdown(message.text)).map((message) => message.id)).toEqual([
      "msg_w8",
      "msg_review_copy",
      "msg_tg_boss",
    ]);

    await call<Message>("POST", "messages", { text: "Fix the bug in the signup form", clientMessageId: uuid(24) });
    vi.advanceTimersByTime(5000);
    const fromByte = await newest();
    expect(fromByte.text.startsWith("Byte took that one. In the demo account no code is really written")).toBe(true);
    expect(parts(fromByte.text)).toEqual(all);

    await call<Message>("POST", "messages", { text: "Research rooms for the offsite", clientMessageId: uuid(25) });
    vi.advanceTimersByTime(5000);
    const fromScout = await newest();
    expect(fromScout.text.startsWith("Scout looked into it. In the demo account nothing is really searched")).toBe(true);
    expect(parts(fromScout.text)).toEqual({ ...all, code: false });

    // The answer to anything else stays a plain sentence.
    await call<Message>("POST", "messages", { text: "Thanks", clientMessageId: uuid(26) });
    vi.advanceTimersByTime(2000);
    expect(hasMarkdown((await newest()).text)).toBe(false);
  });

  it("writes Tex's answer on screen as it is written, then posts it, as the backend does in web chat", async () => {
    const events: StreamEvent[] = [];
    subscribe(getStore(), (event) => events.push(event));
    const sent = await call<Message>("POST", "messages", { text: "What's on my calendar today?", clientMessageId: uuid(27) });
    vi.advanceTimersByTime(2000);

    const drafts = events.filter((event) => event.type === "message.draft").map((event) => event.data as MessageDraft);
    const answerAt = events.findIndex((event) => event.type === "message.created" && (event.data as Message).direction === "out");
    const answer = events[answerAt].data as Message;
    expect(drafts.length).toBeGreaterThan(5);
    for (const draft of drafts) {
      expect(draft).toMatchObject({ conversationId: sent.body.conversationId, turnId: `turn_${sent.body.id}`, messageId: sent.body.id });
      // The whole text so far, ending at the end of a word.
      expect(answer.text.startsWith(draft.text)).toBe(true);
      expect(answer.text.slice(draft.text.length)).toMatch(/^(\s|$)/);
    }
    expect(drafts.map((draft) => draft.text.length)).toEqual([...drafts.map((draft) => draft.text.length)].sort((a, b) => a - b));
    expect(drafts.at(-1)!.text).toBe(answer.text);
    // Every draft comes before the answer; nothing of them is saved.
    expect(events.findLastIndex((event) => event.type === "message.draft")).toBeLessThan(answerAt);
    expect(getStore().messages.filter((message) => message.conversationId === sent.body.conversationId && message.direction === "out" && message.createdAt >= sent.body.createdAt)).toHaveLength(1);
  });

  it("works through a question about the day a tool at a time, and the thread never loses what it showed", async () => {
    // The live stream as the web app takes it, into a real query cache, at the moment each event is sent.
    const qc = new QueryClient();
    const seen: string[] = [];
    let flashes = 0;
    let lastShown: string | null = null;
    subscribe(getStore(), (event) => {
      applyStreamEvent(qc, event);
      if (event.type === "message.draft") seen.push(`draft:${(event.data as MessageDraft).text}`);
      if (event.type === "agent.progress") seen.push(`progress:${(event.data as AgentProgress).text}`);
    });
    const sent = await call<Message>("POST", "messages", { text: "How does my day look?", clientMessageId: uuid(31) });
    const onScreen = () => turnOnScreen(qc.getQueryData<Drafts>(DRAFTS_KEY) ?? NO_DRAFTS, sent.body.conversationId);
    for (let ms = 0; ms < 8000; ms += 25) {
      vi.advanceTimersByTime(25);
      const turn = onScreen();
      const writing = turn?.writing ?? null;
      // Shown text that went without becoming a step, or the answer taking its place (the turn leaves the screen), is a flash.
      if (turn && lastShown && !writing?.startsWith(lastShown) && !turn.steps.some((step) => step.text === lastShown)) flashes++;
      if (writing) expect(writing.startsWith("Let me") || writing.startsWith("Now your"), "a short line before a tool is never shown").toBe(false);
      lastShown = writing;
    }

    // What the backend would have sent: two short lines and a long one, each started over for its tool, then the answer.
    const startedOver = seen.flatMap((step, index) => (step === "draft:" ? [seen[index - 1]] : []));
    expect(startedOver).toEqual([
      "draft:Let me check your calendar.",
      "draft:Now your inbox.",
      "draft:Two emails from Maya mention tomorrow’s review, so I’ll read both before I tell you what she needs from you.",
    ]);
    expect(seen.filter((step) => step.startsWith("progress:"))).toEqual(["progress:Checked your calendar", "progress:Checked your inbox", "progress:Read 2 emails"]);
    const answer = (await call<Page<Message>>("GET", `messages?conversationId=${sent.body.conversationId}`)).body.items[0];
    expect(answer).toMatchObject({ direction: "out" });
    expect(answer.text.startsWith("Today: “Roadmap sync” at 3pm")).toBe(true);
    // Each tool is a step; the long line was kept as a step before the tool it went on to; all fold into the answer.
    const folded = (qc.getQueryData<Drafts>(DRAFTS_KEY) ?? NO_DRAFTS).folded[answer.id];
    expect(folded.map((step) => step.text.slice(0, 21))).toEqual(["Checked your calendar", "Checked your inbox", "Two emails from Maya ", "Read 2 emails"]);
    expect(trailLine(folded)).toBe("Read 2 emails · 4 steps");
    expect(onScreen()).toBeNull();
    expect(flashes).toBe(0);
  });

  it("works through a long turn, the same step many times over, with Scout's line under Tex's", async () => {
    const qc = new QueryClient();
    subscribe(getStore(), (event) => applyStreamEvent(qc, event));
    const sent = await call<Message>("POST", "messages", { text: "What are the open issues in acme/web?", clientMessageId: uuid(32) });
    const onScreen = () => turnOnScreen(qc.getQueryData<Drafts>(DRAFTS_KEY) ?? NO_DRAFTS, sent.body.conversationId);
    // Midway: the turn is on screen with its steps, still at work.
    vi.advanceTimersByTime(6000);
    expect(onScreen()?.steps.length).toBeGreaterThan(5);
    vi.advanceTimersByTime(10_000);

    const answer = (await call<Page<Message>>("GET", `messages?conversationId=${sent.body.conversationId}`)).body.items[0];
    expect(answer.text.startsWith("acme/web has three open issues")).toBe(true);
    const folded = (qc.getQueryData<Drafts>(DRAFTS_KEY) ?? NO_DRAFTS).folded[answer.id];
    expect(folded.map((step) => step.text.slice(0, 19))).toEqual([
      "Looked at your apps",
      "Looked at your apps",
      "The GitHub app has ",
      ...Array.from({ length: 6 }, () => "Read a web page"),
      "Searched the web",
      ...Array.from({ length: 10 }, () => "Read a web page"),
    ]);
    expect(folded[2].progress.map((line) => `${line.name} · ${line.text}`)).toEqual(["Scout · List open issues in acme/web"]);
    expect(trailLine(folded)).toBe("Read a web page · 20 steps");
    // On screen: five lines, the repeats counted, the last three shown and three earlier steps folded.
    expect(trailEntries(folded).map((entry) => entry.times)).toEqual([2, 1, 6, 1, 10]);
    expect(stepsToShow(folded, false).earlier).toBe(3);
    expect(onScreen()).toBeNull();
  });

  it("starts the draft over when a specialist sets to work, and writes the answer after it", async () => {
    const events: StreamEvent[] = [];
    subscribe(getStore(), (event) => events.push(event));
    await call<Message>("POST", "messages", { text: "Research what other tools charge for seats", clientMessageId: uuid(28) });
    vi.advanceTimersByTime(5000);

    const seen = events
      .filter((event) => event.type === "message.draft" || event.type === "agent.progress" || event.type === "message.created")
      .map((event) =>
        event.type === "message.draft" ? `draft:${(event.data as MessageDraft).text}` : event.type === "agent.progress" ? "progress" : "created",
      );
    const firstProgress = seen.indexOf("progress");
    expect(seen.slice(0, firstProgress).at(-2)).toBe("draft:I’ll hand this to Scout.");
    expect(seen[firstProgress - 1], "the intro goes when Scout sets to work").toBe("draft:");
    const lastProgress = seen.lastIndexOf("progress");
    expect(seen.slice(lastProgress + 1, -1).every((step) => step.startsWith("draft:Scout looked into it"))).toBe(true);
    expect(seen.at(-1)).toBe("created");
  });

  it("writes nothing ahead for a fact to remember or a risky request", async () => {
    const events: StreamEvent[] = [];
    subscribe(getStore(), (event) => events.push(event));
    await call<Message>("POST", "messages", { text: "Remember that I send invoices on the 1st", clientMessageId: uuid(29) });
    vi.advanceTimersByTime(2000);
    await call<Message>("POST", "messages", { text: "Email Maya the kickoff notes", clientMessageId: uuid(30) });
    vi.advanceTimersByTime(2000);
    expect(events.filter((event) => event.type === "message.draft")).toEqual([]);
  });

  it("cuts a draft at the end of a word, a little further each step, the last at the end", () => {
    expect(draftCuts("Got it. In the demo", 4)).toEqual([7, 10, 19]);
    expect(draftCuts("Got it. In the demo", 5)).toEqual([7, 10, 14, 19]);
    expect(draftCuts("Hello", 10)).toEqual([5]);
    expect(draftCuts("", 3)).toEqual([]);
  });

  it("asks for an OK instead of acting when the request is risky", async () => {
    await call<Message>("POST", "messages", { text: "Email Maya the kickoff notes", clientMessageId: uuid(2) });
    vi.advanceTimersByTime(2000);
    const pending = (await call<Page<Approval>>("GET", "approvals")).body.items;
    const [ask, request] = (await call<Page<Message>>("GET", "messages?channel=web")).body.items;
    expect(pending).toHaveLength(4);
    // Like the backend: Tex's question is one message carrying the approval, made from its summary,
    // and nothing more is said until the person answers.
    expect(ask.approvalId).toBe(pending[0].id);
    expect(ask.text).toBe("I'd like to email Maya the kickoff notes. Approve or Deny below.");
    expect(request.direction).toBe("in");
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1884);
  });

  it("keeps the earlier name for a new chat working: POST chats/new starts a conversation and says when", async () => {
    type Thread = Page<Message> & { chatStartedAt: string | null };
    const before = await call<Thread>("GET", "messages");
    // The seeded web chat has been started afresh once already.
    expect(before.body.chatStartedAt).toBe(getStore().conversations.find((item) => item.id === "cnv_web_1")?.startedAt);

    vi.advanceTimersByTime(60_000);
    const started = await call<{ chatStartedAt: string }>("POST", "chats/new");
    expect(started.status).toBe(200);
    expect(started.body.chatStartedAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    const active = getStore().conversations.filter((item) => item.channel === "web" && item.active);
    expect(active).toHaveLength(1);
    // Number 2 is the Automations chat's.
    expect(active[0]).toMatchObject({ epoch: 3, startedAt: started.body.chatStartedAt, title: "New chat" });

    // Earlier messages are still there; every page and filter says when the new chat started.
    const after = await call<Thread>("GET", "messages");
    expect(after.body.items).toEqual(before.body.items);
    expect(after.body.chatStartedAt).toBe(started.body.chatStartedAt);
    expect((await call<Thread>("GET", "messages?channel=telegram")).body.chatStartedAt).toBe(started.body.chatStartedAt);
    // The web chat itself now shows the new, empty conversation.
    expect((await call<Thread>("GET", "messages?channel=web")).body.items).toEqual([]);

    // Logged with the channel and no text; no turn ran and nothing was charged.
    expect(getStore().activity[0]).toMatchObject({ actor: "user", action: "chat_started", summary: "Started a new chat in web chat", creditsCharged: null });
    expect((await call<Me>("GET", "me")).body.credits.balance).toBe(1884);
    expect(getStore().agentStatus.state).toBe("awake");
  });

  it("allows 30 new chats an hour, whichever path asks", async () => {
    for (let i = 0; i < 15; i++) expect((await call("POST", "chats/new")).status).toBe(200);
    for (let i = 0; i < 15; i++) expect((await call("POST", "conversations")).status).toBe(201);
    for (const path of ["chats/new", "conversations"]) {
      const limited = await call<ErrorBody>("POST", path);
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe("rate_limited");
    }
    expect(getStore().conversations.filter((item) => item.channel === "web" && item.kind === "chat")).toHaveLength(32);

    vi.advanceTimersByTime(3_600_001);
    expect((await call("POST", "conversations")).status).toBe(201);
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
    expect(await read()).toBe('event: ready\ndata: {"resumed":false}\n\n');

    await call("PATCH", "automations/aut_meetings", { enabled: false });
    const frame = await read();
    expect(frame.startsWith("event: automation.updated\ndata: ")).toBe(true);
    expect(JSON.parse(frame.split("data: ")[1])).toMatchObject({ type: "automation.updated", data: { id: "aut_meetings", enabled: false, pausedReason: "user" } });

    abort.abort();
    expect(getStore().listeners.size).toBe(0);
  });
});

describe("conversations", () => {
  type Thread = Page<Message>;
  const list = async (query = "") => (await call<Page<Conversation>>("GET", `conversations${query}`)).body;
  const thread = async (conversationId: string) => (await call<Thread>("GET", `messages?conversationId=${conversationId}`)).body.items;
  const events = () => {
    const seen: StreamEvent[] = [];
    subscribe(getStore(), (event) => seen.push(event));
    return seen;
  };

  it("lists the history newest first, with what each conversation is called and which one is written in", async () => {
    const all = await list("?kind=chat");
    expect(all.nextCursor).toBeNull();
    expect(all.items.map((item) => [item.id, item.channel, item.epoch, item.active])).toEqual([
      ["cnv_tg_1", "telegram", 1, true],
      ["cnv_web_1", "web", 1, true],
      ["cnv_web_0", "web", 0, false],
      ["cnv_tg_0", "telegram", 0, false],
    ]);
    // The first incoming message names it, cut at a word to 60 characters.
    expect(all.items.map((item) => item.title)).toEqual([
      "Acme kickoff: budget signed off, launch moves to the 20th…",
      "What did you get done for me yesterday?",
      "Draft a short update for the team about Friday’s offsite",
      "What’s on my calendar on Thursday?",
    ]);
    for (const item of all.items) {
      expect(item.id.startsWith("cnv_")).toBe(true);
      expect(item.kind).toBe("chat");
      expect(item.title.length).toBeLessThanOrEqual(61);
      expect(item.lastMessageAt).toBe((await thread(item.id))[0].createdAt);
    }
  });

  it("says which conversations have something from Tex that wasn't seen: the later Telegram chat, at first", async () => {
    const all = (await list()).items;
    expect(all.map((item) => [item.id, item.unread])).toEqual([
      ["cnv_tg_1", true],
      ["cnv_web_1", false],
      ["cnv_automations", false],
      ["cnv_web_0", false],
      ["cnv_tg_0", false],
    ]);
  });

  it("marks one read once, and says so on the stream; a reply in it makes it unread again", async () => {
    const seen = events();
    const read = await call<Conversation>("POST", "conversations/cnv_tg_1/read");
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id: "cnv_tg_1", unread: false });
    expect((await list()).items.find((item) => item.id === "cnv_tg_1")?.unread).toBe(false);
    expect(seen.filter((event) => event.type === "conversation.updated").map((event) => event.data)).toMatchObject([{ id: "cnv_tg_1", unread: false }]);
    // Read already: the same answer, and nothing more on the stream.
    expect((await call<Conversation>("POST", "conversations/cnv_tg_1/read")).body).toMatchObject({ unread: false });
    expect(seen.filter((event) => event.type === "conversation.updated")).toHaveLength(1);
    expect((await call<ErrorBody>("POST", "conversations/cnv_nope/read")).status).toBe(404);

    // The person writes in the open web chat: their own message never makes it unread; Tex's answer does.
    await call<Message>("POST", "messages", { text: "Thanks", clientMessageId: uuid(70) });
    expect((await list()).items.find((item) => item.id === "cnv_web_1")?.unread).toBe(false);
    vi.advanceTimersByTime(2000);
    expect((await list()).items.find((item) => item.id === "cnv_web_1")?.unread).toBe(true);
    const updates = seen.filter((event) => event.type === "conversation.updated").map((event) => event.data as Conversation);
    expect(updates.at(-1)).toMatchObject({ id: "cnv_web_1", unread: true });
  });

  it("marks the Automations chat when a run arrives, until it is read", async () => {
    runDemoAutomation(getStore());
    expect((await list("?kind=automations")).items[0]).toMatchObject({ id: "cnv_automations", unread: true });
    expect((await call<Conversation>("POST", "conversations/cnv_automations/read")).body).toMatchObject({ kind: "automations", unread: false });
  });

  it("keeps the Automations chat apart: its own kind, never active, listed alone with kind=automations", async () => {
    const pinned = (await list("?kind=automations")).items;
    expect(pinned.map((item) => [item.id, item.kind, item.channel, item.epoch, item.active, item.title])).toEqual([
      ["cnv_automations", "automations", "web", 2, false, "Automations"],
    ]);
    // Every run is in it: the weekday meetings and the pull-request review's verdict.
    expect((await thread("cnv_automations")).map((message) => message.id)).toEqual(["msg_review", "msg_run_2", "msg_run_1"]);
    expect(pinned[0].lastMessageAt).toBe((await thread("cnv_automations"))[0].createdAt);
    // Without `kind`, it is listed with the rest, in its place by time.
    expect((await list()).items.map((item) => item.id)).toEqual(["cnv_tg_1", "cnv_web_1", "cnv_automations", "cnv_web_0", "cnv_tg_0"]);
    expect((await call<ErrorBody>("GET", "conversations?kind=pinned")).status).toBe(400);
  });

  it("writes in the Automations chat without making it active, and keeps its name", async () => {
    const sent = await call<Message>("POST", "messages", { text: "Which meeting can move?", clientMessageId: uuid(57), conversationId: "cnv_automations" });
    expect(sent.status).toBe(202);
    expect(sent.body.conversationId).toBe("cnv_automations");
    vi.advanceTimersByTime(2000);
    expect((await thread("cnv_automations"))[0]).toMatchObject({ direction: "out", conversationId: "cnv_automations" });
    expect((await list("?channel=web")).items.filter((item) => item.active).map((item) => item.id)).toEqual(["cnv_web_1"]);
    // A message without a conversation still goes to the active one.
    expect((await call<Message>("POST", "messages", { text: "Thanks", clientMessageId: uuid(58) })).body.conversationId).toBe("cnv_web_1");

    for (const body of [{ title: "Runs" }, { active: true }]) {
      const refused = await call<ErrorBody>("PATCH", "conversations/cnv_automations", body);
      expect(refused.status).toBe(409);
    }
    expect((await list("?kind=automations")).items[0]).toMatchObject({ title: "Automations", active: false });
  });

  it("starts with no Automations chat when the automations were made before it existed, and the next run starts it", async () => {
    vi.stubEnv("TEXTCREW_DEMO_AUTOMATIONS_CHAT", "none");
    try {
      resetDemoStore(NOW);
      expect((await list("?kind=automations")).items).toEqual([]);
      expect((await call<Page<Automation>>("GET", "automations")).body.items.length).toBeGreaterThan(0);
      runDemoAutomation(getStore());
      expect((await list("?kind=automations")).items).toMatchObject([{ kind: "automations", title: "Automations" }]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses to delete the Automations chat (409), and the next run answers in it", async () => {
    const seen = events();
    const refused = await call<ErrorBody>("DELETE", "conversations/cnv_automations");
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({ code: "conflict", message: "The Automations chat can't be deleted" });
    expect((await list("?kind=automations")).items.map((item) => item.id)).toEqual(["cnv_automations"]);
    expect((await thread("cnv_automations")).map((message) => message.id)).toEqual(["msg_review", "msg_run_2", "msg_run_1"]);
    expect(getStore().activity.filter((entry) => entry.action === "conversation_deleted")).toEqual([]);
    runDemoAutomation(getStore());
    expect((await thread("cnv_automations"))[0]).toMatchObject({ direction: "out", conversationId: "cnv_automations" });
    expect((await list("?channel=web")).items.filter((item) => item.active).map((item) => item.id)).toEqual(["cnv_web_1"]);
    expect(seen.map((event) => event.type)).toEqual(["message.created", "conversation.updated", "automation.updated"]);
  });

  it("filters by chat app and pages with a cursor", async () => {
    expect((await list("?channel=web&kind=chat")).items.map((item) => item.id)).toEqual(["cnv_web_1", "cnv_web_0"]);
    expect((await list("?channel=web")).items.map((item) => item.id)).toEqual(["cnv_web_1", "cnv_automations", "cnv_web_0"]);
    expect((await list("?channel=telegram")).items.map((item) => item.id)).toEqual(["cnv_tg_1", "cnv_tg_0"]);
    expect((await call<ErrorBody>("GET", "conversations?channel=fax")).status).toBe(400);

    const first = await list("?limit=3&kind=chat");
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();
    const second = await list(`?limit=3&kind=chat&cursor=${encodeURIComponent(first.nextCursor ?? "")}`);
    expect(second.items.map((item) => item.id)).toEqual(["cnv_tg_0"]);
    expect(second.nextCursor).toBeNull();
  });

  it("gives every message its conversation, and lists one conversation's messages only", async () => {
    const everything = (await call<Thread>("GET", "messages")).body.items;
    const known = new Set((await list()).items.map((item) => item.id));
    expect(everything.every((message) => known.has(message.conversationId))).toBe(true);

    expect((await thread("cnv_web_0")).map((message) => message.id)).toEqual(["msg_w4", "msg_w3", "msg_w2", "msg_w1"]);
    expect((await thread("cnv_tg_0")).every((message) => message.channel === "telegram" && message.conversationId === "cnv_tg_0")).toBe(true);
    // Without a conversation, the web chat is its active conversation; a chat app is all of its messages.
    expect((await call<Thread>("GET", "messages?channel=web")).body.items.map((message) => message.id)).toEqual(["msg_w8", "msg_w7", "msg_w6d", "msg_w6c", "msg_w6b", "msg_w6a", "msg_w6", "msg_w5"]);
    expect((await call<Thread>("GET", "messages?channel=telegram")).body.items).toHaveLength(11);
    expect((await call<ErrorBody>("GET", "messages?conversationId=cnv_nope")).status).toBe(404);
  });

  it("starts a new web conversation: empty, active, called New chat, and the earlier ones stay", async () => {
    const seen = events();
    vi.advanceTimersByTime(60_000);
    const started = await call<Conversation>("POST", "conversations");
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ channel: "web", kind: "chat", epoch: 3, active: true, title: "New chat", startedAt: new Date(NOW.getTime() + 60_000).toISOString() });
    expect(started.body.id.startsWith("cnv_")).toBe(true);
    expect(await thread(started.body.id)).toEqual([]);

    const all = (await list()).items;
    expect(all[0].id).toBe(started.body.id);
    expect(all.filter((item) => item.channel === "web" && item.active).map((item) => item.id)).toEqual([started.body.id]);
    // Telegram's own latest conversation is untouched.
    expect(all.find((item) => item.id === "cnv_tg_1")?.active).toBe(true);
    expect((await thread("cnv_web_1")).map((message) => message.id)).toEqual(["msg_w8", "msg_w7", "msg_w6d", "msg_w6c", "msg_w6b", "msg_w6a", "msg_w6", "msg_w5"]);

    // The stream says which one stopped being active and which one is new.
    expect(seen.map((event) => [event.type, (event.data as Conversation).id, (event.data as Conversation).active])).toEqual([
      ["conversation.updated", "cnv_web_1", false],
      ["conversation.updated", started.body.id, true],
    ]);
    expect(getStore().activity[0]).toMatchObject({ actor: "user", action: "chat_started", creditsCharged: null });
  });

  it("names a new conversation after the first thing said in it, and Tex answers in that conversation", async () => {
    const started = (await call<Conversation>("POST", "conversations")).body;
    const seen = events();
    const sent = await call<Message>("POST", "messages", { text: "Find  a quiet café near the office for Thursday’s catch-up with the design team", clientMessageId: uuid(50) });
    expect(sent.body.conversationId).toBe(started.id);

    vi.advanceTimersByTime(2000);
    const named = (await list()).items[0];
    expect(named).toMatchObject({ id: started.id, title: "Find a quiet café near the office for Thursday’s catch-up…", active: true });
    const messages = await thread(started.id);
    expect(messages.map((message) => message.direction)).toEqual(["out", "in"]);
    expect(named.lastMessageAt).toBe(messages[0].createdAt);
    // Each message that is saved moves its conversation, and the stream says so.
    expect(seen.filter((event) => event.type === "conversation.updated").map((event) => (event.data as Conversation).id)).toEqual([started.id, started.id]);
    expect(seen.filter((event) => event.type === "message.created").every((event) => (event.data as Message).conversationId === started.id)).toBe(true);
  });

  it("writes in an earlier web conversation when it is named, which makes it the active one", async () => {
    vi.advanceTimersByTime(60_000);
    const sent = await call<Message>("POST", "messages", { text: "Make it shorter", clientMessageId: uuid(51), conversationId: "cnv_web_0" });
    expect(sent.status).toBe(202);
    expect(sent.body.conversationId).toBe("cnv_web_0");

    vi.advanceTimersByTime(2000);
    const all = (await list("?kind=chat")).items;
    expect(all.map((item) => [item.id, item.active])).toEqual([["cnv_web_0", true], ["cnv_tg_1", true], ["cnv_web_1", false], ["cnv_tg_0", false]]);
    // Its own title stays, Tex answers there, and the conversation that was active got nothing.
    expect(all[0].title).toBe("Draft a short update for the team about Friday’s offsite");
    expect((await thread("cnv_web_0")).slice(0, 2).map((message) => [message.direction, message.conversationId])).toEqual([["out", "cnv_web_0"], ["in", "cnv_web_0"]]);
    expect(await thread("cnv_web_1")).toHaveLength(8);
    // From now on a message without a conversation goes there too.
    const next = await call<Message>("POST", "messages", { text: "Thanks", clientMessageId: uuid(52) });
    expect(next.body.conversationId).toBe("cnv_web_0");
  });

  it("doesn't let the web write in a Telegram conversation, or in one that doesn't exist", async () => {
    const telegram = await call<ErrorBody>("POST", "messages", { text: "hello", clientMessageId: uuid(53), conversationId: "cnv_tg_1" });
    expect(telegram.status).toBe(409);
    expect(telegram.body.error.message).toBe("Reply on Telegram to continue this chat");
    expect((await call<ErrorBody>("POST", "messages", { text: "hello", clientMessageId: uuid(54), conversationId: "cnv_nope" })).status).toBe(404);
    expect(await thread("cnv_tg_1")).toHaveLength(9);
  });

  it("renames a conversation, Telegram's too, and keeps the name when more is said", async () => {
    const seen = events();
    const renamed = await call<Conversation>("PATCH", "conversations/cnv_web_1", { title: "  Yesterday’s recap " });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: "cnv_web_1", title: "Yesterday’s recap", active: true });
    expect((await call<Conversation>("PATCH", "conversations/cnv_tg_0", { title: "Thursday" })).body.title).toBe("Thursday");
    expect(seen.map((event) => [event.type, (event.data as Conversation).title])).toEqual([["conversation.updated", "Yesterday’s recap"], ["conversation.updated", "Thursday"]]);

    await call<Message>("POST", "messages", { text: "And the day before?", clientMessageId: uuid(55) });
    expect((await list()).items.find((item) => item.id === "cnv_web_1")?.title).toBe("Yesterday’s recap");

    expect((await call<ErrorBody>("PATCH", "conversations/cnv_web_1", { title: "   " })).status).toBe(400);
    expect((await call<ErrorBody>("PATCH", "conversations/cnv_web_1", { title: "x".repeat(81) })).status).toBe(400);
    expect((await call<ErrorBody>("PATCH", "conversations/cnv_web_1", {})).status).toBe(400);
    expect((await call<ErrorBody>("PATCH", "conversations/cnv_nope", { title: "x" })).status).toBe(404);
  });

  it("makes an earlier web conversation the active one when asked, and refuses that for Telegram", async () => {
    const made = await call<Conversation>("PATCH", "conversations/cnv_web_0", { active: true });
    expect(made.body).toMatchObject({ id: "cnv_web_0", active: true });
    expect((await list("?channel=web&kind=chat")).items.map((item) => [item.id, item.active])).toEqual([["cnv_web_1", false], ["cnv_web_0", true]]);
    expect((await call<Thread>("GET", "messages?channel=web")).body.items[0].id).toBe("msg_w4");

    const refused = await call<ErrorBody>("PATCH", "conversations/cnv_tg_0", { active: true });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("conflict");
    expect((await call<ErrorBody>("PATCH", "conversations/cnv_web_0", { active: false })).status).toBe(400);
  });

  it("deletes a conversation with its messages and files, and logs it without any text", async () => {
    const seen = events();
    const before = (await call<Thread>("GET", "messages")).body.items.length;
    const deleted = await call("DELETE", "conversations/cnv_tg_1");
    expect(deleted.status).toBe(204);

    expect((await list("?kind=chat")).items.map((item) => item.id)).toEqual(["cnv_web_1", "cnv_web_0", "cnv_tg_0"]);
    expect((await call<Thread>("GET", "messages")).body.items).toHaveLength(before - 9);
    expect((await call<ErrorBody>("GET", "messages?conversationId=cnv_tg_1")).status).toBe(404);
    expect(seen.map((event) => [event.type, (event.data as Conversation).id])).toEqual([["conversation.deleted", "cnv_tg_1"]]);

    const logged = getStore().activity[0];
    expect(logged).toMatchObject({ actor: "user", action: "conversation_deleted", summary: "Deleted a chat in Telegram", creditsCharged: null });
    expect(logged.summary).not.toContain("Acme");
    expect((await call("DELETE", "conversations/cnv_tg_1")).status).toBe(404);
  });

  it("forgets a sent message's files and its idempotency key with its conversation", async () => {
    const form = new FormData();
    form.append("file", new File(["hello"], "notes.txt", { type: "text/plain" }));
    const upload = await handleDemoRequest(new Request(`${ORIGIN}/api/v1/attachments`, { method: "POST", body: form }), ["attachments"]);
    const file = (await upload.json()) as { id: string };
    await call<Message>("POST", "messages", { text: "File this", clientMessageId: uuid(56), attachmentIds: [file.id] });
    expect(getStore().attachments[file.id]).toBeTruthy();

    await call("DELETE", "conversations/cnv_web_1");
    expect(getStore().attachments[file.id]).toBeUndefined();
    expect(getStore().sentIds[uuid(56)]).toBeUndefined();
    // Tex was about to answer there: nothing is said in a conversation that is gone.
    vi.advanceTimersByTime(2000);
    expect(getStore().messages.some((message) => message.conversationId === "cnv_web_1")).toBe(false);
    expect(getStore().agentStatus.state).toBe("awake");
  });

  it("makes the newest web conversation left the active one when the active one is deleted, or starts an empty one", async () => {
    const seen = events();
    await call("DELETE", "conversations/cnv_web_1");
    expect((await list("?channel=web&kind=chat")).items.map((item) => [item.id, item.active])).toEqual([["cnv_web_0", true]]);
    expect(seen.map((event) => [event.type, (event.data as Conversation).id])).toEqual([["conversation.deleted", "cnv_web_1"], ["conversation.updated", "cnv_web_0"]]);

    await call("DELETE", "conversations/cnv_web_0");
    const left = (await list("?channel=web&kind=chat")).items;
    expect(left).toHaveLength(1);
    // A number never used before: the Automations chat holds number 2.
    expect(left[0]).toMatchObject({ active: true, title: "New chat", epoch: 3 });
    expect(await thread(left[0].id)).toEqual([]);
    // Deleting one that isn't active leaves the active one alone.
    await call<Conversation>("POST", "conversations");
    await call("DELETE", `conversations/${left[0].id}`);
    expect((await list("?channel=web")).items.filter((item) => item.active)).toHaveLength(1);
  });

  it("answers an approval in the conversation that asked, and where its chat writes now if that was deleted", async () => {
    await call("DELETE", "conversations/cnv_tg_1");
    await call<Approval>("POST", "approvals/ap_email/decision", { decision: "reject" });
    vi.advanceTimersByTime(1000);
    // The ask went with its conversation; the web chat is where the person is.
    expect((await thread("cnv_web_1"))[0].text).toContain("I won’t send it");
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
    expect(connect.body.redirectUrl).toBe(`${ORIGIN}/apps?app=linear&status=success`);
    await call("POST", "apps/googledrive/connect");
    const apps = (await call<{ items: App[] }>("GET", "apps")).body.items;
    expect(apps.find((app) => app.slug === "linear")?.connections).toMatchObject([{ status: "active" }]);
    expect(apps.find((app) => app.slug === "googledrive")?.connections).toMatchObject([{ status: "active" }]);
    expect((await call("POST", "apps/linear/connect", { returnUrl: "https://evil.example/" })).status).toBe(400);
  });

  it("says whose sign-in comes next and what Tex can do, for every app, as the backend does", async () => {
    const apps = (await call<{ items: App[] }>("GET", "apps")).body.items;
    for (const app of apps) {
      expect(app.provider, app.slug).toMatch(/^[A-Z][A-Za-z]+$/);
      expect(app.description, app.slug).toMatch(/^[A-Z][^.]{10,90}\.$/);
    }
    expect(apps.find((app) => app.slug === "gmail")).toMatchObject({ provider: "Google" });
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
    // Every Claude model Claude Code can use, as the backend lists them: the current ones, then the older ones.
    expect(settings.claudeChoices.models.map((model) => model.id)).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "claude-fable-5-1",
      "claude-fable-5",
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-opus-4-5",
      "claude-haiku-4-5",
    ]);
    const byId = Object.fromEntries(settings.claudeChoices.models.map((model) => [model.id, model]));
    expect(settings.claudeChoices.models.filter((model) => model.group === "current").map((model) => model.label)).toEqual([
      "Opus 5.5",
      "Sonnet 5.5",
      "Haiku 5.5",
      "Fable 5.1",
    ]);
    expect(byId["claude-opus-5-5"].efforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(byId["claude-sonnet-4-6"].efforts).toEqual(["low", "medium", "high", "max"]);
    expect(byId["claude-haiku-4-5"].efforts).toEqual([]);
    expect(byId["claude-fable-5-1"].note).toMatch(/usage credits/);
    expect(byId["claude-opus-5-5"].note).toBeUndefined();
    expect(settings.claudeChoices.efforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  it("saves an older Claude model too", async () => {
    const chosen = await call<AgentSettings>("PATCH", "agent/settings", { claudeModel: "claude-opus-4-6", claudeEffort: "max" });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toMatchObject({ claudeModel: "claude-opus-4-6", claudeEffort: "max" });
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

  it("saves each crew member's model and effort on its own; null goes back to its Default", async () => {
    const start = (await call<AgentSettings>("GET", "agent/settings")).body;
    const onDefault = { model: null, effort: null };
    expect(start.claudeCrew).toEqual({ byte: onDefault, patch: onDefault, scout: onDefault });
    expect(start.claudeChoices.crewDefaults).toEqual({
      byte: { model: "claude-opus-5-5", effort: "medium" },
      patch: { model: "claude-opus-5-5", effort: "medium" },
      scout: onDefault,
    });
    const chosen = await call<AgentSettings>("PATCH", "agent/settings", { claudeCrew: { patch: { model: "claude-sonnet-5-5", effort: "low" } } });
    expect(chosen.status).toBe(200);
    expect(chosen.body.claudeCrew).toEqual({ byte: onDefault, patch: { model: "claude-sonnet-5-5", effort: "low" }, scout: onDefault });
    const effortOnly = await call<AgentSettings>("PATCH", "agent/settings", { claudeCrew: { patch: { effort: "high" } } });
    expect(effortOnly.body.claudeCrew.patch).toEqual({ model: "claude-sonnet-5-5", effort: "high" });
    expect(effortOnly.body.claudeModel).toBeNull();
    const back = await call<AgentSettings>("PATCH", "agent/settings", { claudeCrew: { patch: { model: null, effort: null } } });
    expect(back.body.claudeCrew.patch).toEqual(onDefault);
    for (const body of [
      { claudeCrew: { tex: { model: "claude-opus-5-5" } } },
      { claudeCrew: { byte: { model: "gpt-6.1-sol" } } },
      { claudeCrew: { byte: { effort: "extreme" } } },
      { claudeCrew: { byte: {} } },
      { claudeCrew: { byte: { model: "claude-opus-5-5", color: "red" } } },
      { claudeCrew: {} },
      { claudeCrew: "byte" },
    ]) {
      const refused = await call<ErrorBody>("PATCH", "agent/settings", body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect(refused.body.error.code).toBe("invalid_request");
    }
    expect((await call<AgentSettings>("GET", "agent/settings")).body.claudeCrew).toEqual({ byte: onDefault, patch: onDefault, scout: onDefault });
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

  it("gives the linked Telegram chat its masked id, the last time it wrote, and not blocked", async () => {
    const [telegram] = (await call<{ items: ChannelLink[] }>("GET", "channels")).body.items;
    const lastIn = getStore()
      .messages.filter((message) => message.channel === "telegram" && message.direction === "in")
      .map((message) => message.createdAt)
      .sort()
      .at(-1);
    expect(telegram).toMatchObject({ displayId: "@aarav_s", maskedChatId: "•••• 4821", lastInboundAt: lastIn, blocked: false });
    expect(Date.parse(telegram.lastInboundAt!)).toBe(NOW.getTime() - 17 * 60_000);
  });

  it("has the Telegram chat block the bot with TEXTCREW_DEMO_TELEGRAM=blocked", async () => {
    vi.stubEnv("TEXTCREW_DEMO_TELEGRAM", "blocked");
    try {
      resetDemoStore(NOW);
      const [telegram] = (await call<{ items: ChannelLink[] }>("GET", "channels")).body.items;
      expect(telegram).toMatchObject({ channel: "telegram", blocked: true });
    } finally {
      vi.unstubAllEnvs();
    }
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
    const linked = (await call<{ items: ChannelLink[] }>("GET", "channels")).body.items;
    expect(linked.map((link) => link.channel)).toEqual(["telegram"]);
    // Sending the code was the chat's first message.
    expect(linked[0]).toMatchObject({ maskedChatId: "•••• 4821", lastInboundAt: linked[0].linkedAt, blocked: false });
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

describe("getting started", () => {
  it("keeps the welcome flow and the checklist on the account, and takes true and false for them", async () => {
    const before = (await call<Me>("GET", "me")).body;
    // The usual demo account went through the welcome flow when it signed up.
    expect(before.onboardingCompletedAt).not.toBeNull();
    expect(before.gettingStartedDismissedAt).toBeNull();

    const again = await call<Me>("PATCH", "me", { onboardingCompleted: false });
    expect(again.body.onboardingCompletedAt).toBeNull();
    const done = await call<Me>("PATCH", "me", { onboardingCompleted: true, gettingStartedDismissed: true });
    expect(done.body.onboardingCompletedAt).toBe(NOW.toISOString());
    expect(done.body.gettingStartedDismissedAt).toBe(NOW.toISOString());

    // Saying it again keeps the first date.
    vi.advanceTimersByTime(60_000);
    expect((await call<Me>("PATCH", "me", { gettingStartedDismissed: true })).body.gettingStartedDismissedAt).toBe(NOW.toISOString());
    expect((await call<Me>("PATCH", "me", { gettingStartedDismissed: false })).body.gettingStartedDismissedAt).toBeNull();
    expect((await call("PATCH", "me", { onboardingCompleted: "yes" })).status).toBe(400);
  });

  it("starts a brand-new account with nothing set up and nothing put away", async () => {
    resetDemoStore(NOW, "new");
    const me = (await call<Me>("GET", "me")).body;
    expect(me).toMatchObject({ plan: "free", timezone: "UTC", timezoneSet: false, onboardingCompletedAt: null, gettingStartedDismissedAt: null });
    expect(me.id).toMatch(/^user_new_/);
    expect(me.credits.balance).toBe(100);

    const channels = (await call<{ items: ChannelLink[]; available: string[] }>("GET", "channels")).body;
    expect(channels).toEqual({ items: [], available: ["telegram", "web"] });
    const apps = (await call<{ items: App[] }>("GET", "apps")).body.items;
    expect(apps.length).toBeGreaterThan(5);
    expect(apps.every((app) => app.connections.length === 0)).toBe(true);
    expect((await call<Page<Conversation>>("GET", "conversations?kind=chat")).body.items).toEqual([]);
    expect((await call<{ items: Automation[] }>("GET", "automations")).body.items).toEqual([]);
    expect((await call<Page<Approval>>("GET", "approvals?status=pending")).body.items).toEqual([]);
    // Textcrew AI is on offer by default, so Tex already works, on credits.
    expect((await call<AgentSettings>("GET", "agent/settings")).body).toMatchObject({ aiAccess: "platform", ownKeyProviders: [], claude: { connected: false } });
  });

  it("has no AI on a new account where your own AI is required, and answers as the backend does until one is connected", async () => {
    vi.stubEnv("TEXTCREW_DEMO_AI_ACCESS_MODE", "own_only");
    try {
      resetDemoStore(NOW, "new");
      expect((await call<AgentSettings>("GET", "agent/settings")).body).toMatchObject({ aiAccess: "none", effectiveRuntime: null, platformAvailable: false });

      const sent = await call<Message>("POST", "messages", { text: "Hi Tex!", clientMessageId: uuid(1) });
      expect(sent.status).toBe(202);
      vi.advanceTimersByTime(5000);
      const thread = (await call<Page<Message>>("GET", `messages?conversationId=${sent.body.conversationId}`)).body.items;
      expect(thread[0]).toMatchObject({ direction: "out" });
      expect(thread[0].text).toContain("Connect your own AI first");
      expect(thread[0].text).toContain("/settings/ai");
      // Nothing ran, so nothing was charged.
      expect((await call<Me>("GET", "me")).body.credits.balance).toBe(100);

      // Connected, Tex answers.
      const login = await call<{ loginId: string }>("POST", "agent/claude/login");
      await call("POST", `agent/claude/login/${login.body.loginId}/complete`, { code: "abcd-1234" });
      const next = await call<Message>("POST", "messages", { text: "Hi again", clientMessageId: uuid(2) });
      vi.advanceTimersByTime(8000);
      const after = (await call<Page<Message>>("GET", `messages?conversationId=${next.body.conversationId}`)).body.items;
      expect(after[0].text).not.toContain("Connect your own AI first");
} finally {
      vi.unstubAllEnvs();
    }
  });
});
