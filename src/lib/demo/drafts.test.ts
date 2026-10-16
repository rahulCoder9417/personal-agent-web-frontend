import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Approval, Automation, AutomationDraft, AutomationDraftSaved, Message, StreamEvent } from "@/lib/api/client";
import { draftLine, proposalOf } from "./handlers-drafts";
import { handleDemoRequest, resetDemoStore } from "./index";
import { getStore, subscribe } from "./store";

// Drafts in the demo backend, with the backend's rules (the contract's /v1/automation-drafts):
// Tex proposes one in the chat, it never runs, and only Save makes the automation.

const ORIGIN = "http://localhost:3100";
const NOW = new Date("2026-10-01T14:30:00");
const DAY = 86_400_000;

type ErrorBody = { error: { code: string; message: string; details?: Record<string, unknown> } };

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
const automations = async () => (await call<{ items: Automation[] }>("GET", "automations")).body.items;
const draft = async (id: string) => (await call<AutomationDraft>("GET", `automation-drafts/${id}`)).body;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the seeded drafts", () => {
  it("lists the open ones, newest first: Monday's pull requests in web chat, and the boss's emails on Telegram", async () => {
    const open = await call<{ items: AutomationDraft[] }>("GET", "automation-drafts");
    expect(open.status).toBe(200);
    expect(open.body.items.map((item) => [item.id, item.kind, item.status, item.copyTo])).toEqual([
      ["drf_monday", "repeat", "open", null],
      ["drf_boss", "event", "open", "telegram"],
    ]);
    expect(open.body.items[0]).toMatchObject({ cron: "0 9 * * 1", apps: ["github"], timezone: "Asia/Kolkata", madeBy: "agent", changeOf: null });
    expect(open.body.items[1].trigger).toEqual({ app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE", config: { from: "boss@northwind.studio" } });
    expect(Date.parse(open.body.items[0].expiresAt) - Date.parse(open.body.items[0].createdAt)).toBe(7 * DAY);
  });

  it("keeps the replaced one, which names the draft that replaced it", async () => {
    expect(await draft("drf_monday_10")).toMatchObject({ status: "replaced", replacedBy: "drf_monday", cron: "0 10 * * 1" });
    expect((await call<ErrorBody>("GET", "automation-drafts/drf_nope")).status).toBe(404);
  });

  it("carries each draft in its chat: a line and a card in web chat, the outline with its link on Telegram", () => {
    const messages = getStore().messages;
    expect(messages.find((message) => message.id === "msg_w6d")).toMatchObject({
      conversationId: "cnv_web_1",
      automationDraftId: "drf_monday",
      text: draftLine("Monday pull requests"),
    });
    const outline = messages.find((message) => message.id === "msg_tg_boss")!;
    expect(outline).toMatchObject({ conversationId: "cnv_tg_1", automationDraftId: "drf_boss" });
    expect(outline.text.split("\n")).toEqual([
      "⚡ New automation, not saved yet: Boss emails",
      "When: a new email arrives in Gmail (from: boss@northwind.studio)",
      "Tex: Tell me who wrote and what they want, in two lines.",
      "Apps: Gmail",
      "Asks first: before sending, deleting or paying",
      "Results: your Automations chat, and a copy here",
      "Review it: https://app.textcrew.in/automations/new?draft=drf_boss",
    ]);
  });
});

