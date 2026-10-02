import { describe, expect, it } from "vitest";
import type { App } from "@/lib/api/client";
import { categoriesOf, filterApps, splitApps, toMcpServerCreate, validateMcpServer } from "./apps-logic";

const app = (slug: string, name: string, category: string, connected = false): App => ({
  slug,
  name,
  category,
  availableOnPlan: true,
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
