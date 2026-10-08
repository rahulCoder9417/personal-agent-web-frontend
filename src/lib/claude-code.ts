// Claude Code's model and thinking effort, as the settings offer them. The backend says what can
// be chosen (`claudeChoices`); null in the settings is Claude Code's own default.

import type { AgentSettings } from "./api/client";
import { titleCase } from "./format";

/** One option of a select. The empty value is "Default": null in the settings. */
export type SelectOption = { value: string; label: string };

export const DEFAULT_OPTION: SelectOption = { value: "", label: "Default" };

const EFFORT_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/** "xhigh" → "Extra high"; a level the app doesn't know yet reads as the backend names it. */
export function effortLabel(effort: string): string {
  return EFFORT_LABEL[effort] ?? titleCase(effort);
}

type Choices = Pick<AgentSettings, "claudeModel" | "claudeEffort" | "claudeChoices">;

/** A saved value the backend no longer offers still shows, so the select says what is set. */
function withSaved(options: SelectOption[], saved: string | null, label: (value: string) => string): SelectOption[] {
  if (!saved || options.some((option) => option.value === saved)) return options;
  return [...options, { value: saved, label: label(saved) }];
}

/** The "Model" select: "Default" first, then the models in the backend's order. */
export function modelOptions(settings: Choices): SelectOption[] {
  const models = settings.claudeChoices.models.map((model) => ({ value: model.id, label: model.label }));
  return [DEFAULT_OPTION, ...withSaved(models, settings.claudeModel, (id) => id)];
}

/** The "Thinking effort" select: "Default" first, then the levels in the backend's order. */
export function effortOptions(settings: Choices): SelectOption[] {
  const efforts = settings.claudeChoices.efforts.map((effort) => ({ value: effort, label: effortLabel(effort) }));
  return [DEFAULT_OPTION, ...withSaved(efforts, settings.claudeEffort, effortLabel)];
}

/** A select's value as the API takes it: "Default" is null. */
export function choiceValue<T extends string>(value: string): T | null {
  return value === "" ? null : (value as T);
}
