// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `/automations/new`: ask Tex in words (the page stays while Tex checks, then opens Tex's draft on
// the canvas or says why it can't be an automation), or pick how it works and build it on the
// canvas; every template below. `?shape=` and `?template=` open the canvas filled in.

// Requests go to the demo backend, the way the app's own proxy would in demo mode. `openapi-fetch`
// keeps the `fetch` it finds when the client is made, so this comes first.
const net = vi.hoisted(() => {
  const state = {
    handle: null as null | ((request: Request) => Promise<Response>),
    /** Bodies of the messages sent (POST /v1/messages). */
    sent: [] as Record<string, unknown>[],
    /** Answer POST /v1/messages with this instead of the demo backend. */
    sendAnswer: null as null | ((body: Record<string, unknown>) => Response),
  };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input instanceof Request ? input.url : input), "http://localhost:3000"), init ?? (input instanceof Request ? input : undefined));
    if (request.method === "POST" && new URL(request.url).pathname === "/api/v1/messages") {
      const body = (await request.clone().json()) as Record<string, unknown>;
      state.sent.push(body);
      if (state.sendAnswer) return state.sendAnswer(body);
    }
    return state.handle!(request);
  };
  return state;
});
const nav = vi.hoisted(() => ({ pushed: [] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations/new",
  useRouter: () => ({ push: (href: string) => nav.pushed.push(href), replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import nextConfig from "../../../next.config";
import { AskNote, NewAutomation, NewBuilder, SHAPE_GRID } from "@/components/automations/new-automation";
import { allTemplates, TEMPLATE_CARD, TEMPLATE_GRID } from "@/components/automations/templates";
import { GUTTER } from "@/components/page";
import type { Message } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { applyStreamEvent } from "@/lib/api/stream";
import { OLD_AUTOMATION_ADDRESSES, PR_REVIEW_NEW_PATH } from "@/lib/automation-address";
import { SHAPES } from "@/lib/automation-lanes";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { ASK_FAILED_TEXT, CHECKING_TEXT, DRAFT_ASK_SLOW_MS, draftAskView, plainNote, type DraftAskView } from "@/lib/draft-ask";
import { PLACES } from "@/lib/help";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { CANT_DRAFT_REPLY } from "@/lib/demo/handlers-chat";
import { subscribe, type DemoState } from "@/lib/demo/store";
import { appRoutes, pathOf } from "@/test/app-routes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-10-01T14:30:00");

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}
const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
const draw = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));

let lastClient: QueryClient | null = null;

async function seeded() {
  const qc = client();
  lastClient = qc;
  qc.setQueryData(qk.me, await demo("me"));
  qc.setQueryData(qk.apps, await demo("apps"));
  qc.setQueryData(qk.channels, await demo("channels"));
  return qc;
}

let demoState: DemoState;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  demoState = resetDemoStore(NOW);
  net.handle = (request) => handleDemoRequest(request, new URL(request.url).pathname.replace(/^\/api\/v1\//, "").split("/"));
  net.sent = [];
  net.sendAnswer = null;
  nav.pushed = [];
});
afterEach(() => vi.useRealTimers());

describe("the new-automation page", () => {
  it("is a page of the app, with the way back as a breadcrumb", async () => {
    expect(appRoutes().has("/automations/new")).toBe(true);
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(text(html)).toContain("Automations New automation");
    expect(hrefs(html)).toContain("/automations");
    expect(text(html)).not.toMatch(/[←→]/);
  });

  it("asks Tex in words: Tex's face, the box, ideas that fill it, and Draft it", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    const words = text(html);
    // Tex's own face (its glyph), not a letter.
    expect(html).toContain('viewBox="66 16 168 168"');
    expect(words).toContain("Ask Tex to set it up");
    expect(words).toContain("Tex drafts it on the canvas. Nothing runs until you save.");
    expect(html).toContain("<textarea");
    for (const idea of ["Sum up my email every morning", "Review my pull requests", "Remind me every Friday"]) expect(words).toContain(idea);
    // Nothing typed yet: Draft it waits.
    expect(html).toMatch(/disabled=""[^>]*>Draft it</);
  });

  it("offers the four shapes, each opening the canvas with that shape", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    const words = text(html);
    expect(words).toContain("Or pick how it works");
    for (const shape of SHAPES) {
      expect(words).toContain(shape.title);
      expect(hrefs(html)).toContain(`/automations/new?shape=${shape.id}`);
    }
    expect(words).toContain("No reading");
    expect(words).toContain("No writing");
  });

  it("has every template at its foot, pull-request review among them", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain('id="templates"');
    expect(hrefs(html)).toEqual(expect.arrayContaining([PR_REVIEW_NEW_PATH, "/automations/new?template=daily-briefing", "/automations/new?template=urgent-boss-mail"]));
  });
});

