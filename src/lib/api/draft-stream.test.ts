import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AutomationDraft } from "./client";
import { qk } from "./hooks";
import { applyStreamEvent } from "./stream";

// `automation_draft.updated` on the live stream: the draft's card and page follow it, the list of
// open drafts is asked for again, and a saved one brings the automations along.

const draft: AutomationDraft = {
  id: "drf_1",
  status: "open",
  madeBy: "agent",
  changeOf: null,
  kind: "repeat",
  title: "Monday pull requests",
  instruction: "List my open pull requests",
  runAt: null,
  cron: "0 9 * * 1",
  timezone: "Asia/Kolkata",
  trigger: null,
  apps: [],
  copyTo: null,
  nextRunAt: null,
  replacedBy: null,
  automationId: null,
  createdAt: "2026-10-01T10:00:00Z",
  expiresAt: "2026-10-08T10:00:00Z",
  decidedAt: null,
};

describe("automation_draft.updated", () => {
  it("puts the draft where its card reads it, and marks the open list and, once saved, the automations stale", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.automationDrafts, { items: [draft] });
    qc.setQueryData(qk.automations, { items: [] });

    applyStreamEvent(qc, { type: "automation_draft.updated", data: draft });
    expect(qc.getQueryData(qk.automationDraft("drf_1"))).toEqual(draft);
    expect(qc.getQueryState(qk.automationDrafts)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.automations)?.isInvalidated).toBe(false);

    const saved = { ...draft, status: "saved" as const, automationId: "aut_9" };
    applyStreamEvent(qc, { type: "automation_draft.updated", data: saved });
    expect(qc.getQueryData(qk.automationDraft("drf_1"))).toEqual(saved);
    expect(qc.getQueryState(qk.automations)?.isInvalidated).toBe(true);
  });

  it("leaves other drafts' cards as they were", () => {
    const qc = new QueryClient();
    const other = { ...draft, id: "drf_2" };
    qc.setQueryData(qk.automationDraft("drf_2"), other);
    applyStreamEvent(qc, { type: "automation_draft.updated", data: { ...draft, status: "replaced", replacedBy: "drf_3" } });
    expect(qc.getQueryData(qk.automationDraft("drf_2"))).toEqual(other);
    expect(qc.getQueryState(qk.automationDraft("drf_2"))?.isInvalidated).toBe(false);
  });
});
