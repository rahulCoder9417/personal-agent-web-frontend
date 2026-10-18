import { describe, expect, it } from "vitest";
import { ApiError, type App, type Automation } from "@/lib/api/client";
import {
  CONNECTION_STATUS_LINE,
  appsToOffer,
  automationsWatching,
  categoriesOf,
  connectCopy,
  connectOutcome,
  describeConnectError,
  disconnectCopy,
  filterApps,
  isConnectable,
  NOT_AVAILABLE_LABEL,
  providerOf,
  splitApps,
  toMcpServerCreate,
  validateMcpServer,
} from "./apps-logic";

const app = (slug: string, name: string, category: string, connected = false): App => ({
  slug,
  name,
  provider: "Google",
  description: `Do things in ${name}.`,
  category,
  availableOnPlan: true,
  connectable: true,
  connections: connected ? [{ id: `c_${slug}`, status: "active" }] : [],
});

const CATALOG = [
  app("gmail", "Gmail", "email", true),
  app("googlecalendar", "Google Calendar", "calendar", true),
  app("linear", "Linear", "dev"),
  app("github", "GitHub", "dev"),
];

describe("catalog", () => {
  it("lists each category once, in catalog order", () => {
    expect(categoriesOf(CATALOG)).toEqual(["email", "calendar", "dev"]);
  });

  it("filters by search and category together", () => {
    expect(filterApps(CATALOG, "", "dev").map((a) => a.slug)).toEqual(["linear", "github"]);
    expect(filterApps(CATALOG, " GIT ", "all").map((a) => a.slug)).toEqual(["github"]);
    expect(filterApps(CATALOG, "google", "email")).toEqual([]);
  });

  it("separates connected apps from the rest", () => {
    const { connected, available } = splitApps(CATALOG);
    expect(connected.map((a) => a.slug)).toEqual(["gmail", "googlecalendar"]);
    expect(available.map((a) => a.slug)).toEqual(["linear", "github"]);
  });
});

describe("apps that can't be connected yet", () => {
  const off = (slug: string, name: string, connected = false): App => ({ ...app(slug, name, "tasks", connected), connectable: false });

  it("offers Connect only where the server has a setup for the app", () => {
    expect(isConnectable(app("gmail", "Gmail", "email"))).toBe(true);
    expect(isConnectable(off("asana", "Asana"))).toBe(false);
  });

  it("reads a missing value as connectable, so an older backend doesn't turn every app off", () => {
    const old: Partial<App> = app("gmail", "Gmail", "email");
    delete old.connectable;
    expect(isConnectable(old as App)).toBe(true);
  });

  it("lists them after the apps that can be connected, each group in catalog order", () => {
    const catalog = [off("asana", "Asana"), app("linear", "Linear", "dev"), off("trello", "Trello"), app("github", "GitHub", "dev"), app("gmail", "Gmail", "email", true)];
    const { connected, available } = splitApps(catalog);
    expect(available.map((a) => a.slug)).toEqual(["linear", "github", "asana", "trello"]);
    expect(connected.map((a) => a.slug)).toEqual(["gmail"]);
  });

  it("keeps a connected app under Connected even when it can no longer be connected", () => {
    expect(splitApps([off("notion", "Notion", true)])).toEqual({ connected: [off("notion", "Notion", true)], available: [] });
  });

  it("leaves them out of what onboarding offers, along with apps the plan doesn't have", () => {
    const locked: App = { ...app("slack", "Slack", "chat"), availableOnPlan: false };
    const catalog = [off("asana", "Asana"), app("gmail", "Gmail", "email"), locked, app("github", "GitHub", "dev"), app("linear", "Linear", "dev")];
    expect(appsToOffer(catalog, 2).map((a) => a.slug)).toEqual(["gmail", "github"]);
    expect(NOT_AVAILABLE_LABEL).toBe("Not available yet");
  });
});

describe("describeConnectError", () => {
  it("names the app and passes the API's reason on", () => {
    const error = new ApiError(404, "not_found", "Google Calendar isn't configured yet");
    expect(describeConnectError("Google Calendar", error)).toEqual({ title: "Couldn’t connect Google Calendar", detail: error, plans: false });
  });

  it("says the plan's app limit is reached, with the way to the plans", () => {
    for (const error of [new ApiError(403, "plan_limit", "Limit reached"), new ApiError(403, "forbidden", "No")]) {
      expect(describeConnectError("Linear", error)).toEqual({
        title: "Your plan’s app limit is reached",
        detail: "Disconnect an app or upgrade to add more.",
        plans: true,
      });
    }
  });
});

