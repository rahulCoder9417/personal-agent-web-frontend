"use client";

import { useId, useState, type ReactNode } from "react";
import { Select } from "@/components/select";
import { toastError } from "@/components/toast";
import { Card } from "@/components/ui";
import type { AgentSettings, ClaudeEffort } from "@/lib/api/client";
import { useUpdateClaudeCode, useUpdateClaudeCrew } from "@/lib/api/hooks";
import {
  choiceNotes,
  choiceValue,
  CREW_HINT,
  CREW_ROWS,
  crewChoicesOffered,
  crewEffortApplies,
  crewEffortOptions,
  crewModelOptions,
  crewNotes,
  effortApplies,
  effortOptions,
  modelOptions,
  optionGroups,
  type CrewMemberId,
  type SelectOption,
} from "@/lib/claude-code";
import type { ListItem, ListOption } from "@/lib/listbox";
import { CLAUDE_PLAN_ANCHOR } from "./agent-claude";
import { SettingRow } from "./settings-rows";

// Settings → Agent & AI → Crew: the Claude model and thinking effort of Tex and of each of the
// crew, on Claude Code. Each change is saved as it is made. On Hermes the crew shares one model,
// so there the crew's rows give way to a note.

// From a card 620px wide, a member's two dropdowns sit beside its name, under one heading per
// column (`@min-[620px]:`); narrower, they go under the name with a caption each.

/** The options as the dropdown takes them: under their headings, with a model's note as its second line. */
function listItems(options: SelectOption[]): ListItem[] {
  return optionGroups(options).flatMap((group): ListItem[] => {
    const items: ListOption[] = group.options.map(({ value, label, note }) => (note ? { value, label, description: note } : { value, label }));
    return group.label ? [{ label: group.label, options: items }] : items;
  });
}

/** "Saved", after the line of the member whose choice was just saved. */
function SavedNote() {
  return (
    <span role="status" className="text-success">
      {" "}
      · Saved
    </span>
  );
}

type Choice = { value: string | null; options: SelectOption[]; disabled?: boolean; onChange: (value: string) => void };

/** One dropdown of a member's row, named for the member ("Byte’s model"). Its caption shows while the row is stacked. */
function ChoiceField({ id, caption, who, choice }: { id: string; caption: string; who: string; choice: Choice }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[12px] text-muted @min-[620px]:sr-only">
        <span className="sr-only">{who}’s </span>
        {caption}
      </label>
      <Select
        id={id}
        label={`${who}’s ${caption.toLowerCase()}`}
        value={choice.value ?? ""}
        options={listItems(choice.options)}
        disabled={choice.disabled}
        onChange={choice.onChange}
        minListWidth={300}
      />
    </div>
  );
}

/** One of the crew: who it is and what it does, then its model and its thinking effort. */
function MemberRow({ name, does, saved, model, effort }: { name: string; does: string; saved: boolean; model: Choice; effort: Choice }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0 @min-[620px]:flex-row @min-[620px]:items-center @min-[620px]:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-medium">{name}</span>
        <span className="text-[12.5px] text-muted">
          {does}
          {saved && <SavedNote />}
        </span>
      </div>
      <div className="grid min-w-0 gap-2.5 @min-[440px]:grid-cols-2 @min-[620px]:w-[460px] @min-[620px]:shrink-0 @min-[620px]:grid-cols-[6fr_5fr]">
        <ChoiceField id={`${id}-model`} caption="Model" who={name} choice={model} />
        <ChoiceField id={`${id}-effort`} caption="Thinking effort" who={name} choice={effort} />
      </div>
    </div>
  );
}

/** Above the rows, while they are a table: what each column is. */
function ColumnHeads() {
  return (
    <div aria-hidden className="hidden border-b border-line px-5 pt-3 pb-2 @min-[620px]:flex @min-[620px]:gap-6">
      <span className="flex-1" />
      <span className="grid w-[460px] shrink-0 grid-cols-[6fr_5fr] gap-2.5 text-[12px] text-muted">
        <span>Model</span>
        <span>Thinking effort</span>
      </span>
    </div>
  );
}

