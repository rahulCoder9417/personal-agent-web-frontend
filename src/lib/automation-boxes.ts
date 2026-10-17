// What each box on the canvas says, in a few words: the trigger's mark, its name and when it runs;
// a step's second line; the pill on the line into a step with an "only if". Nothing here draws.

import type { AutomationStep, AutomationStepCondition } from "./api/client";
import type { WhenMode } from "./automation-editor";
import { triggerSettings, type FlowSource } from "./automation-flow";
import { describeAutomationWhen, describeTrigger } from "./automations";
import { listNames, titleCase } from "./format";

export type BoxText = { logo: string; label: string; title: string; line: string | null };

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Your time, Asia/Kolkata", or the place's own name when it isn't the person's. */
function zoneLine(zone: string | null | undefined, accountZone: string | null | undefined): string | null {
  if (!zone) return null;
  return zone === accountZone ? `Your time, ${zone}` : `${zone.split("/").pop()?.replace(/_/g, " ")} time, ${zone}`;
}

/**
 * The trigger's box: its mark (a schedule's clock, a moment's calendar, or the app), its name, when
 * it runs ("Every day at 9:00 AM", "A new email arrives"), and a line (the time zone, or what the
 * app watches). While nothing is picked, it asks for it.
 */
export function triggerText(source: FlowSource, mode: WhenMode | null, accountZone?: string | null, now = new Date()): BoxText {
  if (source.preset === "pr_review") return { logo: "github", label: "GitHub", title: "A pull request opens or gets new commits", line: null };
  if (!mode) return { logo: "schedule", label: "Start when", title: "Pick when it runs", line: "Once, on a schedule or on an app event" };
  if (mode === "event") {
    const app = source.trigger?.app;
    if (!app) return { logo: "schedule", label: "An app event", title: "Pick an app and what happens", line: null };
    const name = titleCase(app);
    if (!source.trigger?.event) return { logo: app, label: name, title: "Pick what happens", line: null };
    const words = describeTrigger(source.trigger).replace(/^When /, "");
    const title = capital(words.endsWith(` in ${name}`) ? words.slice(0, -` in ${name}`.length) : words);
    const setting = triggerSettings(source.trigger.config)[0];
    return { logo: app, label: name, title, line: setting ? `${setting.label}: ${setting.value}` : "Each time it happens" };
  }
  const when = describeAutomationWhen(source, accountZone, now).replace(/, [^,]* time$/, "").replace(/, your time$/, "");
  if (mode === "once") return { logo: "once", label: "Once", title: capital(when.replace(/^Once, /, "")), line: zoneLine(source.timezone, accountZone) };
  return { logo: "schedule", label: "Schedule", title: when, line: zoneLine(source.timezone, accountZone) };
}

/**
 * A step's second line: an app step's first fixed input ("query: is:unread"), else what its action
 * does (from its app's list); a Tex step's instruction when the box isn't named after it, else the
 * apps it reads.
 */
export function stepLine(step: Pick<AutomationStep, "type" | "title" | "inputs" | "instruction" | "readApps">, actionDescription?: string | null): string | null {
  if (step.type === "action") {
    const [first] = Object.entries(step.inputs ?? {});
    if (first) return `${first[0]}: ${Array.isArray(first[1]) ? first[1].join(", ") : typeof first[1] === "object" ? JSON.stringify(first[1]) : String(first[1])}`;
    return actionDescription?.trim() || null;
  }
  const instruction = step.instruction?.trim() ?? "";
  const firstLine = instruction.split(/\n/)[0] ?? "";
  // A box with no name of its own is named after its instruction's first words ("…" where cut).
  const named = !firstLine.startsWith(step.title.replace(/…$/, "").trim());
  if (firstLine && named) return firstLine;
  if (step.readApps.length) return `Reads ${listNames(step.readApps.map(titleCase), "and")}`;
  return null;
}

const quote = (word: string) => `“${word}”`;

/** The pill on the line into a step with an "only if": "Only if the step before found something". Null for none, and for step 1. */
export function conditionPill(onlyIf: Pick<AutomationStepCondition, "kind" | "words" | "question"> | null | undefined, index: number): string | null {
  if (!onlyIf || index === 0) return null;
  switch (onlyIf.kind) {
    case "found":
      return "Only if the step before found something";
    case "mentions": {
      const words = onlyIf.words ?? [];
      if (words.length === 0) return "Only if it mentions… (no words yet)";
      return `Only if it mentions ${listNames(words.slice(0, 2).map(quote), "or")}${words.length > 2 ? ` +${words.length - 2}` : ""}`;
    }
    case "tex":
      return "Only if Tex says yes";
    default:
      return null;
  }
}

/**
 * The condition box the canvas draws on the line into a step with an "only if": its name ("Only if:
 * found something") and its line (what happens otherwise, or Tex's question). Null for none, and
 * for step 1.
 */
export function conditionBox(onlyIf: Pick<AutomationStepCondition, "kind" | "words" | "question"> | null | undefined, index: number): { title: string; line: string } | null {
  if (!onlyIf || index === 0) return null;
  const otherwise = "Otherwise the run stops here";
  switch (onlyIf.kind) {
    case "found":
      return { title: "Only if: found something", line: otherwise };
    case "mentions": {
      const words = onlyIf.words ?? [];
      if (words.length === 0) return { title: "Only if: it mentions… (no words yet)", line: otherwise };
      return { title: `Only if: it mentions ${listNames(words.slice(0, 2).map(quote), "or")}${words.length > 2 ? ` +${words.length - 2}` : ""}`, line: otherwise };
    }
    case "tex": {
      const question = onlyIf.question?.trim();
      return { title: "Only if: Tex says yes", line: question ? quote(question) : otherwise };
    }
    default:
      return null;
  }
}
