import { describe, expect, it } from "vitest";
import { ApiError, type App } from "@/lib/api/client";
import {
  appsToOffer,
  categoriesOf,
  describeConnectError,
  filterApps,
  isConnectable,
  NOT_AVAILABLE_LABEL,
  splitApps,
  toMcpServerCreate,
  validateMcpServer,
} from "./apps-logic";

const app = (slug: string, name: string, category: string, connected = false): App => ({
  slug,
  name,
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
