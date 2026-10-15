import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Integrations screen, drawn from the demo backend's answers: its tabs, and each tab's states
// (loading, failed, linked, not linked, nothing on offer, locked behind a plan).

const nav = vi.hoisted(() => ({ pathname: "/integrations", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import ChatAppsPage from "@/app/(app)/integrations/page";
import IntegrationsLayout from "@/app/(app)/integrations/layout";
import AppsPage from "@/app/(app)/integrations/apps/page";
import McpServersPage from "@/app/(app)/integrations/mcp/page";
import { ChatAppsTab } from "@/components/integrations/chat-apps";
import { ApiError, type ChannelLink, type ChannelType } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}

type Channels = { items: ChannelLink[]; available: ChannelType[] };

function client() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
}

async function withChannels(change?: (channels: Channels) => Channels) {
  const qc = client();
  const channels = await demo<Channels>("channels");
  qc.setQueryData(qk.channels, change ? change(channels) : channels);
  return qc;
}

function draw(qc: QueryClient, page: ReactNode) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, page));
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const TELEGRAM: ChannelLink = { id: "ch_telegram", channel: "telegram", displayId: "@aarav_s", linkedAt: "2026-09-26T10:00:00.000Z" };

beforeEach(() => {
  resetDemoStore(new Date("2026-10-01T14:30:00"));
  nav.pathname = "/integrations";
  nav.search = "";
});

describe("Integrations, the screen", () => {
  it("has its title and three tabs, chat apps first, with the open one marked", () => {
    nav.pathname = "/integrations/apps";
    const html = renderToStaticMarkup(createElement(IntegrationsLayout, null, createElement("p", null, "tab")));
    expect(html).toContain(">Integrations</h1>");
    expect(html).toContain('aria-label="Integrations sections"');
    const tabs = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(?:<[^>]+>)*([^<]+)/g)].map((match) => [match[1], match[2]]);
    expect(tabs).toEqual([
      ["/integrations", "Chat apps"],
      ["/integrations/apps", "Apps"],
      ["/integrations/mcp", "MCP servers"],
    ]);
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/integrations\/apps"/);
  });
});