describe("saving a draft", () => {
  it("makes exactly one automation; a second save is 409 with its id; the plan's limit then refuses the next", async () => {
    const seen: StreamEvent[] = [];
    subscribe(getStore(), (event) => seen.push(event));
    expect(await automations()).toHaveLength(4);

    const saved = await call<AutomationDraftSaved>("POST", "automation-drafts/drf_monday/save");
    expect(saved.status).toBe(200);
    expect(saved.body.draft).toMatchObject({ id: "drf_monday", status: "saved", automationId: saved.body.automation.id });
    expect(saved.body.automation).toMatchObject({ kind: "repeat", title: "Monday pull requests", cron: "0 9 * * 1", apps: ["github"], enabled: true, copyTo: null });
    expect(await automations()).toHaveLength(5);
    expect(seen.map((event) => event.type)).toEqual(["automation.updated", "automation_draft.updated"]);

    const again = await call<ErrorBody>("POST", "automation-drafts/drf_monday/save");
    expect(again.status).toBe(409);
    expect(again.body.error.details).toEqual({ status: "saved", automationId: saved.body.automation.id });
    expect(await automations()).toHaveLength(5);

    // Pro allows five: the boss's emails can't be saved now.
    const full = await call<ErrorBody>("POST", "automation-drafts/drf_boss/save");
    expect(full.status).toBe(403);
    expect(full.body.error.code).toBe("plan_limit");
    expect((await draft("drf_boss")).status).toBe("open");
    // Open drafts are listed until saved.
    expect((await call<{ items: AutomationDraft[] }>("GET", "automation-drafts")).body.items.map((item) => item.id)).toEqual(["drf_boss"]);
  });

  it("saves it paused with enabled false", async () => {
    const saved = await call<AutomationDraftSaved>("POST", "automation-drafts/drf_boss/save", { enabled: false });
    expect(saved.status).toBe(200);
    expect(saved.body.automation).toMatchObject({ kind: "event", enabled: false, pausedReason: "user", copyTo: "telegram" });
    expect(saved.body.automation.trigger?.config).toEqual({ from: "boss@northwind.studio" });
  });

  it("can't save a replaced, discarded or expired draft", async () => {
    const replaced = await call<ErrorBody>("POST", "automation-drafts/drf_monday_10/save");
    expect(replaced.status).toBe(409);
    expect(replaced.body.error.details).toEqual({ status: "replaced", replacedBy: "drf_monday" });

    const discarded = await call<AutomationDraft>("POST", "automation-drafts/drf_boss/discard");
    expect(discarded.body).toMatchObject({ status: "discarded" });
    expect((await call<ErrorBody>("POST", "automation-drafts/drf_boss/save")).body.error.details).toEqual({ status: "discarded" });
    expect((await call<ErrorBody>("POST", "automation-drafts/drf_boss/discard")).status).toBe(409);

    vi.setSystemTime(NOW.getTime() + 8 * DAY);
    expect((await draft("drf_monday")).status).toBe("expired");
    expect((await call<ErrorBody>("POST", "automation-drafts/drf_monday/save")).body.error.details).toEqual({ status: "expired" });
    expect((await call<{ items: AutomationDraft[] }>("GET", "automation-drafts")).body.items).toEqual([]);
    expect(await automations()).toHaveLength(4);
  });

  it("refuses an app event whose app isn't connected, and keeps the draft open", async () => {
    const gmail = getStore().apps.find((app) => app.slug === "gmail")!;
    gmail.connections = [];
    const refused = await call<ErrorBody>("POST", "automation-drafts/drf_boss/save");
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toBe("Connect Gmail first");
    expect((await draft("drf_boss")).status).toBe("open");
  });

  it("replaces the automation a change is for, even with the plan full", async () => {
    await call("POST", "automation-drafts/drf_monday/save");
    const change: AutomationDraft = { ...(await draft("drf_boss")), id: "drf_change", changeOf: "aut_invoice", status: "open", title: "Chase the Acme invoice, twice" };
    getStore().drafts.unshift(change);
    const saved = await call<AutomationDraftSaved>("POST", "automation-drafts/drf_change/save");
    expect(saved.status).toBe(200);
    const ids = (await automations()).map((automation) => automation.id);
    expect(ids).not.toContain("aut_invoice");
    expect(ids).toContain(saved.body.automation.id);
    expect(ids).toHaveLength(5);
  });
});

describe("Tex proposes one in the chat", () => {
  it("reads what is to be done later: a schedule or an app event, and nothing else", () => {
    expect(proposalOf("Every Monday at 9, send me my open pull requests")).toMatchObject({ kind: "repeat", cron: "0 9 * * 1", apps: ["github"] });
    expect(proposalOf("Every weekday at 5pm, summarise my inbox")).toMatchObject({ cron: "0 17 * * 1-5", apps: ["gmail"] });
    expect(proposalOf("Each morning, tell me my meetings")).toMatchObject({ cron: "0 9 * * *", apps: ["googlecalendar"] });
    expect(proposalOf("When my boss emails me, tell me")).toMatchObject({ kind: "event", trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE" } });
    expect(proposalOf("When a pull request opens, review it")).toMatchObject({ kind: "event", trigger: { app: "github" } });
    expect(proposalOf("Send Maya the notes")).toBeNull();
    expect(proposalOf("When is my next meeting?")).toBeNull();
  });

  it("answers a request with a draft and its card, not with an approval or a crew job", async () => {
    const seen: StreamEvent[] = [];
    subscribe(getStore(), (event) => seen.push(event));
    const sent = await call<Message>("POST", "messages", { text: "Every Friday at 4pm, send me the open pull requests in acme/web", clientMessageId: uuid(1) });
    expect(sent.status).toBe(202);
    vi.advanceTimersByTime(3000);

    const proposed = seen.filter((event) => event.type === "automation_draft.updated").map((event) => event.data as AutomationDraft);
    expect(proposed).toHaveLength(1);
    expect(proposed[0]).toMatchObject({ status: "open", kind: "repeat", cron: "0 16 * * 5", title: "Send me the open pull requests in acme/web", copyTo: null });
    const reply = getStore().messages.find((message) => message.automationDraftId === proposed[0].id)!;
    expect(reply).toMatchObject({ direction: "out", conversationId: sent.body.conversationId, text: draftLine("Send me the open pull requests in acme/web") });
    // Nothing runs and nothing else happened: no approval, no new automation, no specialist.
    expect(seen.some((event) => event.type === "approval.created")).toBe(false);
    expect(seen.some((event) => event.type === "agent.progress")).toBe(false);
    expect(await automations()).toHaveLength(4);
    expect((getStore().approvals as Approval[]).filter((approval) => approval.status === "pending")).toHaveLength(3);
  });
});
