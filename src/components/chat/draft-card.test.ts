import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// A draft Tex proposed, in the chat: the line, and the card with the five steps drawn small, "Not
// saved yet", Save and Open in Automations; and what the card says once the draft is no longer open.

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ApiError, type AutomationDraft } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { DraftQuestion } from "./draft-card";

const LINE = 'Here\'s a draft of "Monday pull requests". Nothing runs until you save it.';
const base: AutomationDraft = {
  id: "drf_1",
  status: "open",
  madeBy: "agent",
  changeOf: null,
  kind: "repeat",
  title: "Monday pull requests",
  instruction: "List my open pull requests in acme/web",
  runAt: null,
  cron: "0 9 * * 1",
  timezone: "Asia/Kolkata",
  trigger: null,
  apps: ["github"],
  copyTo: null,
  nextRunAt: "2099-10-05T09:00:00",
  replacedBy: null,
  automationId: null,
  createdAt: "2099-10-01T10:00:00Z",
  expiresAt: "2099-10-08T10:00:00Z",
  decidedAt: null,
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
}
const decode = (html: string) => html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

function draw(draft: AutomationDraft | null, channel: "web" | "telegram" = "web") {
  const qc = client();
  // The person's own time zone, so a schedule in it reads "your time".
  qc.setQueryData(qk.me, { timezone: "Asia/Kolkata" });
  if (draft) qc.setQueryData(qk.automationDraft(draft.id), draft);
  else
    qc.getQueryCache()
      .build(qc, { queryKey: qk.automationDraft("drf_1") })
      .setState({ status: "error", error: new ApiError(404, "not_found", "Draft not found"), fetchStatus: "idle", data: undefined });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(DraftQuestion, { message: { text: LINE, channel }, draftId: "drf_1" })),
  );
}

describe("a draft in the chat", () => {
  it("is Tex's line, then the card: its steps drawn small, not saved yet, Save and Open in Automations", () => {
    const html = draw(base);
    const words = text(html);
    expect(words).toContain(LINE);
    expect(words.indexOf(LINE)).toBeLessThan(words.indexOf("Not saved yet"));
    expect(words).toContain("Monday pull requests");
    for (const step of ["Trigger", "Tex’s instruction", "Apps Tex may use", "Asks you first", "Results"]) expect(words).toContain(step);
    expect(words).toContain("Every Monday at 9:00 AM, your time");
    expect(words).toContain("GitHub");
    expect(words).toContain("Nothing runs until you save it");
    expect(words).toContain("Expires in");
    expect(html).toMatch(/>Save<\/button>/);
    expect(html).toContain('href="/automations/new?draft=drf_1"');
    expect(words).toContain("Open in Automations");
    // Plain HTML: no canvas in the chat.
    expect(html).not.toContain("react-flow");
  });

  it("shows the card alone in a Telegram conversation, where the message is the outline", () => {
    const words = text(draw(base, "telegram"));
    expect(words).not.toContain(LINE);
    expect(words).toContain("Not saved yet");
  });

  it("links a change to the automation's page, and says saving replaces it", () => {
    const html = draw({ ...base, changeOf: "aut_7" });
    expect(html).toContain('href="/automations/aut_7?draft=drf_1"');
    expect(text(html)).toContain("Saving replaces the automation it changes.");
    expect(text(html)).toContain("a change to an automation");
  });

  it("says Saved, with the way to the automation, once saved", () => {
    const html = draw({ ...base, status: "saved", automationId: "aut_9", decidedAt: "2099-10-01T10:05:00Z" });
    expect(text(html)).toContain("Saved · Open");
    expect(html).toContain('href="/automations/aut_9"');
    expect(html).not.toMatch(/>Save<\/button>/);
    // Folded: the name and what became of it, not the steps.
    expect(text(html)).not.toContain("Apps Tex may use");
  });

  it("says Tex made a newer version, with the way to it, once replaced", () => {
    const html = draw({ ...base, status: "replaced", replacedBy: "drf_2" });
    expect(text(html)).toContain("Tex made a newer version of this draft. Open it");
    expect(html).toContain('href="/automations/new?draft=drf_2"');
    expect(html).not.toMatch(/>Save<\/button>/);
  });

  it("says it expired, also when the API no longer has it, and that it was discarded", () => {
    expect(text(draw({ ...base, status: "expired" }))).toContain("This draft expired. Ask Tex again.");
    // Open, but past its 7 days: expired, as the API counts it.
    expect(text(draw({ ...base, expiresAt: "2000-01-01T00:00:00Z" }))).toContain("This draft expired. Ask Tex again.");
    expect(text(draw(null))).toContain("This draft expired. Ask Tex again.");
    expect(text(draw({ ...base, status: "discarded" }))).toContain("You discarded this draft.");
  });
});