/** Instead of the crew's dropdowns, where they don't apply. */
function SharedModelNote({ connected }: { connected: boolean }) {
  if (connected) {
    return <SettingRow label="Byte, Patch and Scout" help="On Hermes they share one model. Each gets its own here once Claude Code is the engine." />;
  }
  return (
    <SettingRow
      label="One model for everyone"
      help="On Hermes, Tex and the crew share one model. With your Claude plan on Claude Code, you choose one for each."
    >
      <div className="flex sm:justify-end">
        <a href={`#${CLAUDE_PLAN_ANCHOR}`} className="text-[13px] font-medium text-accent hover:text-accent-dark">
          Connect your Claude plan
        </a>
      </div>
    </SettingRow>
  );
}

/** The crew's rows are shown: a Claude plan is connected and Claude Code runs. */
export function crewRowsShown(settings: AgentSettings): boolean {
  return settings.claude.connected && settings.effectiveRuntime === "claude_code";
}

/**
 * The Crew card: one row per member, Tex first (the lead, as Settings had it), each with a model and
 * a thinking effort, "Default (…)" first. Tex's row stays for a connected plan whatever runs, as
 * before; the crew's need Claude Code, and on Hermes a note says why they aren't there.
 */
export function CrewModels({ settings }: { settings: AgentSettings }) {
  const updateTex = useUpdateClaudeCode();
  const updateCrew = useUpdateClaudeCrew();
  // Who was saved last, to say so on that row only.
  const [saved, setSaved] = useState<"tex" | CrewMemberId | null>(null);
  // The select goes back to what is saved when a change is refused; the toast says why.
  const handlers = (who: "tex" | CrewMemberId) => ({
    onSuccess: () => setSaved(who),
    onError: (error: unknown) => {
      setSaved(null);
      toastError("Couldn’t save that choice", error);
    },
  });
  const connected = settings.claude.connected;
  const crewShown = crewRowsShown(settings) && crewChoicesOffered(settings);

  const texNotes = connected ? choiceNotes(settings) : [];
  const notes = crewShown ? [...texNotes, ...crewNotes(settings, texNotes)] : texNotes;

  const rows: ReactNode[] = [];
  if (connected) {
    rows.push(
      <MemberRow
        key="tex"
        name="Tex"
        does={CREW_ROWS[0].does}
        saved={saved === "tex"}
        model={{ value: settings.claudeModel, options: modelOptions(settings), onChange: (value) => updateTex.mutate({ claudeModel: choiceValue(value) }, handlers("tex")) }}
        effort={{
          value: settings.claudeEffort,
          options: effortOptions(settings),
          disabled: !effortApplies(settings),
          onChange: (value) => updateTex.mutate({ claudeEffort: choiceValue<ClaudeEffort>(value) }, handlers("tex")),
        }}
      />,
    );
  }
  if (crewShown) {
    for (const row of CREW_ROWS) {
      if (row.id === "tex") continue;
      const member = row.id;
      const choice = settings.claudeCrew[member];
      rows.push(
        <MemberRow
          key={member}
          name={row.name}
          does={row.does}
          saved={saved === member}
          model={{
            value: choice.model,
            options: crewModelOptions(settings, member),
            onChange: (value) => updateCrew.mutate({ [member]: { model: choiceValue(value) } }, handlers(member)),
          }}
          effort={{
            value: choice.effort,
            options: crewEffortOptions(settings, member),
            disabled: !crewEffortApplies(settings, member),
            onChange: (value) => updateCrew.mutate({ [member]: { effort: choiceValue<ClaudeEffort>(value) } }, handlers(member)),
          }}
        />,
      );
    }
  } else if (!crewRowsShown(settings)) {
    rows.push(<SharedModelNote key="shared" connected={connected} />);
  }

  return (
    <Card className="@container">
      {connected && <ColumnHeads />}
      {rows}
      {notes.length > 0 && (
        // What the chosen models and efforts come to, at the foot of the card.
        <div className="flex flex-col gap-1 rounded-b-[11px] bg-surface-2/60 px-5 py-3 text-[12.5px] text-muted">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

/** The line under the Crew heading: the hint while there are models to choose, else nothing. */
export function crewDescription(settings: AgentSettings): string | undefined {
  return settings.claude.connected ? CREW_HINT : undefined;
}