describe("the new-automation page's layout", () => {
  it("takes the whole width of the sheet, with the gutters every other screen has", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    const body = html.match(/class="type-scale scroll-pane[^"]*"><div class="([^"]*)"/)?.[1] ?? "";
    expect(body).toContain(GUTTER);
    expect(body).not.toMatch(/max-w-|mx-auto/);
  });

  it("draws every template in the Automations list's own card, in as many columns as fit, none narrower than 280px", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain(`<ul class="grid gap-4 ${TEMPLATE_GRID.all}">`);
    expect(html.split(`<li class="${TEMPLATE_CARD}"`).length - 1).toBe(allTemplates().length);
  });

  it("keeps each shape's picture inside its card on a phone: the lines give way first, then the words wrap", async () => {
    const html = draw(await seeded(), createElement(NewAutomation));
    expect(html).toContain(`<ul class="grid gap-4 ${SHAPE_GRID}">`);
    expect(html).toContain("h-0.5 min-w-0 flex-1");
    const pill = html.match(/<span class="([^"]*)">No reading</)?.[1] ?? "";
    expect(pill).toContain("border-dashed");
    expect(pill).not.toContain("whitespace-nowrap");
  });
});

describe("a new automation on the canvas", () => {
  it("from a shape: its steps to fill in, nothing saved, and no amber before a box is worked on", async () => {
    const html = draw(await seeded(), createElement(NewBuilder, { shapeId: "read-act" }));
    const words = text(html);
    expect(words).toContain("Automations New automation");
    expect(words).toContain("Not saved");
    expect(words).toContain("3 of 6 steps");
    expect(words).toContain("Save paused");
    // The trigger opens first, its kinds one under another.
    for (const mode of ["Once", "On a schedule", "On an app event"]) expect(words).toContain(mode);
    expect(html).not.toContain('role="alert"');
  });

  it("Just Tex has no steps: one instruction", async () => {
    expect(text(draw(await seeded(), createElement(NewBuilder, { shapeId: "just-tex" })))).toContain("1 of 6 steps");
  });

  it("from a template: filled in", async () => {
    const words = text(draw(await seeded(), createElement(NewBuilder, { templateId: "morning-email" })));
    expect(words).toContain("Morning email summary");
    expect(words).toContain("2 of 6 steps");
    expect(words).toContain("Every day at 9:00 AM");
  });
});

describe("the address pull-request review had", () => {
  it("leads to the list, and Help leads to the template", async () => {
    expect(OLD_AUTOMATION_ADDRESSES).toEqual([{ source: "/automations/reviews", destination: "/automations", permanent: false }]);
    expect(await nextConfig.redirects?.()).toEqual(expect.arrayContaining([{ source: "/automations/reviews", destination: "/automations", permanent: false }]));
    expect(PLACES.prReview.href).toBe(PR_REVIEW_NEW_PATH);
    expect(appRoutes()).toContain(pathOf(PR_REVIEW_NEW_PATH));
  });
});

// ---------------------------------------------------------------- asking Tex, on the page

const at = "2026-10-01T14:30:00.000Z";
const mine = (over: Partial<Message> = {}): Message => ({
  id: "msg_ask",
  conversationId: "cnv_auto",
  channel: "web",
  direction: "in",
  text: "Every morning at 9, sum up my unread email.",
  status: "queued",
  approvalId: null,
  automationDraftId: null,
  turnId: "evt_ask",
  createdAt: at,
  ...over,
});
const tex = (over: Partial<Message> = {}): Message => ({ ...mine(), id: "msg_tex", direction: "out", status: "sent", text: "", ...over });
const view = (over: Partial<Parameters<typeof draftAskView>[0]> = {}) => draftAskView({ sending: false, sendError: null, sent: mine(), thread: undefined, slow: false, ...over });

