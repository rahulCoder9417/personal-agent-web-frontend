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

  it("once it is connected, offers Claude Code's model and thinking effort for Tex as dropdowns, before AI access", async () => {
    const html = draw(
      await seededClient((s) => ({ ...s, claude: { connected: true, connectedAt: "2026-10-01T10:00:00Z" }, claudeModel: null, claudeEffort: "high" })),
      createElement(AgentSettingsPage),
    );
    const modelFor = html.match(/<label for="([^"]+)"[^>]*><span class="sr-only">Tex’s <\/span>Model<\/label>/)?.[1];
    const effortFor = html.match(/<label for="([^"]+)"[^>]*><span class="sr-only">Tex’s <\/span>Thinking effort<\/label>/)?.[1];
    expect(modelFor && effortFor).toBeTruthy();
    expect(html).toMatch(new RegExp(`<button id="${modelFor}" type="button" role="combobox"[^>]*>.*?>Default \\(Sonnet 5\\.5, quick\\)<`));
    expect(html).toMatch(new RegExp(`<button id="${effortFor}" type="button" role="combobox"[^>]*>.*?>High<`));
    // Both sit before AI access.
    expect(html.indexOf("</span>Thinking effort</label>")).toBeLessThan(html.indexOf(">AI access</h2>"));
    expect(html).not.toContain("<select");
  });
});

describe("Settings → Agent & AI: the crew", () => {
  const onClaudeCode = (s: AgentSettings): AgentSettings => ({
    ...s,
    runtime: "claude_code",
    effectiveRuntime: "claude_code",
    aiAccess: "claude_plan",
    claude: { connected: true, connectedAt: "2026-10-01T10:00:00Z" },
  });
  /** The visible text of the combobox a `<label for>` with these words names. */
  const chosen = (html: string, who: string, field: string) => {
    const id = html.match(new RegExp(`<label for="([^"]+)"[^>]*><span class="sr-only">${who}’s </span>${field}</label>`))?.[1];
    expect(id, `${who}’s ${field}`).toBeTruthy();
    return text(html.match(new RegExp(`<button id="${id}" type="button" role="combobox"[^>]*>(.*?)</button>`))?.[1] ?? "").trim();
  };

  it("on Claude Code: a row for Tex, Byte, Patch and Scout, each with a model and an effort, Default first", async () => {
    const html = draw(await seededClient(onClaudeCode), createElement(AgentSettingsPage));
    const words = text(html);
    expect(html).toContain(">Crew</h2>");
    expect(html.indexOf(">Engine</h2>")).toBeLessThan(html.indexOf(">Crew</h2>"));
    expect(html.indexOf(">Crew</h2>")).toBeLessThan(html.indexOf(">AI access</h2>"));
    expect(words).toContain("Faster models answer sooner; stronger ones are more careful on hard code.");
    for (const line of ["Tex Leads, talks to you", "Byte Writes code", "Patch Reviews code", "Scout Researches and uses the browser"]) {
      expect(words).toContain(line);
    }
    expect(chosen(html, "Tex", "Model")).toBe("Default (Sonnet 5.5, quick)");
    expect(chosen(html, "Tex", "Thinking effort")).toBe("Default (Low)");
    expect(chosen(html, "Byte", "Model")).toBe("Default (Opus 5.5)");
    expect(chosen(html, "Byte", "Thinking effort")).toBe("Default (Medium)");
    expect(chosen(html, "Patch", "Model")).toBe("Default (Opus 5.5)");
    expect(chosen(html, "Scout", "Model")).toBe("Default (same as Tex)");
    expect(chosen(html, "Scout", "Thinking effort")).toBe("Default (same as Tex)");
    expect(words).not.toContain("share one model");
    expect(html).not.toContain("<select");
  });

  it("shows each member's own choice, and greys out an effort its model doesn't take", async () => {
    const html = draw(
      await seededClient((s) => ({
        ...onClaudeCode(s),
        claudeModel: "claude-opus-5-5",
        claudeCrew: { ...s.claudeCrew, patch: { model: "claude-sonnet-5-5", effort: "low" }, byte: { model: "claude-haiku-4-5", effort: null } },
      })),
      createElement(AgentSettingsPage),
    );
    expect(chosen(html, "Tex", "Model")).toBe("Opus 5.5");
    expect(chosen(html, "Patch", "Model")).toBe("Sonnet 5.5");
    expect(chosen(html, "Patch", "Thinking effort")).toBe("Low");
    // Tex's choice doesn't change Byte's Default.
    expect(chosen(html, "Byte", "Model")).toBe("Haiku 4.5");
    const byteEffort = html.match(/<label for="([^"]+)"[^>]*><span class="sr-only">Byte’s <\/span>Thinking effort<\/label>/)?.[1];
    expect(html).toMatch(new RegExp(`<button id="${byteEffort}" type="button" role="combobox"[^>]*disabled=""`));
    expect(text(html)).toContain("Byte: Haiku 4.5 has no thinking effort, so this setting doesn’t apply to it.");
  });

  it("on Hermes: Tex's choices stay, and a note says the crew shares one model there", async () => {
    const html = draw(
      await seededClient((s) => ({ ...s, claude: { connected: true, connectedAt: "2026-10-01T10:00:00Z" } })),
      createElement(AgentSettingsPage),
    );
    const words = text(html);
    expect(chosen(html, "Tex", "Model")).toBe("Default (Sonnet 5.5, quick)");
    expect(words).toContain("On Hermes they share one model. Each gets its own here once Claude Code is the engine.");
    expect(html).not.toContain("Byte’s </span>Model");
  });

  it("without a Claude plan: only the note, with the way to connect one", async () => {
    const words = text(draw(await seededClient(), createElement(AgentSettingsPage)));
    expect(words).toContain("On Hermes, Tex and the crew share one model.");
    expect(words).not.toContain("Faster models answer sooner");
  });

  it("with an older backend that sends no crew choices: Tex's row only, as before", async () => {
    const html = draw(
      await seededClient((s) => {
        const older = onClaudeCode(s) as Partial<AgentSettings>;
        delete older.claudeCrew;
        return older as AgentSettings;
      }),
      createElement(AgentSettingsPage),
    );
    expect(chosen(html, "Tex", "Model")).toBe("Default (Sonnet 5.5, quick)");
    expect(html).not.toContain("Byte’s </span>Model");
    expect(text(html)).not.toContain("share one model");
  });
});

describe("Settings → Agent & AI: the model's own rules", () => {
  it("greys out the effort for a model that takes none, and says why at the foot of the card", async () => {
    const html = draw(
      await seededClient((s) => ({ ...s, claude: { connected: true, connectedAt: "2026-10-01T10:00:00Z" }, claudeModel: "claude-opus-4-5", claudeEffort: null })),
      createElement(AgentSettingsPage),
    );
    const effortFor = html.match(/<label for="([^"]+)"[^>]*><span class="sr-only">Tex’s <\/span>Thinking effort<\/label>/)?.[1];
    expect(effortFor).toBeTruthy();
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