describe("Integrations → Chat apps", () => {
  it("shows the linked Telegram chat with its name, when it was linked and Unlink, and the web chat", async () => {
    const qc = await withChannels((channels) => ({ ...channels, items: [TELEGRAM] }));
    const html = draw(qc, createElement(ChatAppsTab));
    const words = text(html);
    expect(words).toContain("Text Tex from Telegram");
    expect(words).toContain("Your chats");
    expect(words).toContain("Telegram linked");
    expect(words).toContain("@aarav_s");
    expect(words).toContain("Linked 26 Sep");
    expect(html).toMatch(/<button[^>]*aria-label="Unlink Telegram @aarav_s"[^>]*>/);
    expect(words).toContain("Web chat");
    expect(words).toContain("Always on");
    // Linked already: no code to ask for.
    expect(words).not.toContain("Get my Telegram code");
    // A backend from before the masked id, the last message and `blocked`: the row as it was.
    expect(words).not.toContain("Last message");
    expect(words).not.toContain("Blocked the bot");
    expect(words).not.toContain("••••");
  });

  describe("what each linked chat says about itself", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-01T14:30:00"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows the masked chat id and when the chat last wrote, from the demo backend", async () => {
      const qc = await withChannels();
      const words = text(draw(qc, createElement(ChatAppsTab)));
      expect(words).toContain("@aarav_s · •••• 4821");
      expect(words).toContain("Last message 17 min ago");
      expect(words).toContain("Linked");
      expect(words).not.toContain("Blocked the bot");
    });

    it("says “Blocked the bot” for a chat that blocked it, with what to do", async () => {
      const qc = await withChannels((channels) => ({
        ...channels,
        items: [{ ...TELEGRAM, maskedChatId: "•••• 4821", lastInboundAt: "2026-10-01T12:20:00", blocked: true }],
      }));
      const html = draw(qc, createElement(ChatAppsTab));
      const words = text(html);
      expect(words).toContain("Blocked the bot");
      expect(words).toContain("Last message 2h ago");
      expect(words).toContain("Unblock the bot in Telegram and send it a message to start again.");
      // Not also marked as working.
      expect(html).not.toMatch(/>Linked<\/span>/);
      expect(html).toMatch(/<button[^>]*aria-label="Unlink Telegram @aarav_s"[^>]*>/);
    });

    it("doesn't repeat a WhatsApp number that is already shown masked", async () => {
      const number = "+91 •••• ••42 10";
      const qc = await withChannels(() => ({
        available: ["whatsapp", "web"],
        items: [{ id: "ch_wa", channel: "whatsapp", displayId: number, maskedChatId: number, linkedAt: "2026-09-26T10:00:00.000Z", lastInboundAt: null, blocked: false }],
      }));
      const words = text(draw(qc, createElement(ChatAppsTab)));
      expect(words.split(number)).toHaveLength(2);
      expect(words).not.toContain("Last message");
    });
  });

  it("offers the one-time code right there when Telegram isn't linked yet", async () => {
    const qc = await withChannels((channels) => ({ ...channels, items: [] }));
    const words = text(draw(qc, createElement(ChatAppsTab)));
    expect(words).toContain("Telegram isn’t linked yet");
    expect(words).toContain("Get my Telegram code");
    expect(words).toContain("No chat app linked yet");
    expect(words).toContain("We’ll make a code that works once and lasts 10 minutes.");
  });

  it("picks the chat app the address asks for when several are on offer", async () => {
    nav.search = "link=whatsapp";
    const qc = await withChannels(() => ({ items: [], available: ["telegram", "whatsapp", "web"] }));
    const html = draw(qc, createElement(ChatAppsTab));
    expect(text(html)).toContain("Get my WhatsApp code");
    expect(html).toMatch(/<button type="button" aria-pressed="true"[^>]*>.*?WhatsApp<\/button>/);
  });

  it("says so when no chat app can be linked, and still lists a chat linked before as switched off", async () => {
    const qc = await withChannels(() => ({ items: [TELEGRAM], available: ["web"] }));
    const words = text(draw(qc, createElement(ChatAppsTab)));
    expect(words).toContain("None can be linked right now");
    expect(words).toContain("Switched off");
    expect(words).toContain("Unlink");
    expect(words).not.toContain("Get my");
  });

  it("shows placeholder rows while the chats load", () => {
    const html = draw(client(), createElement(ChatAppsPage));
    expect(html).toContain("animate-pulse");
    expect(text(html)).not.toContain("Your chats");
  });

  it("says the list didn't load, with Try again, when it fails", () => {
    // A failed load that isn't tried again by itself as the page is drawn.
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
    qc.getQueryCache()
      .build(qc, { queryKey: qk.channels })
      .setState({ status: "error", error: new ApiError(503, "unavailable", "The server is busy."), fetchStatus: "idle", data: undefined });
    const words = text(draw(qc, createElement(ChatAppsTab)));
    expect(words).toContain("That didn’t load");
    expect(words).toContain("The server is busy.");
    expect(words).toContain("Try again");
  });
});

describe("Integrations → Apps", () => {
  it("says what the tab is for, then the connected apps with a Disconnect per account, then the rest", async () => {
    const qc = client();
    qc.setQueryData(qk.apps, await demo("apps"));
    const html = draw(qc, createElement(AppsPage));
    const words = text(html);
    expect(words).toContain("Apps Tex works in");
    expect(words).toContain("It asks before it sends, deletes or changes anything");
    for (const account of ["Disconnect Gmail aarav@northwind.studio", "Disconnect Gmail aarav.shah@gmail.com"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*aria-label="${account}"`));
    }
    expect(words).toContain("Email · 2 accounts");
    expect(html).toMatch(/<button[^>]*aria-label="Reconnect Google Drive aarav@northwind.studio"/);
    expect(words).toContain("Sign-in expired");
    expect(words).toContain("Add more");
  });
});

describe("Integrations → MCP servers", () => {
  it("is locked behind Max on another plan, with the way to it", async () => {
    const qc = client();
    qc.setQueryData(qk.me, await demo("me"));
    qc.setQueryData(qk.plans, await demo("billing/plans"));
    const words = text(draw(qc, createElement(McpServersPage)));
    expect(words).toContain("Your own MCP servers are part of Max");
    expect(words).toContain("See Max");
  });

  it("lists the servers and the form to add one on Max", async () => {
    const qc = client();
    const me = await demo<{ plan: string }>("me");
    qc.setQueryData(qk.me, { ...me, plan: "max" });
    qc.setQueryData(qk.plans, await demo("billing/plans"));
    qc.setQueryData(qk.mcpServers, await demo("mcp-servers"));
    const html = draw(qc, createElement(McpServersPage));
    expect(text(html)).toContain("Plug your own tools into Tex");
    expect(text(html)).toContain("Add a server");
  });
});
