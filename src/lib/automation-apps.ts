// The apps an automation is connected to, and whether each still works: what the logo chips on an
// automation's card, its canvas and its page show, and what the "Reconnect" prompt is drawn from.
// An automation needs the app its trigger watches (GitHub for pull-request review) and the apps its
// runs may use (`apps`), or, with steps, the apps its steps name. Nothing here draws.

import type { App } from "./api/client";
import { flowApps, hasSteps, steppedApps, type FlowSource } from "./automation-flow";
import { titleCase } from "./format";

/**
 * How one app stands for the person: `ok` (a working account, on the plan), `reconnect` (connected
 * once, but no account works now: a sign-in expired or failed), `connect` (never connected, or every
 * account removed), `plan` (connected, but the plan no longer includes it), or `unknown` (the apps
 * haven't loaded, or the catalog doesn't have it).
 */
export type AppHealth = "ok" | "reconnect" | "connect" | "plan" | "unknown";

export type AppLink = {
  slug: string;
  name: string;
  health: AppHealth;
  /** The catalog's app, for the connect screen. Null when it isn't in the catalog. */
  app: App | null;
};

export function appHealth(slug: string, apps: readonly App[] | undefined): { health: AppHealth; app: App | null } {
  if (!apps) return { health: "unknown", app: null };
  const app = apps.find((item) => item.slug === slug.toLowerCase()) ?? null;
  if (!app) return { health: "unknown", app: null };
  const working = app.connections.some((connection) => connection.status === "active");
  if (working) return { health: app.availableOnPlan ? "ok" : "plan", app };
  return { health: app.connections.length > 0 ? "reconnect" : "connect", app };
}

/**
 * Each app the automation is connected to, the trigger's first, with how it stands. With steps:
 * the trigger's app, then each step's app (an action's, or what a Tex step reads).
 */
export function automationApps(source: Pick<FlowSource, "trigger" | "apps" | "preset" | "steps">, apps: readonly App[] | undefined): AppLink[] {
  const slugs = hasSteps(source) && source.preset !== "pr_review" ? steppedApps(source) : flowApps(source);
  return slugs.map((slug) => {
    const { health, app } = appHealth(slug, apps);
    return { slug, name: app?.name ?? titleCase(slug), health, app };
  });
}

/** The apps that need the person before the automation can work again: reconnect, connect or a plan. */
export function brokenApps(links: readonly AppLink[]): AppLink[] {
  return links.filter((link) => link.health === "reconnect" || link.health === "connect" || link.health === "plan");
}

/** What the prompt says about the apps that don't work, in one sentence. */
export function brokenAppsLine(broken: readonly AppLink[]): string | null {
  if (broken.length === 0) return null;
  const names = broken.map((link) => link.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const one = broken.length === 1;
  if (broken.every((link) => link.health === "reconnect"))
    return `${list} ${one ? "is" : "are"} disconnected: the sign-in stopped working, so runs that need ${one ? "it" : "them"} will fail. Reconnect to fix it.`;
  if (broken.every((link) => link.health === "plan")) return `Your plan no longer includes ${list}, so runs that need ${one ? "it" : "them"} will fail.`;
  return `${list} ${one ? "isn’t" : "aren’t"} connected, so runs that need ${one ? "it" : "them"} will fail. Connect ${one ? "it" : "them"} to fix it.`;
}
