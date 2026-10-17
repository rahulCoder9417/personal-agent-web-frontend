// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Don't ask again" (skip rules), clicked through in a browser-like page against the demo backend,
// which answers as the real one would: the card's quiet link and its choice, the Approvals page's
// Auto-approved tab, and the Skip rules list with Remove.

// The page's requests, handed to the demo backend, and the order they went in. `openapi-fetch`
// keeps the `fetch` it finds when the client is made, so this is in place before anything is imported.
const net = vi.hoisted(() => {
  const state = { handle: null as null | ((request: Request) => Promise<Response>), calls: [] as string[] };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    if (request.method !== "GET") state.calls.push(`${request.method} ${new URL(request.url).pathname.replace(/^\/api/, "")}`);
    return state.handle!(request);
  };
  return state;
});

const toasts = vi.hoisted(() => ({ done: [] as { title: string; body?: string }[], failed: [] as { title: string; detail: unknown }[] }));
vi.mock("@/components/toast", () => ({
  toast: (message: { title: string; body?: string }) => toasts.done.push(message),
  toastError: (title: string, detail: unknown) => toasts.failed.push({ title, detail }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
const address = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/approvals",
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(address.query),
}));

import ApprovalsPage from "@/app/(app)/approvals/page";
import { resolveUpstream } from "@/lib/api/proxy-target";
import { ApprovalQuestion } from "@/components/chat/approval-card";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { getStore } from "@/lib/demo/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  // Seeded now: the cards wait 24 hours from when they were asked, by the clock.
  resetDemoStore(new Date());
  // Through the same gate as the app's proxy route: a path it doesn't let through is a 404 here too.
  net.handle = async (request) => {
    const segments = new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/");
    if (!resolveUpstream("http://backend", segments)) return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
    return handleDemoRequest(request, segments);
  };
  net.calls = [];
  toasts.done = [];
  toasts.failed = [];
  address.query = "";
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** Lets the requests and the renders they cause finish. */
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function draw(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  act(() => root.render(createElement(QueryClientProvider, { client }, element)));
  await settle();
}
const card = (approvalId: string) => draw(createElement(ApprovalQuestion, { text: "I'd like to send this email to Maya. Approve or Deny below.", approvalId }));

const text = (element: Element | null | undefined = host) => (element?.textContent ?? "").replace(/\s+/g, " ");
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.replace(/\s+/g, " ").trim() === name);
const radios = () => [...host.querySelectorAll('[role="radio"]')] as HTMLButtonElement[];
const radio = (starts: string) => radios().find((r) => r.textContent?.startsWith(starts));

async function press(target: HTMLElement | undefined, label = "button") {
  if (!target) throw new Error(`no ${label}`);
  await act(async () => target.click());
  await settle(3);
}

describe("the card's “Don’t ask again for this…”", () => {
  it("is a quiet link that opens a small choice: only to the card’s recipients by default, or anyone with a warning", async () => {
    await card("ap_email");
    const link = button("Don’t ask again for this…");
    expect(link).toBeDefined();
    // Quiet: small muted text under the buttons, not a third button.
    expect(link!.className).toContain("text-muted");
    expect(radios()).toEqual([]);

    await press(link, "link");
    expect(button("Don’t ask again for this…")).toBeUndefined();
    expect(text()).toContain("Don’t ask again: send email");
    expect(radios().map((r) => [r.textContent?.split("still asks")[0], r.getAttribute("aria-checked")])).toEqual([
      ["Only to maya@acme.comAnyone else ", "true"],
      ["AnyoneWhoever it goes to.", "false"],
    ]);
    expect(text()).not.toContain("without asking you");
    expect(text()).toContain("Deleting, paying and merging always ask.");

    await press(radio("Anyone"), "Anyone");
    expect(radio("Anyone")!.getAttribute("aria-checked")).toBe("true");
    expect(text()).toContain("Tex could send email to anyone without asking you.");

    // Cancel folds it away again and changes nothing.
    await press(button("Cancel"), "Cancel");
    expect(button("Don’t ask again for this…")).toBeDefined();
    expect(net.calls).toEqual([]);
  });

  it("saves the rule, then approves this card; the card’s recipient joins the list the user has for that action", async () => {
    await card("ap_email");
    await press(button("Don’t ask again for this…"), "link");
    await press(button("Approve and don’t ask again"), "confirm");

    expect(net.calls).toEqual(["POST /v1/skip-rules", "POST /v1/approvals/ap_email/decision"]);
    // The seeded "Send email only to aarav@…" rule: Maya is added to it, not a second rule.
    expect(getStore().skipRules).toEqual([
      expect.objectContaining({ id: "skp_me", action: "GMAIL_SEND_EMAIL", scope: "listed", recipients: ["aarav@northwind.studio", "maya@acme.com"] }),
    ]);
    expect(getStore().approvals.find((a) => a.id === "ap_email")?.status).toBe("approved");
    expect(toasts.done.at(-1)).toEqual({
      title: "Approved. Tex won’t ask again for this",
      body: "Send email only to aarav@northwind.studio, maya@acme.com. It’s under Skip rules on the Approvals page, where you can remove it.",
      action: { label: "Skip rules", href: "/approvals?view=rules" },
    });
    // The card is answered: one tinted line, no link.
    expect(text()).toContain("You approved this");
    expect(button("Don’t ask again for this…")).toBeUndefined();
  });

  it("“Anyone” saves a rule for anyone", async () => {
    await card("ap_email");
    await press(button("Don’t ask again for this…"), "link");
    await press(radio("Anyone"), "Anyone");
    await press(button("Approve and don’t ask again"), "confirm");
    expect(getStore().skipRules[0]).toMatchObject({ action: "GMAIL_SEND_EMAIL", scope: "anyone", recipients: [] });
  });

  it("is not on a card that always asks (deleting)", async () => {
    await card("ap_drafts");
    expect(text()).toContain("Delete 12 old drafts");
    expect(button("Approve")).toBeDefined();
    expect(button("Don’t ask again for this…")).toBeUndefined();
  });

  it("when the rule can’t be saved, nothing is approved and it says why", async () => {
    // As if the server refused: the offer says deleting may be skipped, the server knows better.
    getStore().approvals.find((a) => a.id === "ap_drafts")!.skip = { actionName: "Delete draft", recipients: [], target: "people", scopes: ["anyone"] };
    await card("ap_drafts");
    getStore().approvals.find((a) => a.id === "ap_drafts")!.skip = null;
    await press(button("Don’t ask again for this…"), "link");
    await press(button("Approve and don’t ask again"), "confirm");
    expect(net.calls).toEqual(["POST /v1/skip-rules"]);
    expect(toasts.failed.map((t) => t.title)).toEqual(["Couldn’t save the rule"]);
    expect(getStore().approvals.find((a) => a.id === "ap_drafts")?.status).toBe("pending");
  });
});

