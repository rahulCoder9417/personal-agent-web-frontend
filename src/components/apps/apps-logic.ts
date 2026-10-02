import type { App } from "@/lib/api/client";

// Pure rules behind the Apps screens, kept apart from React so they can be tested.

export const ALL_CATEGORIES = "all";

/** The categories that actually occur in the catalog, in first-seen order. */
export function categoriesOf(apps: readonly App[]): string[] {
  return [...new Set(apps.map((app) => app.category))];
}

/** Catalog rows matching the search box and the chosen category. */
export function filterApps(apps: readonly App[], search: string, category: string): App[] {
  const needle = search.trim().toLowerCase();
  return apps.filter(
    (app) =>
      (category === ALL_CATEGORIES || app.category === category) &&
      (needle === "" || app.name.toLowerCase().includes(needle) || app.slug.toLowerCase().includes(needle)),
  );
}

/** Splits the catalog into apps with at least one connection and the rest. */
export function splitApps(apps: readonly App[]): { connected: App[]; available: App[] } {
  return {
    connected: apps.filter((app) => app.connections.length > 0),
    available: apps.filter((app) => app.connections.length === 0),
  };
}

export type McpServerDraft = {
  name: string;
  url: string;
  authHeaderName: string;
  authSecret: string;
};

export type McpServerErrors = Partial<Record<keyof McpServerDraft, string>>;

export const MCP_NAME_MAX = 60;

/** Checks the "Add a server" form before it is sent. An empty result means it's good to go. */
export function validateMcpServer(draft: McpServerDraft): McpServerErrors {
  const errors: McpServerErrors = {};
  const name = draft.name.trim();
  const url = draft.url.trim();

  if (!name) errors.name = "Give the server a name.";
  else if (name.length > MCP_NAME_MAX) errors.name = `Keep the name to ${MCP_NAME_MAX} characters.`;

  if (!url) errors.url = "Add the server's URL.";
  else if (!url.toLowerCase().startsWith("https://")) errors.url = "The URL must start with https://";
  else {
    try {
      if (!new URL(url).hostname.includes(".")) errors.url = "That doesn't look like a full address.";
    } catch {
      errors.url = "That doesn't look like a full address.";
    }
  }

  if (draft.authHeaderName.trim() && !draft.authSecret) {
    errors.authSecret = "Add the secret that goes in this header.";
  }
  return errors;
}

/** The request body for a valid draft. A secret without a header name goes in `Authorization`. */
export function toMcpServerCreate(draft: McpServerDraft) {
  const secret = draft.authSecret;
  return {
    name: draft.name.trim(),
    url: draft.url.trim(),
    ...(secret ? { authHeaderName: draft.authHeaderName.trim() || "Authorization", authSecret: secret } : {}),
  };
}
