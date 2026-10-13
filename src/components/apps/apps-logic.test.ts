import { describe, expect, it } from "vitest";
import { ApiError, type App } from "@/lib/api/client";
import {
  appsToOffer,
  categoriesOf,
  connectCopy,
  connectOutcome,
  describeConnectError,
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
    expect(copy.points[0]!.text).toBe("Before Tex sends, deletes or changes something that’s already there, it asks you first.");
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
