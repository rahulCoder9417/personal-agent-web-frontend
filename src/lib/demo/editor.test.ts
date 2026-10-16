import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent, Automation, AutomationCheck, AutomationDraft, AutomationParts, Message } from "@/lib/api/client";
import { TEST_RUN_ANSWER_MS, TEST_RUNS_PER_HOUR } from "./handlers-editor";
import { handleDemoRequest, resetDemoStore } from "./index";
import { getStore } from "./store";

// Building and changing automations by hand in the demo backend, with the backend's rules: every
// problem on its box, one automation per clientRequestId, a change keeps the id, a test run is
// marked and limited.

const ORIGIN = "http://localhost:3100";
const NOW = new Date("2026-10-16T10:00:00Z");

type ErrorBody = { error: { code: string; message: string; details?: Record<string, unknown> } };

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const request = new Request(`${ORIGIN}/api/v1/${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  const response = await handleDemoRequest(request, path.split("?")[0].split("/"));
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const weekly: AutomationParts = {
  title: "Monday PRs",
  instruction: "List my open pull requests.",
  cron: "0 9 * * 1",
  timezone: "Asia/Kolkata",
  apps: ["github"],
  askFirst: "risky",
  copyTo: null,
};
const automations = async () => (await call<{ items: Automation[] }>("GET", "automations")).body.items;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetDemoStore(NOW);
});
afterEach(() => vi.useRealTimers());

describe("check without saving", () => {
  it("good parts: no problems, and the next three runs", async () => {
    const check = await call<AutomationCheck>("POST", "automations/check", weekly);
    expect(check.status).toBe(200);
    expect(check.body).toEqual({
      ok: true,
      problems: [],
      kind: "repeat",
      nextRuns: ["2026-10-19T03:30:00.000Z", "2026-10-26T03:30:00.000Z", "2026-11-02T03:30:00.000Z"],
    });
  });

  it("every problem at once, each on its box", async () => {
    const check = await call<AutomationCheck>("POST", "automations/check", {
      title: "",
      instruction: "",
      cron: "*/5 * * * *",
      timezone: "UTC",
      apps: ["hubspot"],
      copyTo: "whatsapp",
    });
    expect(check.body.ok).toBe(false);
    expect(check.body.problems.map((problem) => problem.step)).toEqual(["trigger", "instruction", "instruction", "apps", "results"]);
    expect(check.body.problems[0].message).toMatch(/at most every 15 minutes/);
  });

  it("an app event: the event must be the app's, with its required settings", async () => {
    const event = (config: Record<string, unknown>, name = "GITHUB_PULL_REQUEST_EVENT") =>
      call<AutomationCheck>("POST", "automations/check", { ...weekly, cron: null, trigger: { app: "github", event: name, config } });
    expect((await event({})).body.problems.map((problem) => problem.message)).toEqual(["Fill in “Owner”.", "Fill in “Repository”."]);
    expect((await event({ owner: "acme", repo: "web" })).body.ok).toBe(true);
    expect((await event({}, "GITHUB_NOPE")).body.problems[0].message).toMatch(/has no event/);
    const events = await call<{ items: AppEvent[] }>("GET", "apps/gmail/events");
    expect(events.body.items[0]).toMatchObject({ slug: "GMAIL_NEW_GMAIL_MESSAGE", settings: expect.arrayContaining([expect.objectContaining({ name: "labelIds" })]) });
    expect((await call("GET", "apps/nope/events")).status).toBe(404);
  });

  it("a passed moment is `past`; a change doesn't count itself against the plan", async () => {
    const past = await call<AutomationCheck>("POST", "automations/check", { ...weekly, cron: null, runAt: "2026-10-01T09:00:00Z" });
    expect(past.body.problems).toEqual([{ step: "trigger", code: "past", message: "That moment has passed. Pick a later one." }]);
    await call("POST", "automations", { ...weekly, clientRequestId: uuid(1) });
    const full = await call<AutomationCheck>("POST", "automations/check", weekly);
    expect(full.body.problems).toEqual([expect.objectContaining({ step: null, code: "plan_limit" })]);
    const change = await call<AutomationCheck>("POST", "automations/check", { ...weekly, automationId: "aut_meetings" });
    expect(change.body.ok).toBe(true);
  });
});

describe("save", () => {
  it("one clientRequestId makes one automation; Save paused is off", async () => {
    const first = await call<Automation>("POST", "automations", { ...weekly, enabled: false, clientRequestId: uuid(1) });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ kind: "repeat", cron: "0 9 * * 1", enabled: false, pausedReason: "user", apps: ["github"], askFirst: "risky" });
    const again = await call<Automation>("POST", "automations", { ...weekly, clientRequestId: uuid(1) });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect((await automations()).filter((automation) => automation.title === "Monday PRs")).toHaveLength(1);
  });

  it("a refused save carries its problems; a full plan is 403", async () => {
    const bad = await call<ErrorBody>("POST", "automations", { ...weekly, title: "", clientRequestId: uuid(2) });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details?.problems).toEqual([expect.objectContaining({ step: "instruction" })]);
    await call("POST", "automations", { ...weekly, clientRequestId: uuid(3) });
    const full = await call<ErrorBody>("POST", "automations", { ...weekly, clientRequestId: uuid(4) });
    expect(full.status).toBe(403);
    expect(full.body.error.code).toBe("plan_limit");
  });

  it("a change keeps the id; a draft saved with it is marked saved", async () => {
    const changeDraft: AutomationDraft = {
      ...(await call<AutomationDraft>("GET", "automation-drafts/drf_monday")).body,
      id: "drf_edit",
      changeOf: "aut_meetings",
      status: "open",
    };
    getStore().drafts.unshift(changeDraft);
    const changed = await call<Automation>("PUT", "automations/aut_meetings", { ...weekly, title: "Meetings, at 7:30", cron: "30 7 * * 1-5", draftId: "drf_edit" });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ id: "aut_meetings", title: "Meetings, at 7:30", cron: "30 7 * * 1-5", enabled: true });
    expect((await call<AutomationDraft>("GET", "automation-drafts/drf_edit")).body).toMatchObject({ status: "saved", automationId: "aut_meetings" });
    expect((await call("PUT", "automations/aut_pr_website", weekly)).status).toBe(409);
    expect((await call("PUT", "automations/aut_nope", weekly)).status).toBe(404);
  });
});

describe("run once now", () => {
  it("marked as a test in the Automations chat, then Tex's answer; one per key; 10 an hour", async () => {
    const run = await call<{ eventId: string }>("POST", "automations/aut_meetings/run", { clientRequestId: uuid(9) });
    expect(run.status).toBe(202);
    const said = () => getStore().messages.filter((message: Message) => message.text.includes("Test run")).map((message) => message.text);
    expect(said()).toHaveLength(1);
    expect(said()[0]).toMatch(/^🧪 Test run of “Today’s meetings”/);
    await vi.advanceTimersByTimeAsync(TEST_RUN_ANSWER_MS);
    expect(said()).toHaveLength(2);
    const again = await call<{ eventId: string }>("POST", "automations/aut_meetings/run", { clientRequestId: uuid(9) });
    expect(again.body.eventId).toBe(run.body.eventId);
    for (let n = 1; n < TEST_RUNS_PER_HOUR; n++) expect((await call("POST", "automations/aut_meetings/run", { clientRequestId: uuid(100 + n) })).status).toBe(202);
    expect((await call("POST", "automations/aut_meetings/run", { clientRequestId: uuid(200) })).status).toBe(429);
    expect((await call("POST", "automations/aut_pr_website/run", { clientRequestId: uuid(300) })).status).toBe(409);
  });
});

describe("the person's own draft", () => {
  it("keeps the canvas's parts, replaces the draft it started from, and posts nothing", async () => {
    const before = getStore().messages.length;
    const made = await call<AutomationDraft>("POST", "automation-drafts", { ...weekly, replacesDraftId: "drf_monday" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ madeBy: "user", status: "open", kind: "repeat", changeOf: null });
    expect((await call<AutomationDraft>("GET", "automation-drafts/drf_monday")).body).toMatchObject({ status: "replaced", replacedBy: made.body.id });
    expect(getStore().messages.length).toBe(before);
    expect((await call("POST", "automation-drafts", { ...weekly, cron: null })).status).toBe(400);
  });
});
