import { describe, expect, it } from "vitest";
import type { App } from "./api/client";
import { appHealth, automationApps, brokenApps, brokenAppsLine } from "./automation-apps";

// The apps an automation is connected to, and whether each still works: what the chips and the
// Reconnect prompt are drawn from.

const app = (slug: string, statuses: ("active" | "expired" | "error")[], availableOnPlan = true): App =>
  ({
    slug,
    name: slug === "googledrive" ? "Google Drive" : slug.charAt(0).toUpperCase() + slug.slice(1),
    category: "x",
    iconUrl: null,
    availableOnPlan,
    connectable: true,
    connections: statuses.map((status, i) => ({ id: `con_${slug}_${i}`, accountLabel: "me", status })),
  }) as unknown as App;

const APPS = [app("gmail", ["active"]), app("googledrive", ["expired"]), app("slack", []), app("notion", ["active"], false), app("github", ["error", "active"])];

describe("how an app stands", () => {
  it("works with one working account on the plan; else it needs a reconnect, a connect or a plan", () => {
    expect(appHealth("gmail", APPS).health).toBe("ok");
    expect(appHealth("github", APPS).health).toBe("ok");
    expect(appHealth("googledrive", APPS).health).toBe("reconnect");
    expect(appHealth("slack", APPS).health).toBe("connect");
    expect(appHealth("notion", APPS).health).toBe("plan");
  });
  it("is unknown before the apps load, or for an app the catalog doesn't have", () => {
    expect(appHealth("gmail", undefined).health).toBe("unknown");
    expect(appHealth("linear", APPS).health).toBe("unknown");
  });
});

describe("an automation's apps", () => {
  it("are the trigger's app first, then the ones its runs may use, each once", () => {
    const links = automationApps({ trigger: { app: "gmail", event: "X", config: {} }, apps: ["googledrive", "gmail"], preset: null }, APPS);
    expect(links.map((link) => [link.slug, link.health])).toEqual([
      ["gmail", "ok"],
      ["googledrive", "reconnect"],
    ]);
    expect(automationApps({ trigger: null, apps: null, preset: "pr_review" }, APPS).map((link) => link.slug)).toEqual(["github"]);
  });
  it("names the ones that need the person, in a sentence", () => {
    const broken = brokenApps(automationApps({ trigger: null, apps: ["gmail", "googledrive"], preset: null }, APPS));
    expect(broken.map((link) => link.name)).toEqual(["Google Drive"]);
    expect(brokenAppsLine(broken)).toBe("Google Drive is disconnected: the sign-in stopped working, so runs that need it will fail. Reconnect to fix it.");
    const two = brokenApps(automationApps({ trigger: null, apps: ["slack", "googledrive"], preset: null }, APPS));
    expect(brokenAppsLine(two)).toBe("Slack and Google Drive aren’t connected, so runs that need them will fail. Connect them to fix it.");
    expect(brokenAppsLine(brokenApps(automationApps({ trigger: null, apps: ["notion"], preset: null }, APPS)))).toBe(
      "Your plan no longer includes Notion, so runs that need it will fail.",
    );
    expect(brokenAppsLine([])).toBeNull();
  });
});
