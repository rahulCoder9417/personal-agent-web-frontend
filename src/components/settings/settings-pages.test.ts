import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Settings screens, drawn from the demo account's data: every setting is still there after the
// move to one column of groups. What the dropdowns do is tested in src/lib/listbox.test.ts.

const nav = vi.hoisted(() => ({ pathname: "/settings" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
// The demo account: no Clerk in the tree, so its buttons aren't drawn.
vi.mock("@/components/shell/providers", () => ({ useAppConfig: () => ({ mode: "demo", demo: true, clerk: false }) }));

import AgentSettingsPage from "@/app/(app)/settings/agent/page";
import SettingsLayout from "@/app/(app)/settings/layout";
import MemoryPage from "@/app/(app)/settings/memory/page";
import GeneralSettingsPage from "@/app/(app)/settings/page";
import { qk } from "@/lib/api/hooks";
import type { AgentSettings } from "@/lib/api/client";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";

/** What the demo backend answers, as the proxy route would hand it on. */
async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}

async function seededClient(change?: (settings: AgentSettings) => AgentSettings) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(qk.me, await demo("me"));
  client.setQueryData(qk.channels, await demo("channels"));
  client.setQueryData(qk.byok, await demo("byok"));
  client.setQueryData(qk.memories, await demo("memories"));
  const settings = await demo<AgentSettings>("agent/settings");
  client.setQueryData(qk.agentSettings, change ? change(settings) : settings);
  return client;
}

function draw(client: QueryClient, page: ReactNode) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, page));
}