describe("what the page shows while Tex looks at the request", () => {
  it("nothing before a request; checking while it is sent and until Tex has a verdict", () => {
    expect(draftAskView({ sending: false, sendError: null, sent: null, thread: undefined, slow: false })).toEqual({ kind: "idle" });
    expect(view({ sending: true, sent: null })).toEqual({ kind: "checking" });
    expect(view()).toEqual({ kind: "checking" });
    expect(view({ thread: [mine({ status: "processing" })] })).toEqual({ kind: "checking" });
  });

  it("Tex's draft, in the request's own turn: the canvas opens on it", () => {
    const thread = [tex({ text: 'Here\'s a draft of "Morning email". Nothing runs until you save it.', automationDraftId: "drf_1" }), mine({ status: "processing" })];
    expect(view({ thread })).toEqual({ kind: "draft", draftId: "drf_1" });
    // Even once the turn has ended, and whatever Tex said after it.
    expect(view({ thread: [tex({ id: "msg_after", text: "Done." }), ...thread.map((m) => (m.direction === "in" ? { ...m, status: "delivered" as const } : m))] })).toEqual({ kind: "draft", draftId: "drf_1" });
  });

  it("a plain answer is Tex's why-not, as plain words", () => {
    const thread = [tex({ text: 'That is a **one-off** question.\nTry: "Every morning at 8, tell me the weather."' }), mine({ status: "delivered" })];
    expect(view({ thread })).toEqual({ kind: "cant", text: 'That is a one-off question.\nTry: "Every morning at 8, tell me the weather."' });
    expect(plainNote("Use `GMAIL` and __this__")).toBe("Use GMAIL and this");
  });

  it("another turn's message in the same chat (an automation's run) is not the answer", () => {
    const thread = [tex({ id: "msg_run", text: "ran: Morning PRs", turnId: "evt_run" }), tex({ id: "msg_old", text: "old", turnId: "evt_old", automationDraftId: "drf_old" }), mine()];
    expect(view({ thread })).toEqual({ kind: "checking" });
  });

  it("a backend without turn ids: Tex's first message after the request", () => {
    const sent = mine({ turnId: undefined });
    const thread = [tex({ text: "Can't do that one.", turnId: undefined }), { ...sent, status: "delivered" as const }, tex({ id: "msg_before", text: "earlier", turnId: undefined })];
    expect(view({ sent, thread })).toEqual({ kind: "cant", text: "Can't do that one." });
  });

  it("a failed turn says so, also after the apology; a refused send says why", () => {
    const apology = tex({ text: "Sorry, something went wrong on our side and I couldn't finish that." });
    expect(view({ thread: [apology, mine({ status: "failed" })] })).toEqual({ kind: "failed", text: ASK_FAILED_TEXT, outOfCredits: false });
    expect(view({ sent: null, sendError: new Error("You seem to be offline. Check your connection and try again.") })).toEqual({
      kind: "failed",
      text: "You seem to be offline. Check your connection and try again.",
      outOfCredits: false,
    });
  });

  it("no verdict after 90 seconds: where to look; Tex asking for an OK: the same, at once", () => {
    expect(DRAFT_ASK_SLOW_MS).toBe(90_000);
    expect(view({ thread: [mine({ status: "processing" })], slow: true })).toEqual({ kind: "elsewhere", why: "slow", href: AUTOMATIONS_CHAT_HREF });
    expect(view({ thread: [tex({ text: "I'd like to send an email.", approvalId: "ap_1" }), mine({ status: "processing" })] })).toEqual({
      kind: "elsewhere",
      why: "asked",
      href: AUTOMATIONS_CHAT_HREF,
    });
    // A verdict that comes later still shows.
    expect(view({ thread: [tex({ automationDraftId: "drf_2" }), mine()], slow: true })).toEqual({ kind: "draft", draftId: "drf_2" });
  });
});