describe("validateMcpServer", () => {
  const good = { name: "Support desk", url: "https://mcp.example.com/support", authHeaderName: "", authSecret: "" };

  it("accepts a named https server", () => {
    expect(validateMcpServer(good)).toEqual({});
  });

  it("needs a name of at most 60 characters", () => {
    expect(validateMcpServer({ ...good, name: "  " }).name).toBeDefined();
    expect(validateMcpServer({ ...good, name: "x".repeat(61) }).name).toBeDefined();
    expect(validateMcpServer({ ...good, name: "x".repeat(60) }).name).toBeUndefined();
  });

  it("only takes https URLs with a real host", () => {
    expect(validateMcpServer({ ...good, url: "http://mcp.example.com" }).url).toBe("The URL must start with https://");
    expect(validateMcpServer({ ...good, url: "https://" }).url).toBeDefined();
    expect(validateMcpServer({ ...good, url: "https://localhost" }).url).toBeDefined();
    expect(validateMcpServer({ ...good, url: "" }).url).toBeDefined();
  });

  it("wants a secret when a header name is given", () => {
    expect(validateMcpServer({ ...good, authHeaderName: "X-Api-Key" }).authSecret).toBeDefined();
    expect(validateMcpServer({ ...good, authHeaderName: "X-Api-Key", authSecret: "s3cret" })).toEqual({});
  });
});

describe("toMcpServerCreate", () => {
  it("leaves auth out when there is no secret", () => {
    expect(toMcpServerCreate({ name: " Desk ", url: " https://a.example.com ", authHeaderName: "", authSecret: "" })).toEqual({
      name: "Desk",
      url: "https://a.example.com",
    });
  });

  it("defaults the header to Authorization", () => {
    expect(toMcpServerCreate({ name: "Desk", url: "https://a.example.com", authHeaderName: "", authSecret: "tok" })).toEqual({
      name: "Desk",
      url: "https://a.example.com",
      authHeaderName: "Authorization",
      authSecret: "tok",
    });
  });
});

describe("the connect screen", () => {
  const gmail = { name: "Gmail", provider: "Google", description: "Read and search your email, write drafts and send email for you." };

  it("names the app, says what Tex can do with it, and continues to the provider", () => {
    const copy = connectCopy(gmail, "connect");
    expect(copy).toMatchObject({
      title: "Connect Gmail",
      intro: "",
      can: gmail.description,
      continueLabel: "Continue to Google",
      leaving: "Taking you to Google…",
    });
    expect(copy.points.map((p) => p.kind)).toEqual(["approval", "credits", "signin"]);
    expect(copy.points[0]!.text).toBe("Before Tex sends, shares, deletes or changes anything in your apps, it asks you first. Only a draft, a label or a new private file goes ahead without asking.");
    expect(copy.points[1]!.text).toBe("Reading is free. Each change Tex makes costs 1 credit.");
    expect(copy.points[2]!.text).toContain("You sign in on Google’s own page. Textcrew never sees your password");
  });

  it("says why it is open when adding an account or reconnecting", () => {
    expect(connectCopy(gmail, "add")).toMatchObject({
      title: "Add another Gmail account",
      intro: "Sign in with the other account on Google’s page. Tex can then use both.",
    });
    const again = connectCopy(gmail, "reconnect");
    expect(again.title).toBe("Reconnect Gmail");
    expect(again.intro).toMatch(/^Gmail stopped letting Tex in\./);
  });

  it("says the provider's page opens in a new tab, when it does", () => {
    expect(connectCopy(gmail, "connect", true).points.at(-1)).toEqual({
      kind: "tab",
      text: "Google’s page opens in a new tab. Come back here when you’re done.",
    });
  });

  it("has words of its own for a backend that doesn't send the provider or the description", () => {
    const old = { name: "Linear" } as Parameters<typeof connectCopy>[0];
    expect(providerOf(old)).toBe("Linear");
    expect(connectCopy(old, "connect")).toMatchObject({
      can: "Use Linear for you, when you ask.",
      continueLabel: "Continue to Linear",
    });
    expect(providerOf({ name: "Jira", provider: "  " })).toBe("Jira");
  });
});