/** The page's text, without the markup. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

beforeEach(() => {
  resetDemoStore(new Date("2026-10-01T14:30:00"));
  nav.pathname = "/settings";
});

describe("Settings → General", () => {
  it("has every setting, in groups: profile, linked chats, help, your data, the account", async () => {
    const html = draw(await seededClient(), createElement(GeneralSettingsPage));
    const words = text(html);
    for (const heading of ["Profile", "Linked chats", "Help", "Your data", "Account"]) expect(html).toContain(`>${heading}</h2>`);
    expect(html).toMatch(/<a [^>]*href="\/help"[^>]*>Open Help<\/a>/);
    expect(words).toContain("Tex uses this when it writes on your behalf.");
    expect(words).toContain("Automations and reminders run in this time zone.");
    expect(words).toContain("Telegram");
    expect(words).toContain("Not used to train AI");
    expect(words).toContain("Demo account");
    expect(words).toContain("Delete my account and data");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Save changes/);
  });

  it("says what deleting the account really clears: workspace backups at once, database backups within 7 days", async () => {
    const words = text(draw(await seededClient(), createElement(GeneralSettingsPage)));
    expect(words).toContain(
      "Removes your agent’s workspace, memory, messages and connected apps, and the backups of your workspace files. The rest leaves our database backups within 7 days.",
    );
    expect(words).not.toContain("30 days");
  });

  it("names each control by its row's label, and the time zone is a searching field", async () => {
    const html = draw(await seededClient(), createElement(GeneralSettingsPage));
    const nameFor = html.match(/<label for="([^"]+)"[^>]*>Name<\/label>/)?.[1];
    const zoneFor = html.match(/<label for="([^"]+)"[^>]*>Time zone<\/label>/)?.[1];
    expect(html).toMatch(new RegExp(`<input id="${nameFor}"[^>]*value="Aarav Shah"`));
    expect(html).toMatch(new RegExp(`<input id="${zoneFor}" role="combobox" aria-autocomplete="list"[^>]*value="Asia/Kolkata"`));
    // No native select is left anywhere on the page.
    expect(html).not.toContain("<select");
  });
});

describe("Settings → Agent & AI", () => {
  it("shows what runs now with how it is decided folded away, then Engine and AI access", async () => {
    const html = draw(await seededClient(), createElement(AgentSettingsPage));
    const words = text(html);
    expect(words).toContain("Running now");
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>.*How it’s decided/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html.indexOf(">Engine</h2>")).toBeLessThan(html.indexOf(">AI access</h2>"));
    expect(html).toContain('role="radiogroup" aria-label="Agent"');
    for (const choice of ["Your own API key", "Your Claude plan", "Textcrew AI"]) expect(html).toContain(`>${choice}</h3>`);
    for (const provider of ["Anthropic", "OpenAI", "OpenRouter"]) expect(words).toContain(provider);
  });

  it("marks no way to get AI as recommended; the Claude plan keeps its Beta", async () => {
    const html = draw(await seededClient(), createElement(AgentSettingsPage));
    expect(text(html)).not.toMatch(/recommended/i);
    expect(html).toMatch(/>Your Claude plan<\/h3>\s*<span[^>]*>Beta</);
  });

  it("before a Claude plan is connected, points to it instead of offering the model and effort", async () => {
    const html = draw(await seededClient((s) => ({ ...s, claude: { connected: false } })), createElement(AgentSettingsPage));
    expect(html).not.toContain(">Model</label>");
    expect(html).toContain('href="#claude-plan"');
    expect(html).toContain('id="claude-plan"');
    expect(text(html)).toContain("Open sign-in page");
  });

  it("once it is connected, offers Claude Code's model and thinking effort as dropdowns in the Engine group", async () => {
    const html = draw(
      await seededClient((s) => ({ ...s, claude: { connected: true, connectedAt: "2026-10-01T10:00:00Z" }, claudeModel: null, claudeEffort: "high" })),
      createElement(AgentSettingsPage),
    );
    const modelFor = html.match(/<label for="([^"]+)"[^>]*>Model<\/label>/)?.[1];
    const effortFor = html.match(/<label for="([^"]+)"[^>]*>Thinking effort<\/label>/)?.[1];
    expect(modelFor && effortFor).toBeTruthy();
    expect(html).toMatch(new RegExp(`<button id="${modelFor}" type="button" role="combobox"[^>]*>.*?>Default \\(Sonnet 5\\.5, quick\\)<`));
    expect(html).toMatch(new RegExp(`<button id="${effortFor}" type="button" role="combobox"[^>]*>.*?>High<`));
    // Both sit before AI access.
    expect(html.indexOf(">Thinking effort</label>")).toBeLessThan(html.indexOf(">AI access</h2>"));
    expect(html).not.toContain("<select");
  });
});

describe("Settings → Agent & AI: the model's own rules", () => {
  it("greys out the effort for a model that takes none, and says why at the foot of the card", async () => {
    const html = draw(
      await seededClient((s) => ({ ...s, claude: { connected: true, connectedAt: "2026-10-01T10:00:00Z" }, claudeModel: "claude-opus-4-5", claudeEffort: null })),
      createElement(AgentSettingsPage),
    );
    const effortFor = html.match(/<label for="([^"]+)"[^>]*>Thinking effort<\/label>/)?.[1];
    expect(html).toMatch(new RegExp(`<button id="${effortFor}" type="button" role="combobox"[^>]*disabled=""`));
    expect(text(html)).toContain("Opus 4.5 has no thinking effort, so this setting doesn’t apply to it.");
  });
});

describe("Settings → Memory", () => {
  it("lists the kinds one under another", async () => {
    const html = draw(await seededClient(), createElement(MemoryPage));
    expect(text(html)).toContain("What Tex remembers about you");
    expect(html).not.toContain("column-width");
  });
});

describe("Settings sections", () => {
  it("are links down the left on a wide screen and tabs under the title below that, the open one marked", () => {
    nav.pathname = "/settings/agent";
    const html = renderToStaticMarkup(createElement(SettingsLayout, null, createElement("p", null, "page")));
    const navs = html.match(/<nav aria-label="Settings sections" class="[^"]*"/g) ?? [];
    expect(navs).toHaveLength(2);
    expect(html).toContain('class="max-w-full min-w-0 xl:hidden"');
    expect(navs.some((tag) => tag.includes("max-xl:hidden"))).toBe(true);
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html.match(/<a aria-current="page"[^>]*href="\/settings\/agent"/g)).toHaveLength(2);
    for (const section of ["General", "Agent &amp; AI", "Memory", "Credits", "Plans"]) expect(html.split(`>${section}<`).length - 1).toBe(2);
  });
});