describe("the note under the box", () => {
  const note = (v: DraftAskView) => renderToStaticMarkup(createElement(AskNote, { view: v, onTryAgain: () => {} }));

  it("says nothing while Tex checks (the box says it), or before anything is asked", () => {
    expect(note({ kind: "checking" })).toBe("");
    expect(note({ kind: "idle" })).toBe("");
    expect(note({ kind: "draft", draftId: "drf_1" })).toBe("");
  });

  it("can't: Tex's words in a soft fill, and Try another prompt", () => {
    const html = note({ kind: "cant", text: CANT_DRAFT_REPLY });
    // A soft fill, no border.
    const box = html.match(/^<div role="status" class="([^"]*)"/)?.[1] ?? "";
    expect(box).toContain("bg-surface-2");
    expect(box).not.toMatch(/border|shadow/);
    expect(html).toContain("whitespace-pre-line");
    expect(text(html)).toContain("so it can’t be an automation.");
    expect(text(html)).toContain("Try: “Every weekday at 9, sum up my unread email.”");
    expect(text(html)).toContain("Try another prompt");
    // On a phone the button goes under the words.
    expect(html).toContain("flex-col");
  });

  it("an error is a plain note; out of credits links to credits", () => {
    expect(text(note({ kind: "failed", text: ASK_FAILED_TEXT, outOfCredits: false }))).toContain(ASK_FAILED_TEXT);
    expect(note({ kind: "failed", text: ASK_FAILED_TEXT, outOfCredits: false })).toContain('role="alert"');
    expect(hrefs(note({ kind: "failed", text: "You’re out of credits", outOfCredits: true }))).toEqual(["/settings/credits"]);
  });

  it("slow: Tex is taking longer, with the way to the chat", () => {
    const html = note({ kind: "elsewhere", why: "slow", href: AUTOMATIONS_CHAT_HREF });
    expect(text(html)).toContain("Tex is taking longer — see it in Chat");
    expect(hrefs(html)).toEqual([AUTOMATIONS_CHAT_HREF]);
    expect(text(note({ kind: "elsewhere", why: "asked", href: AUTOMATIONS_CHAT_HREF }))).toContain("Tex needs your OK first — see it in Chat");
  });
});