describe("the way back from a sign-in", () => {
  const read = (query: string) => connectOutcome(new URLSearchParams(query));

  it("reads the app and Composio's status", () => {
    expect(read("app=gmail&status=success&connected_account_id=ca_1")).toEqual({ slug: "gmail", ok: true });
    expect(read("app=gmail&status=failed")).toEqual({ slug: "gmail", ok: false });
    // The Apps page's own way back.
    expect(read("connected=github&status=success")).toEqual({ slug: "github", ok: true });
    expect(read("connected=github&status=failed")).toEqual({ slug: "github", ok: false });
  });

  it("counts a missing status as done, and any other status as not connected", () => {
    expect(read("app=notion")).toEqual({ slug: "notion", ok: true });
    expect(read("app=notion&status=error")).toEqual({ slug: "notion", ok: false });
  });

  it("is not a way back without an app, or with something that isn't an app name", () => {
    expect(read("")).toBeNull();
    expect(read("checkout=demo")).toBeNull();
    expect(read("app=%3Cscript%3E")).toBeNull();
    expect(read("app=" + "a".repeat(41))).toBeNull();
  });
});

describe("disconnecting an account", () => {
  const automation = (id: string, title: string, extra: Partial<Automation> = {}): Automation => ({
    id,
    kind: "event",
    title,
    instruction: "",
    enabled: true,
    createdAt: "2026-10-01T00:00:00Z",
    ...extra,
  });
  const AUTOMATIONS = [
    automation("a1", "Tell me about invoices", { trigger: { app: "gmail", event: "GMAIL_NEW_GMAIL_MESSAGE" } }),
    automation("a2", "Review pull requests in acme/web", { trigger: { app: "github", event: "GITHUB_PULL_REQUEST_EVENT" }, preset: "pr_review" }),
    automation("a3", "Morning summary", { kind: "repeat", cron: "0 8 * * *" }),
  ];
  const gmail = (connections: App["connections"]): App => ({ ...app("gmail", "Gmail", "email"), connections });

  it("finds the automations that watch an app, pull-request review for GitHub", () => {
    expect(automationsWatching("gmail", AUTOMATIONS).map((a) => a.id)).toEqual(["a1"]);
    expect(automationsWatching("github", AUTOMATIONS).map((a) => a.id)).toEqual(["a2"]);
    expect(automationsWatching("notion", AUTOMATIONS)).toEqual([]);
  });

  it("names the app and the account, says what stops and lists what watches it, for the last account", () => {
    const only = { id: "c1", accountLabel: "me@gmail.com", status: "active" as const };
    const copy = disconnectCopy(gmail([only]), only, AUTOMATIONS);
    expect(copy.title).toBe("Disconnect Gmail (me@gmail.com)?");
    expect(copy.stops).toBe("Tex can no longer read or do anything in Gmail, and anything that watches it stops until you connect it again.");
    expect(copy.watching.map((a) => a.title)).toEqual(["Tell me about invoices"]);
    expect(copy.confirmLabel).toBe("Disconnect Gmail");
    expect(copy.done).toEqual({ title: "Gmail disconnected", body: "me@gmail.com is no longer connected to Tex." });
  });

  it("with another working account left, says Tex goes on with it and lists nothing", () => {
    const work = { id: "c1", accountLabel: "me@work.com", status: "active" as const };
    const home = { id: "c2", accountLabel: "me@gmail.com", status: "active" as const };
    const copy = disconnectCopy(gmail([work, home]), home, AUTOMATIONS);
    expect(copy.stops).toBe("Tex stops using this account and goes on with your other Gmail account (me@work.com).");
    expect(copy.watching).toEqual([]);
  });

  it("counts an expired account as none left, and says so for an account that isn't working", () => {
    const expired = { id: "c1", accountLabel: "old@gmail.com", status: "expired" as const };
    const live = { id: "c2", accountLabel: "me@gmail.com", status: "active" as const };
    expect(disconnectCopy(gmail([expired, live]), live, AUTOMATIONS).watching.map((a) => a.id)).toEqual(["a1"]);
    expect(disconnectCopy(gmail([expired]), expired, AUTOMATIONS).stops).toMatch(/^This account isn’t working right now/);
  });

  it("does without an account's name", () => {
    const nameless = { id: "c1", accountLabel: null, status: "active" as const };
    const copy = disconnectCopy(gmail([nameless]), nameless);
    expect(copy.title).toBe("Disconnect Gmail?");
    expect(copy.done.body).toBe("Tex no longer has access to Gmail.");
    expect(copy.watching).toEqual([]);
  });
});

describe("an account's status line", () => {
  it("says Reconnect needed for an expired or failed connection, Connected only for a working one", () => {
    expect(CONNECTION_STATUS_LINE.active).toBe("Connected");
    expect(CONNECTION_STATUS_LINE.expired).toMatch(/^Reconnect needed: the sign-in expired/);
    expect(CONNECTION_STATUS_LINE.error).toMatch(/^Reconnect needed: it stopped working/);
  });
});
