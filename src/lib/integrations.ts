// Where everything a person connects lives: the Integrations screen and its three tabs (chat apps,
// apps, their own MCP servers), and the addresses other screens use to send people there.
// No imports at run time: next.config.ts reads the old addresses' redirects from here when the app
// is built, as it reads src/lib/auth-mode.ts.

/** The Integrations screen. Its first tab is the chat apps (Telegram). */
export const INTEGRATIONS_PATH = "/integrations";
/** The apps Tex works in (Composio): the catalog and its connect screens. */
export const INTEGRATIONS_APPS_PATH = "/integrations/apps";
/** The person's own MCP servers (Max). */
export const INTEGRATIONS_MCP_PATH = "/integrations/mcp";

/** The query parameter that opens the linking panel for a chat app on the chat apps tab. */
export const LINK_PARAM = "link";

/**
 * Where a "Link Telegram" button outside the welcome flow leads: the chat apps tab, with the
 * linking panel for that chat app open. Without a chat app (several on offer), just the tab.
 * Never the welcome flow: that is for a new account's first visit only.
 */
export function linkChatHref(channel?: string | null): string {
  return channel ? `${INTEGRATIONS_PATH}?${LINK_PARAM}=${encodeURIComponent(channel)}` : INTEGRATIONS_PATH;
}

/**
 * Where an app's sign-in comes back to when it was started from the Apps tab, which then says how
 * it went (`ConnectedNotice`).
 */
export function connectedReturnPath(appSlug: string): string {
  return `${INTEGRATIONS_APPS_PATH}?connected=${encodeURIComponent(appSlug)}`;
}

/**
 * The chat app whose linking panel the address asks for (`?link=telegram`), when it is one that
 * can be linked here; anything else opens nothing.
 */
export function linkRequested(params: { get(name: string): string | null }, linkable: readonly string[]): string | null {
  const asked = params.get(LINK_PARAM)?.trim().toLowerCase();
  return asked && linkable.includes(asked) ? asked : null;
}

/**
 * The addresses the apps lived at before Integrations. Links in Tex's messages, the backend's
 * default way back from an app's sign-in (`/apps?connected=gmail`) and bookmarks still use them,
 * so they lead to the same tab; the query is passed on as it was. Temporary (307), so a browser
 * doesn't keep the redirect for good.
 */
export const OLD_ADDRESSES = [
  { source: "/apps", destination: INTEGRATIONS_APPS_PATH, permanent: false },
  { source: "/apps/mcp", destination: INTEGRATIONS_MCP_PATH, permanent: false },
] as const;
