import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AutomationStep } from "@/lib/api/client";
import { automationFlow } from "@/lib/automation-flow";
import { chainNodes, FlowChain } from "./flow-chain";

// An automation as connected boxes on its card: when it runs → what Tex does (with the apps it is
// connected to and the rule for asking) → where the results go, for today's five steps and for an
// automation with up to six steps in between.

const NOW = new Date("2026-10-01T14:30:00");
const base = {
  kind: "repeat" as const,
  title: "Daily briefing",
  instruction: "Give me a short briefing for today.",
  runAt: null,
  cron: "0 8 * * *",
  timezone: "Asia/Kolkata",
  preset: null,
  copyTo: "telegram" as const,
  nextRunAt: null,
  lastRunAt: null,
  askFirst: "risky" as const,
  apps: ["googlecalendar", "gmail"],
  enabled: true,
};

describe("the card's boxes", () => {
  it("fold the apps and the rule for asking into Tex's box", () => {
    const nodes = chainNodes(automationFlow(base, "Asia/Kolkata", NOW));
    expect(nodes.map((node) => node.label)).toEqual(["When", "Tex does", "Results"]);
    expect(nodes[1]).toMatchObject({ title: "Give me a short briefing for today.", apps: ["googlecalendar", "gmail"], flags: ["Asks first"] });
    expect(nodes[2].apps).toEqual(["telegram"]);
  });

  it("say “any of your connected apps” when none is named", () => {
    const nodes = chainNodes(automationFlow({ ...base, apps: [] }, "Asia/Kolkata", NOW));
    expect(nodes[1].quiet).toBe("Any of your connected apps");
  });

  it("draw each step of an automation with steps as its own box: its app, its lock, its “only if”", () => {
    const step = (n: number, more: Partial<AutomationStep> = {}): AutomationStep => ({
      id: `s${n}`,
      type: n % 2 ? "action" : "tex",
      title: `Do thing ${n}`,
      app: n % 2 ? "gmail" : null,
      action: n % 2 ? "GMAIL_FETCH_EMAILS" : null,
      inputs: {},
      instruction: n % 2 ? null : "Pick the urgent ones",
      readApps: n % 2 ? [] : ["slack"],
      askFirst: false,
      onlyIf: { kind: "always" },
      showResult: false,
      risky: false,
      ...more,
    });
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const steps = Array.from({ length: count }, (_, i) => step(i + 1, i === 1 ? { onlyIf: { kind: "mentions", words: ["urgent"] } } : i === 2 ? { askFirst: true, risky: true } : {}));
      const nodes = chainNodes(automationFlow({ ...base, apps: [], steps }, "Asia/Kolkata", NOW));
      expect(nodes[0].label).toBe("When");
      expect(nodes.at(-1)!.label).toBe("Results");
      expect(nodes.length).toBe(Math.min(count, 3) + 2);
      expect(nodes[1]).toMatchObject({ label: "Step 1 · Gmail", apps: ["gmail"] });
      if (count >= 2) expect(nodes[2]).toMatchObject({ label: "Step 2 · Tex", apps: ["slack"], condition: "only if: mentions “urgent”" });
      if (count === 3) expect(nodes[3].flags).toEqual(["Always asks first"]);
      if (count > 3) expect(nodes.at(-2)!.title).toBe(`+ ${count - 2} more steps`);
    }
  });

  it("are drawn as a list a screen reader hears in full, with the apps as chips", () => {
    const html = renderToStaticMarkup(createElement(FlowChain, { steps: automationFlow(base, "Asia/Kolkata", NOW), kind: "repeat", health: new Map([["gmail", "reconnect" as const]]) }));
    expect(html).toContain('aria-label="How it runs"');
    expect(html).toContain("Trigger: Every day at 8:00 AM, your time");
    expect(html).toContain("Google Calendar");
    expect(html).toContain("Gmail: disconnected: reconnect it");
  });
});