describe("the Approvals page", () => {
  it("has an Auto-approved tab after the others: what ran, when, by which rule, and how it went", async () => {
    await draw(createElement(ApprovalsPage));
    const pills = [...host.querySelectorAll('[role="group"] button')].map((b) => b.textContent);
    expect(pills.map((p) => p?.replace(/\d+$/, ""))).toEqual(["Pending", "Approved", "Denied", "Expired", "Replaced", "Auto-approved", "Skip rules"]);

    await press(button("Auto-approved1"), "Auto-approved tab");
    expect(text()).toContain("Email me my inbox digest");
    const detail = host.querySelector('[aria-label="Approval details"]');
    expect(text(detail)).toContain("Auto-approved");
    expect(text(detail)).toContain("Ran without asking, by your skip rule");
    expect(text(detail)).toContain("Your rule: Only to aarav@northwind.studio");
    expect(text(detail)).toContain("Done · 1 credit");
    expect(detail!.querySelector('[aria-label="What the app answered"]')?.textContent).toContain('"labelIds":["SENT"]');
    expect(text(detail)).toMatch(/Ran Today, .*, without asking/);
    // Nothing to answer.
    expect(button("Approve")).toBeUndefined();

    // The rule's link opens the Skip rules list.
    await press(button("See your skip rules"), "rules link");
    expect(host.querySelector('[aria-label="Skip rules"] ul')).not.toBeNull();
  });

  it("lists the skip rules with Remove; removed, the list says what a rule is and where one is made", async () => {
    address.query = "view=rules";
    await draw(createElement(ApprovalsPage));
    const rules = host.querySelector('ul[aria-label="Skip rules"]');
    expect(rules?.querySelectorAll("li")).toHaveLength(1);
    expect(text(rules)).toContain("Send email · Gmail");
    expect(text(rules)).toContain("Only to aarav@northwind.studio");
    expect(text(rules)).toMatch(/Made \d+ [A-Z][a-z]{2}/);
    expect(text()).toContain("Deleting, paying, merging and Tex’s own commands always ask.");

    const remove = rules!.querySelector('button[aria-label="Remove the rule: Send email only to aarav@northwind.studio"]') as HTMLButtonElement;
    await press(remove, "Remove");
    // It asks once more first.
    expect(getStore().skipRules).toHaveLength(1);
    await press(button("Remove"), "confirm Remove");
    expect(net.calls).toEqual(["DELETE /v1/skip-rules/skp_me"]);
    expect(getStore().skipRules).toEqual([]);
    expect(toasts.done.at(-1)?.title).toBe("Removed. Tex asks again for this");
    expect(text()).toContain("No skip rules");
    expect(text()).not.toContain("Tex doesn’t ask before these.");
    expect(text()).toContain("tap “Don’t ask again for this…” on its card");
  });
});
