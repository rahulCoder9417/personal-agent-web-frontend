// Claude Code's model and thinking effort, as the settings offer them. The backend says what can
// be chosen (`claudeChoices`): every model, its group, the levels it takes and a note. Null in the
// settings is Claude Code's own default.

import type { AgentSettings, ClaudeEffort } from "./api/client";
import { titleCase } from "./format";

/**
 * One option of a select. The empty value is "Default": null in the settings. `group` is the
 * heading the option is listed under (none for Default); `note` is a short word to show with it.
 */
export type SelectOption = { value: string; label: string; group?: string; note?: string };

/** Options listed one after another under the same heading (none: no heading). */
export type OptionGroup = { label: string | null; options: SelectOption[] };

export type ClaudeModelChoice = AgentSettings["claudeChoices"]["models"][number];

export const DEFAULT_OPTION: SelectOption = { value: "", label: "Default" };

const EFFORT_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

const GROUP_LABEL: Record<string, string> = {
  current: "Current models",
  older: "Older models",
};

/** "xhigh" → "Extra high"; a level the app doesn't know yet reads as the backend names it. */
export function effortLabel(effort: string): string {
  return EFFORT_LABEL[effort] ?? titleCase(effort);
}

/** "older" → "Older models"; a group the app doesn't know yet reads as the backend names it. */
export function groupLabel(group: string): string {
  return GROUP_LABEL[group] ?? titleCase(group);
}

type Choices = Pick<AgentSettings, "claudeModel" | "claudeEffort" | "claudeChoices">;

/** A saved value the backend no longer offers still shows, so the select says what is set. */
function withSaved(options: SelectOption[], saved: string | null, label: (value: string) => string): SelectOption[] {
  if (!saved || options.some((option) => option.value === saved)) return options;
  return [...options, { value: saved, label: label(saved) }];
}

/** The "Model" select: "Default" first, then the models in the backend's order, under their group. */
export function modelOptions(settings: Choices): SelectOption[] {
  const models = settings.claudeChoices.models.map((model) => ({
    value: model.id,
    label: model.label,
    // An older backend sends no group, levels or note: the web app can go live before it.
    ...(model.group ? { group: groupLabel(model.group) } : {}),
    ...(model.note ? { note: model.note } : {}),
  }));
  return [DEFAULT_OPTION, ...withSaved(models, settings.claudeModel, (id) => id)];
}

/** Options split where the heading changes, in order, for a select with headings. */
export function optionGroups(options: SelectOption[]): OptionGroup[] {
  const groups: OptionGroup[] = [];
  for (const option of options) {
    const label = option.group ?? null;
    const last = groups.at(-1);
    if (last && last.label === label) last.options.push(option);
    else groups.push({ label, options: [option] });
  }
  return groups;
}

/** The chosen model as the backend lists it; undefined for Default or a model it no longer offers. */
export function chosenModel(settings: Choices): ClaudeModelChoice | undefined {
  return settings.claudeChoices.models.find((model) => model.id === settings.claudeModel);
}

/**
 * The levels the chosen model takes. Default, or a model the backend no longer lists: every level
 * (Claude Code's default model takes them all).
 */
export function modelEfforts(settings: Choices): ClaudeEffort[] {
  return chosenModel(settings)?.efforts ?? settings.claudeChoices.efforts;
}

/** The effort means something for the chosen model (Opus 4.5 and Haiku 4.5 take none). */
export function effortApplies(settings: Choices): boolean {
  return modelEfforts(settings).length > 0;
}

/** The "Thinking effort" select: "Default" first, then the levels the chosen model takes. */
export function effortOptions(settings: Choices): SelectOption[] {
  const efforts = modelEfforts(settings).map((effort) => ({ value: effort, label: effortLabel(effort) }));
  return [DEFAULT_OPTION, ...withSaved(efforts, settings.claudeEffort, effortLabel)];
}

/** The level a model runs a level it doesn't take at: the nearest lower one it does take. */
function runsAt(effort: ClaudeEffort, takes: ClaudeEffort[], ladder: ClaudeEffort[]): ClaudeEffort | undefined {
  const lower = ladder.slice(0, Math.max(ladder.indexOf(effort), 0)).reverse();
  return lower.find((level) => takes.includes(level)) ?? takes[0];
}

/** What to say under the selects about the chosen model and effort, if anything. */
export function choiceNotes(settings: Choices): string[] {
  const model = chosenModel(settings);
  if (!model) return [];
  const notes = model.note ? [`${model.label}: ${model.note}`] : [];
  const effort = settings.claudeEffort;
  const takes = modelEfforts(settings);
  if (takes.length === 0) {
    notes.push(`${model.label} has no thinking effort, so this setting doesn’t apply to it.`);
  } else if (effort && !takes.includes(effort)) {
    const level = runsAt(effort, takes, settings.claudeChoices.efforts);
    if (level) notes.push(`${model.label} doesn’t take ${effortLabel(effort)}: it thinks at ${effortLabel(level)}.`);
  }
  return notes;
}

/** A select's value as the API takes it: "Default" is null. */
export function choiceValue<T extends string>(value: string): T | null {
  return value === "" ? null : (value as T);
}