describe("asking Tex on the page, against the demo backend", () => {
  let root: Root | null = null;
  let host: HTMLElement;
  let stop = () => {};

  afterEach(() => {
    stop();
    if (root) act(() => root!.unmount());
    root = null;
    host?.remove();
  });

  /** Waits in small steps (the demo's Tex answers after 1.5 seconds) until `done` holds. */
  async function until(done: () => boolean, ms = 5000) {
    const end = performance.now() + ms;
    while (!done()) {
      if (performance.now() > end) throw new Error(`timed out; the page says: ${host.textContent}`);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
  }

  async function mount() {
    const qc = await seeded();
    // The live stream, as the app shell keeps it open: the demo's events go into the cache.
    stop = subscribe(demoState, (event) => applyStreamEvent(qc, event));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(QueryClientProvider, { client: qc }, createElement(NewAutomation))));
    await until(() => Boolean(host.querySelector("textarea")));
  }

  const box = () => host.querySelector("textarea")!;
  const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  const words = () => (host.textContent ?? "").replace(/\s+/g, " ");

  async function type(value: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(box(), value);
      box().dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function press(name: string) {
    const target = button(name);
    if (!target) throw new Error(`no button "${name}"`);
    await act(async () => target.click());
  }

  it("an empty box: Draft it does nothing; an idea fills the box", async () => {
    await mount();
    expect(button("Draft it")!.disabled).toBe(true);
    await press("Draft it");
    expect(net.sent).toEqual([]);
    await press("Remind me every Friday");
    expect(box().value).toBe("Remind me every Friday at 5pm to send the weekly report.");
    expect(button("Draft it")!.disabled).toBe(false);
  });

  it("Draft it: Tex checks on the page, then the canvas opens with Tex's draft", async () => {
    await mount();
    await press("Sum up my email every morning");
    await press("Draft it");
    // The request goes to Tex as one for a draft, into the Automations chat (no conversation named).
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]).toMatchObject({ text: "Every morning at 9, sum up my unread email.", purpose: "automation_draft" });
    expect(net.sent[0]).not.toHaveProperty("conversationId");
    await until(() => words().includes(CHECKING_TEXT));
    expect(button("Draft it")!.disabled).toBe(true);
    expect(box().value).toBe("Every morning at 9, sum up my unread email.");
    expect(box().readOnly).toBe(true);
    expect(nav.pushed).toEqual([]);

    await until(() => nav.pushed.length > 0);
    const draft = demoState.drafts[0]!;
    expect(nav.pushed).toEqual([`/automations/new?draft=${draft.id}`]);
    // Nothing is saved: it is a draft until he saves it on the canvas.
    expect(draft.status).toBe("open");
    // The request and the draft, one turn, are kept in the Automations chat, to find later.
    const chat = demoState.conversations.find((c) => c.kind === "automations")!;
    const asked = demoState.messages.find((m) => m.direction === "in" && m.text.startsWith("Every morning at 9"))!;
    const turn = demoState.messages.filter((m) => m.turnId === asked.turnId);
    expect(turn.map((m) => [m.conversationId, m.automationDraftId ?? null])).toEqual([
      [chat.id, draft.id],
      [chat.id, null],
    ]);
  });

  it("can't be an automation: the note says why and what would work; Try another prompt goes back to the box", async () => {
    await mount();
    await type("Book a table for two tonight");
    await press("Draft it");
    await until(() => words().includes("Try another prompt"));
    expect(words()).toContain("so it can’t be an automation.");
    expect(words()).toContain("Try: “Every weekday at 9, sum up my unread email.”");
    expect(words()).not.toContain(CHECKING_TEXT);
    expect(nav.pushed).toEqual([]);
    // His words stay in the box, ready to change.
    expect(box().value).toBe("Book a table for two tonight");
    expect(box().readOnly).toBe(false);
    await press("Try another prompt");
    expect(document.activeElement).toBe(box());
    // The note stays while he edits, and goes with the next try.
    await type("Every evening at 7, tell me what's on tomorrow");
    expect(words()).toContain("Try another prompt");
    await press("Draft it");
    expect(words()).not.toContain("Try another prompt");
    expect(net.sent).toHaveLength(2);
  });

  it("a refused send is an error note (out of credits links to credits); nothing is checking", async () => {
    net.sendAnswer = () => Response.json({ error: { code: "out_of_credits", message: "You're out of credits" } }, { status: 402 });
    await mount();
    await type("Every morning at 9, sum up my unread email.");
    await press("Draft it");
    await until(() => Boolean(host.querySelector('[role="alert"]')));
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("You’re out of credits, so Tex can’t check this right now.");
    expect(hrefs(host.innerHTML)).toContain("/settings/credits");
    expect(words()).not.toContain(CHECKING_TEXT);
    expect(button("Draft it")!.disabled).toBe(false);
  });

  it("a failed turn is an error note", async () => {
    await mount();
    await type("Every morning at 9, sum up my unread email.");
    await press("Draft it");
    await until(() => demoState.messages.some((m) => m.direction === "in" && m.text.startsWith("Every morning")));
    const asked = demoState.messages.find((m) => m.direction === "in" && m.text.startsWith("Every morning"))!;
    // The turn fails before Tex drafts anything: the demo's Tex is stopped, and the message says so.
    for (const timer of demoState.timers) clearTimeout(timer);
    applyStreamEvent(qcOf(), { type: "message.status", data: { ...asked, status: "failed" } });
    await until(() => words().includes(ASK_FAILED_TEXT));
    expect(nav.pushed).toEqual([]);
  });

  it("no verdict in 90 seconds: Tex is taking longer, with the way to the chat; a later draft still opens", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await mount();
    await type("Every morning at 9, sum up my unread email.");
    await press("Draft it");
    await until(() => demoState.messages.some((m) => m.direction === "in" && m.text.startsWith("Every morning")));
    // Tex is slow: its answer is held back.
    const held = [...demoState.timers];
    for (const timer of held) clearTimeout(timer);
    await act(async () => {
      vi.advanceTimersByTime(DRAFT_ASK_SLOW_MS);
    });
    await until(() => words().includes("Tex is taking longer"));
    expect(words()).toContain("Tex is taking longer — see it in Chat");
    expect(hrefs(host.innerHTML)).toContain(AUTOMATIONS_CHAT_HREF);
    // The box is his again (to try once more), and the page keeps watching for the verdict.
    expect(words()).not.toContain(CHECKING_TEXT);
    expect(button("Draft it")!.disabled).toBe(false);
    expect(box().readOnly).toBe(false);
    // Tex's draft comes later all the same: it opens.
    const asked = demoState.messages.find((m) => m.direction === "in" && m.text.startsWith("Every morning"))!;
    await act(async () => {
      applyStreamEvent(qcOf(), {
        type: "message.created",
        data: { ...asked, id: "msg_late", direction: "out", status: "sent", text: "Here's a draft.", automationDraftId: "drf_late", clientMessageId: undefined },
      });
    });
    await until(() => nav.pushed.length > 0);
    expect(nav.pushed).toEqual(["/automations/new?draft=drf_late"]);
  });

  /** The query client the mounted page uses (the stream applies events to it). */
  function qcOf(): QueryClient {
    return lastClient!;
  }
});
