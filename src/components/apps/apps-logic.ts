import { ApiError, type App } from "@/lib/api/client";

// Pure rules behind the Apps screens, kept apart from React so they can be tested.

export const ALL_CATEGORIES = "all";

/**
 * What the toast says when Connect was refused. A plan's app limit gets its own words and a way
 * to the plans (`plans`); anything else is named after the app, with the API's reason under it.
 */
export function describeConnectError(appName: string, error: unknown): { title: string; detail: unknown; plans: boolean } {
  if (error instanceof ApiError && (error.planLimit || error.status === 403)) {
    return { title: "Your plan’s app limit is reached", detail: "Disconnect an app or upgrade to add more.", plans: true };
  }
  return { title: `Couldn’t connect ${appName}`, detail: error, plans: false };
}

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

/**
 * Whether Connect can be offered for an app: the server says it has a setup for it (`connectable`).
 * A backend from before the field existed doesn't send it, and that reads as yes, so an older
 * server doesn't turn the whole catalog off.
 */
export function isConnectable(app: Pick<App, "connectable">): boolean {
  return (app.connectable as boolean | undefined) !== false;
}

/** What an app that can't be connected says in place of the Connect button. */
export const NOT_AVAILABLE_LABEL = "Not available yet";

/**
 * Splits the catalog into apps with at least one connection and the rest. In the rest, the apps
 * that can be connected come first and the ones not available yet go last, each in catalog order.
 */
export function splitApps(apps: readonly App[]): { connected: App[]; available: App[] } {
  const rest = apps.filter((app) => app.connections.length === 0);
  return {
    connected: apps.filter((app) => app.connections.length > 0),
    available: [...rest.filter(isConnectable), ...rest.filter((app) => !isConnectable(app))],
  };
}

/** The first few apps onboarding offers: on the plan and ready to connect. */
export function appsToOffer(apps: readonly App[], count: number): App[] {
  return apps.filter((app) => app.availableOnPlan && isConnectable(app)).slice(0, count);
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
