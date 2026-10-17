// Claude Code's model and thinking effort, as the settings offer them. The backend says what can
// be chosen (`claudeChoices`): every model, its group, the levels it takes and a note. Null in the
// settings is "Default": for Tex, Sonnet 5.5 at low effort, for quick answers (the Bridge, in the
// vm-manager); an effort left on Default with a chosen model is Claude Code's own for that model.
// Byte, Patch and Scout each have their own choice (`claudeCrew`). What Default is for each, the
// backend says for this user (`claudeChoices.crewDefaults`): the same as Tex when a model is picked
// for Tex; with Tex on Default, Byte and Patch on Opus 5.5 at medium. Scout: always Tex's.

import type { AgentSettings, AgentSettingsUpdate, ClaudeEffort } from "./api/client";
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

/** "Default" in the Model select, saying what it runs. */
export const DEFAULT_MODEL_OPTION: SelectOption = { value: "", label: "Default (Sonnet 5.5, quick)" };

/** "Default" in the Thinking effort select while the model is on Default too: low. */
export const DEFAULT_EFFORT_OPTION: SelectOption = { value: "", label: "Default (Low)" };

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
  return [DEFAULT_MODEL_OPTION, ...withSaved(models, settings.claudeModel, (id) => id)];
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
  const fallback = settings.claudeModel ? DEFAULT_OPTION : DEFAULT_EFFORT_OPTION;
  return [fallback, ...withSaved(efforts, settings.claudeEffort, effortLabel)];
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

// ---------------------------------------------------------------- the crew

/** A crew member whose model and effort can be chosen (Tex, the lead, has the fields above). */
export type CrewMemberId = keyof AgentSettings["claudeCrew"];
type CrewChoice = AgentSettings["claudeCrew"][CrewMemberId];
/** What `PATCH /v1/agent/settings` takes for the crew: only the members and fields sent change. */
export type CrewPatch = NonNullable<AgentSettingsUpdate["claudeCrew"]>;

/** The lead and the crew, in the order the settings list them, each with what it does. */
export const CREW_ROWS: { id: "tex" | CrewMemberId; name: string; does: string }[] = [
  { id: "tex", name: "Tex", does: "Leads, talks to you" },
  { id: "byte", name: "Byte", does: "Writes code" },
  { id: "patch", name: "Patch", does: "Reviews code" },
  { id: "scout", name: "Scout", does: "Researches and uses the browser" },
];

/** The one hint under the crew's choices. */
export const CREW_HINT = "Faster models answer sooner; stronger ones are more careful on hard code.";

type CrewChoices = Pick<AgentSettings, "claudeModel" | "claudeEffort" | "claudeChoices"> & {
  // An older backend sends neither: the web app can go live before it.
  claudeCrew?: AgentSettings["claudeCrew"];
};

/** The backend takes a model and effort for each crew member (an older one doesn't). */
export function crewChoicesOffered(settings: CrewChoices): boolean {
  return Boolean(settings.claudeCrew && settings.claudeChoices.crewDefaults);
}

const NO_CHOICE: CrewChoice = { model: null, effort: null };

function crewChoice(settings: CrewChoices, member: CrewMemberId): CrewChoice {
  return settings.claudeCrew?.[member] ?? NO_CHOICE;
}

function crewDefault(settings: CrewChoices, member: CrewMemberId): CrewChoice {
  return settings.claudeChoices.crewDefaults?.[member] ?? NO_CHOICE;
}

const modelLabel = (settings: CrewChoices, id: string) => settings.claudeChoices.models.find((model) => model.id === id)?.label ?? id;

/**
 * The "Default" options of a member's two selects, saying what Default runs: its own model and
 * effort (Byte and Patch with Tex on Default: Opus 5.5 at medium), or Tex's.
 */
export function crewDefaultOptions(settings: CrewChoices, member: CrewMemberId): { model: SelectOption; effort: SelectOption } {
  const own = crewDefault(settings, member);
  return {
    model: { value: "", label: own.model ? `Default (${modelLabel(settings, own.model)})` : "Default (same as Tex)" },
    effort: { value: "", label: own.effort ? `Default (${effortLabel(own.effort)})` : "Default (same as Tex)" },
  };
}

/** The member's settings in the shape of Tex's, so the rules above apply to it as they are. */
function asChoices(settings: CrewChoices, member: CrewMemberId): Choices {
  return { claudeModel: crewChoice(settings, member).model, claudeEffort: crewChoice(settings, member).effort, claudeChoices: settings.claudeChoices };
}

/** A member's "Model" select: its Default first, then the models as for Tex. */
export function crewModelOptions(settings: CrewChoices, member: CrewMemberId): SelectOption[] {
  return [crewDefaultOptions(settings, member).model, ...modelOptions(asChoices(settings, member)).slice(1)];
}

/**
 * The levels the member's model takes: the chosen one's; on Default, its default model's, or Tex's
 * when it runs as Tex does (Scout).
 */
export function crewEfforts(settings: CrewChoices, member: CrewMemberId): ClaudeEffort[] {
  const chosen = crewChoice(settings, member).model ?? crewDefault(settings, member).model;
  if (!chosen) return modelEfforts(settings);
  return settings.claudeChoices.models.find((model) => model.id === chosen)?.efforts ?? settings.claudeChoices.efforts;
}

/** The effort means something for the member's model (Opus 4.5 and Haiku 4.5 take none). */
export function crewEffortApplies(settings: CrewChoices, member: CrewMemberId): boolean {
  return crewEfforts(settings, member).length > 0;
}

/** A member's "Thinking effort" select: its Default first, then the levels its model takes. */
export function crewEffortOptions(settings: CrewChoices, member: CrewMemberId): SelectOption[] {
  const efforts = crewEfforts(settings, member).map((effort) => ({ value: effort, label: effortLabel(effort) }));
  return [crewDefaultOptions(settings, member).effort, ...withSaved(efforts, crewChoice(settings, member).effort, effortLabel)];
}

/**
 * What to say under the selects about the crew's chosen models and efforts: a model's note once,
 * however many use it (Tex's notes come first and are not said again), and an effort that doesn't
 * apply, by member.
 */
export function crewNotes(settings: CrewChoices, already: string[] = []): string[] {
  const notes: string[] = [];
  const said = new Set(already);
  for (const row of CREW_ROWS) {
    if (row.id === "tex") continue;
    for (const note of choiceNotes(asChoices(settings, row.id))) {
      // A model's own note ("Fable 5.1: …") is the same for everyone; the others are about this member.
      const line = settings.claudeChoices.models.some((model) => model.note && note === `${model.label}: ${model.note}`) ? note : `${row.name}: ${note}`;
      if (!said.has(line)) {
        said.add(line);
        notes.push(line);
      }
    }
  }
  return notes;
}

/** The settings with a crew change applied, as the API will answer it (to show it at once). */
export function withCrewPatch<T extends CrewChoices>(settings: T, patch: CrewPatch): T {
  if (!settings.claudeCrew) return settings;
  const crew = { ...settings.claudeCrew };
  for (const member of Object.keys(patch) as CrewMemberId[]) {
    const change = patch[member];
    if (!change || !crew[member]) continue;
    crew[member] = {
      model: change.model !== undefined ? change.model : crew[member].model,
      effort: change.effort !== undefined ? change.effort : crew[member].effort,
    };
  }
  return { ...settings, claudeCrew: crew };
}
