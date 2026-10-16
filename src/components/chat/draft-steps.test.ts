import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { automationFlow, type FlowSource, type FlowStep } from "@/lib/automation-flow";
import { DraftSteps } from "./draft-steps";

// The steps in a draft's card: one badge per step in a column, a line between each two, the step's
// name above what it says. It takes one step or many: today's five, or a trigger, six steps and the
// results of an automation with steps.

const source: FlowSource = {
  kind: "repeat",
  title: "Daily pending PR email",
  instruction: "Every day at 5:20 AM IST, check GitHub for any open pull requests. Then send an email to me.",
  runAt: null,
  cron: "20 5 * * *",
  timezone: "Asia/Kolkata",
  preset: null,
  copyTo: null,
  nextRunAt: null,
  lastRunAt: null,
  askFirst: "risky",
  trigger: null,
  apps: ["github", "gmail"],
};
const five = automationFlow(source, "Asia/Kolkata");
const [trigger, instruction, apps, , results] = five;

function draw(steps: readonly FlowStep[], heading?: string) {
  return renderToStaticMarkup(createElement(DraftSteps, { steps, kind: "repeat", heading }));
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const count = (html: string, mark: string) => html.split(mark).length - 1;

afterEach(() => vi.restoreAllMocks());

describe("the steps in a draft's card", () => {
  it("draws one step alone, with no line", () => {
    const html = draw([trigger]);
    expect(count(html, "data-badge")).toBe(1);
    expect(count(html, "data-line")).toBe(0);
    expect(text(html)).toContain("Trigger Every day at 5:20 AM, your time");
  });

  it("draws a trigger, six steps and the results in one column, a line between each two", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const stepsOf = Array.from({ length: 6 }, (_, i): FlowStep =>
      i % 2 === 0
        ? { ...instruction, label: `Step ${i + 1}`, title: `Tex step ${i + 1}`, lines: [`Read the inbox, part ${i + 1}`] }
        : { ...apps, label: `Step ${i + 1}`, title: "Send an email", apps: ["gmail"] },
    );
    const html = draw([trigger, ...stepsOf, results], source.title);
    expect(count(html, "data-badge")).toBe(8);
    expect(count(html, "data-line")).toBe(7);
    const words = text(html);
    for (let i = 1; i <= 6; i++) expect(words).toContain(`Step ${i}`);
    // A step's own title stays, also on an app's action, which names its app in a chip.
    expect(words).toContain("Tex step 1 Read the inbox, part 1");
    expect(words).toContain("Send an email Gmail");
    // Several of Tex's and the apps' boxes: no clash of keys.
    expect(error).not.toHaveBeenCalled();
  });

  it("puts each step's name above what it says, and doesn't repeat the card's title", () => {
    const html = draw(five, source.title);
    expect(count(html, "data-badge")).toBe(5);
    const words = text(html);
    expect(words).not.toContain(source.title);
    expect(words).toContain(`Tex’s instruction ${source.instruction}`);
    // The apps as chips, not as a sentence.
    expect(words).not.toContain("GitHub and Gmail");
    expect(html).toMatch(/<ul aria-label="Apps"[^>]*><li[^>]*>.*GitHub<\/li><li[^>]*>.*Gmail<\/li><\/ul>/);
    // The instruction is cut to three lines.
    expect(html).toContain("line-clamp-3");
  });

  it("names the instruction when the card shows no title", () => {
    expect(text(draw(five))).toContain(`Tex’s instruction ${source.title} ${source.instruction}`);
  });
});
