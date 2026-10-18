import { ApiError, type App, type Automation } from "@/lib/api/client";

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

/** Why the connect screen opened: a first connection, one more account, or one that stopped working. */
export type ConnectPurpose = "connect" | "add" | "reconnect";

/**
 * Whose sign-in page comes next ("Continue to Google"). A backend from before the field existed
 * doesn't send it, and then the app's own name is the best guess.
 */
export function providerOf(app: Pick<App, "name" | "provider">): string {
  return (app.provider as string | undefined)?.trim() || app.name;
}

/** What the connect screen says before anyone leaves for the provider's page. */
export type ConnectCopy = {
  title: string;
  /** One sentence under the title; empty for a first connection. */
  intro: string;
  /** What Tex can do with the app, in the backend's words (a fallback for an older backend). */
  can: string;
  /** The rules that hold for every app: approvals, credits, the sign-in. */
  points: { kind: "approval" | "credits" | "signin" | "tab"; text: string }[];
  continueLabel: string;
  /** Shown once the API said yes and the browser is on its way. */
  leaving: string;
};

/**
 * The line under one connected account. The server marks a connection expired or failed when Composio says so
 * (its webhook, a check when the Apps page is opened, or an action that failed), so an account that stopped
 * working never keeps saying "Connected".
 */
export const CONNECTION_STATUS_LINE: Record<App["connections"][number]["status"], string> = {
  active: "Connected",
  expired: "Reconnect needed: the sign-in expired, so Tex can’t use it.",
  error: "Reconnect needed: it stopped working. Reconnect, or disconnect it.",
};

export function connectCopy(app: Pick<App, "name" | "provider" | "description">, purpose: ConnectPurpose, newTab = false): ConnectCopy {
  const provider = providerOf(app);
  const can = (app.description as string | undefined)?.trim() || `Use ${app.name} for you, when you ask.`;
  const title =
    purpose === "add" ? `Add another ${app.name} account` : purpose === "reconnect" ? `Reconnect ${app.name}` : `Connect ${app.name}`;
  const intro =
    purpose === "add"
      ? `Sign in with the other account on ${provider}’s page. Tex can then use both.`
      : purpose === "reconnect"
        ? `${app.name} stopped letting Tex in. That usually follows a password change or access being removed. Signing in again fixes it.`
        : "";
  const points: ConnectCopy["points"] = [
    { kind: "approval", text: "Before Tex sends, shares, deletes or changes anything in your apps, it asks you first. Only a draft, a label or a new private file goes ahead without asking." },
    { kind: "credits", text: "Reading is free. Each change Tex makes costs 1 credit." },
    { kind: "signin", text: `You sign in on ${provider}’s own page. Textcrew never sees your password, and you can disconnect at any time.` },
  ];
  if (newTab) points.push({ kind: "tab", text: `${provider}’s page opens in a new tab. Come back here when you’re done.` });
  return { title, intro, can, points, continueLabel: `Continue to ${provider}`, leaving: `Taking you to ${provider}…` };
}

/**
 * Where the sign-in left off, from the address it came back to: our own `app` (or the Apps page's
 * `connected`) names the app, and Composio adds `status` (`success` or `failed`). Without a status
 * it counts as done; anything else but `success` counts as not connected. Null: no app named, so
 * this isn't the way back from a sign-in.
 */
export function connectOutcome(params: { get(name: string): string | null }): { slug: string; ok: boolean } | null {
  const slug = (params.get("app") ?? params.get("connected") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,40}$/.test(slug)) return null;
  const status = params.get("status");
  return { slug, ok: status === null || status === "success" };
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

// ---------------------------------------------------------------- disconnecting

type Connection = App["connections"][number];

/**
 * The automations that watch an app: an event automation on it (`trigger.app`), and pull-request
 * review for GitHub. They don't say which account they use: the backend uses the newest working
 * one.
 */
export function automationsWatching(slug: string, automations: readonly Automation[]): Automation[] {
  return automations.filter((automation) => automation.trigger?.app === slug || (slug === "github" && automation.preset === "pr_review"));
}

export type DisconnectCopy = {
  /** "Disconnect Gmail (name@gmail.com)?" */
  title: string;
  /** What stops working, in one line. */
  stops: string;
  /** The automations that stop with it: only when no other working account of the app is left. */
  watching: Automation[];
  confirmLabel: string;
  /** The toast once it is done. */
  done: { title: string; body: string };
};

/**
 * What the dialog says before an app's account is disconnected. With another working account of
 * the app left, Tex goes on with that one (the backend uses the newest working account); with
 * none, Tex can't use the app and what watches it stops until it is connected again.
 */
export function disconnectCopy(app: App, connection: Connection, automations: readonly Automation[] = []): DisconnectCopy {
  const account = connection.accountLabel?.trim() || null;
  const others = app.connections.filter((other) => other.id !== connection.id && other.status === "active");
  const other = others[0]?.accountLabel?.trim();
  let stops: string;
  if (connection.status !== "active" && others.length === 0) {
    stops = `This account isn’t working right now, so Tex can’t use ${app.name} as it is. Disconnecting removes it; connect ${app.name} again any time.`;
  } else if (others.length > 0) {
    stops = `Tex stops using this account and goes on with your other ${app.name} account${other ? ` (${other})` : ""}.`;
  } else {
    stops = `Tex can no longer read or do anything in ${app.name}, and anything that watches it stops until you connect it again.`;
  }
  return {
    title: account ? `Disconnect ${app.name} (${account})?` : `Disconnect ${app.name}?`,
    stops,
    watching: others.length > 0 ? [] : automationsWatching(app.slug, automations),
    confirmLabel: `Disconnect ${app.name}`,
    done: {
      title: `${app.name} disconnected`,
      body: account ? `${account} is no longer connected to Tex.` : `Tex no longer has access to ${app.name}.`,
    },
  };
}
