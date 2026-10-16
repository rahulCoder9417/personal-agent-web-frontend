"use client";

// The settings of one step of an automation with steps: the panel beside the canvas when its box is
// open, and the full sheet a phone opens from the step's card. What kind of step it is (an app
// action, or a Tex instruction), the app and the action (a searchable list, the ones that always ask
// first marked), the inputs the person fixes, what Tex does and may read, "ask me first" (locked on
// for an action that sends, deletes or pays), "only if" and "Show me this". Each change goes back to
// the editor, which has the server check it; its problems come back here in red.

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ApiError, type App, type AppAction, type AppEventSetting } from "@/lib/api/client";
import { useAppActions } from "@/lib/api/hooks";
import { appChoices } from "@/lib/automation-editor";
import { LOCKED_LINE, TEX_STEP_NOTE } from "@/lib/automation-flow";
import type { Lane } from "@/lib/automation-lanes";
import { conditionWords, FIRST_STEP_NOTE, MAX_READ_APPS, type ConditionKind, type EditorStep } from "@/lib/automation-steps";
import { titleCase } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { ChevronRightIcon, LockIcon } from "../icons";
import { MultiSelect } from "../multi-select";
import { RadioCards } from "../segmented-control";
import { Combobox, Select, type ListItem, type ListOption } from "../select";
import { Button, inputClass, SwitchRow } from "../ui";
import { appOptions as appListOptions, Label, Problems, SettingField, textareaClass } from "./editor-forms";

const LINK = "font-medium text-accent hover:text-accent-dark";

/** The kinds of input the fixed-inputs form offers; the others are left to Tex. */
const FORM_KINDS = new Set<AppEventSetting["type"]>(["string", "integer", "number", "boolean", "array"]);

/** Whether an input can be fixed in the small form: text, a number, yes or no, a list, or one of a set. */
export function fixableInput(input: AppEventSetting): boolean {
  return Boolean(input.enum?.length) || FORM_KINDS.has(input.type);
}

const CONDITIONS: { kind: ConditionKind; title: string; line: string }[] = [
  { kind: "always", title: "Always", line: "It runs every time the step before is done." },
  { kind: "found", title: "The step before found something", line: "Not an empty list, no emails, nothing." },
  { kind: "mentions", title: "The step before mentions any of these words", line: "Any one of them, ignoring capitals." },
  { kind: "tex", title: "Tex decides", line: "Tex answers your question yes or no, with one line why. Tex’s judgement: less certain than the others." },
];

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="contents">
        <Label hint={hint}>{title}</Label>
      </legend>
      {children}
    </fieldset>
  );
}

/** A yes/no fixed input: left to Tex, yes or no (a tick box couldn't say "left to Tex"). */
function InputField({ input, value, onChange, id }: { input: AppEventSetting; value: unknown; onChange: (value: unknown) => void; id: string }) {
  if (input.type === "boolean" && !input.enum?.length) {
    const label = (
      <>
        {input.title}
        <span className="font-normal text-muted"> (optional)</span>
      </>
    );
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id} hint={input.description}>
          {label}
        </Label>
        <Select
          id={id}
          label={input.title}
          value={value === true ? "true" : value === false ? "false" : ""}
          options={[
            { value: "", label: "Tex decides" },
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
          onChange={(next) => onChange(next === "" ? "" : next === "true")}
        />
      </div>
    );
  }
  return <SettingField id={id} setting={{ ...input, required: false }} value={value} onChange={onChange} />;
}

/** Whether an action belongs in a lane: a read only reads, a write changes something. Any in the order they run. */
export function actionFitsLane(action: Pick<AppAction, "changesSomething">, lane: Lane | null): boolean {
  if (lane === "read") return !action.changesSomething;
  if (lane === "write") return action.changesSomething;
  return true;
}

/**
 * The action picker: the app's actions of the step's lane (only the ones that read, in a read step;
 * the ones that change something, in a write step), searchable (on the server when the list is
 * long), the ones that ask first marked.
 */
function ActionPicker({ step, lane, onPick, id }: { step: EditorStep; lane: Lane | null; onPick: (action: AppAction) => void; id: string }) {
  const all = useAppActions(step.app);
  const [query, setQuery] = useState<string | null>(null);
  const typed = useDebounced(query ?? "", 300);
  // At most 200 come back at once: past that, what is typed is searched for on the server.
  const long = (all.data?.length ?? 0) >= 200;
  const searched = useAppActions(long && typed.trim() ? step.app : "", typed.trim());
  const list = useMemo(
    () => (long && typed.trim() && searched.data ? searched.data : (all.data ?? [])).filter((action) => actionFitsLane(action, lane) || action.slug === step.action),
    [long, typed, searched.data, all.data, lane, step.action],
  );
  const chosen = all.data?.find((action) => action.slug === step.action) ?? searched.data?.find((action) => action.slug === step.action);

  const options = useMemo(() => {
    const items: ListOption[] = list.map((action) => ({
      value: action.slug,
      label: action.name,
      description: action.description,
      hint: action.requiresApproval ? "Always asks first" : action.changesSomething ? "1 credit" : undefined,
      keywords: [action.description, action.slug],
    }));
    if (step.action && !items.some((item) => item.value === step.action)) items.unshift({ value: step.action, label: chosen?.name ?? step.action });
    return items;
  }, [list, step.action, chosen?.name]);

  const app = titleCase(step.app);
  if (all.isError) {
    const down = all.error instanceof ApiError && all.error.status === 503;
    return (
      <div className="flex flex-col gap-2 rounded-[10px] bg-warn-soft px-3 py-2 text-[12px] text-warn shadow-[inset_0_0_0_1px_var(--warn-line)]" role="alert">
        <span>
          {down
            ? `Couldn’t get ${app}’s actions just now: the service that connects your apps (Composio) didn’t answer. Your step is kept.`
            : `Couldn’t load ${app}’s actions. ${all.error instanceof Error ? all.error.message : ""}`}
        </span>
        <Button size="sm" className="w-fit" pending={all.isFetching} onClick={() => void all.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Combobox
        id={id}
        label="Action"
        value={step.action || null}
        options={options as ListItem[]}
        disabled={all.isPending}
        placeholder={all.isPending ? `Loading ${app}’s actions…` : `Search ${app}’s actions`}
        minListWidth={320}
        onQueryChange={setQuery}
        emptyText={(text) =>
          searched.isFetching ? "Searching…" : lane === "read" ? `No ${app} action that reads matches “${text}”.` : lane === "write" ? `No ${app} action that writes matches “${text}”.` : `No ${app} action matches “${text}”.`
        }
        onChange={(slug) => {
          const action = list.find((item) => item.slug === slug) ?? all.data?.find((item) => item.slug === slug);
          if (action) onPick(action);
        }}
      />
      {chosen?.description && <span className="text-[12px] leading-relaxed text-muted">{chosen.description}</span>}
      {chosen && (
        <span className="text-[12px] text-muted">
          {chosen.changesSomething ? "It changes something in the app: 1 credit each time it is done." : "It only reads: no credit."}
        </span>
      )}
    </div>
  );
}

/** The inputs of the chosen action the person can fix; the rest are left to Tex. */
function InputsForm({ step, onChange, id }: { step: EditorStep; onChange: (inputs: Record<string, unknown>) => void; id: string }) {
  const all = useAppActions(step.app);
  const action = all.data?.find((item) => item.slug === step.action);
  if (!action) {
    const set = Object.keys(step.inputs);
    return set.length ? <p className="text-[12px] text-fg-2">Fixed: {set.join(", ")}. The action’s inputs load with its list.</p> : null;
  }
  const fixable = action.inputs.filter(fixableInput).sort((a, b) => Number(b.required) - Number(a.required));
  const others = action.inputs.filter((input) => !fixableInput(input));
  if (action.inputs.length === 0) return <p className="text-[12px] text-muted">This action takes no inputs.</p>;
  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-surface-2 p-3">
      <span className="text-[12px] leading-relaxed text-muted">
        Fix the ones that are always the same, such as a recipient. Leave the others empty: Tex fills them from the steps before.
      </span>
      {fixable.map((input) => (
        <InputField
          key={input.name}
          id={`${id}-in-${input.name}`}
          input={input}
          value={step.inputs[input.name]}
          onChange={(value) => onChange({ ...step.inputs, [input.name]: value })}
        />
      ))}
      {others.length > 0 && <span className="text-[12px] text-muted">Left to Tex: {others.map((input) => input.title).join(", ")}.</span>}
    </div>
  );
}

/** "Ask me first": a switch, locked on (with a lock and why) for an action that sends, deletes or pays. */
function AskFirst({ step, onChange }: { step: EditorStep; onChange: (on: boolean) => void }) {
  const locked = step.risky;
  const on = locked || step.askFirst;
  return (
    <SwitchRow
      on={on}
      locked={locked}
      onToggle={() => onChange(!on)}
      icon={<LockIcon size={15} className="text-[color-mix(in_srgb,var(--patch)_72%,var(--fg))]" />}
      title="Ask me first"
      description={locked ? LOCKED_LINE : "Tex stops before this action and asks you in the chat (and on Telegram). The run goes on after your OK."}
    />
  );
}

/** "Only if": always, found something, mentions words, or Tex decides. Not on step 1. */
function OnlyIf({ step, index, onChange, id }: { step: EditorStep; index: number; onChange: (onlyIf: EditorStep["onlyIf"]) => void; id: string }) {
  if (index === 0)
    return (
      <p className="text-[12px] text-muted">{step.onlyIf.kind === "always" ? "Step 1 always runs when the trigger fires." : FIRST_STEP_NOTE}</p>
    );
  const words = conditionWords(step.onlyIf.words);
  return (
    <div className="flex flex-col gap-2">
      <RadioCards<ConditionKind>
        label={`When step ${index + 1} runs`}
        value={step.onlyIf.kind}
        onChange={(kind) => onChange({ ...step.onlyIf, kind })}
        options={CONDITIONS.map((choice) => ({
          value: choice.kind,
          label: choice.title,
          description:
            choice.kind === "tex" ? (
              <>
                <span className="mr-2 rounded-md bg-surface-2 px-2 text-[12px] leading-4 font-semibold text-nav">Tex’s judgement</span>
                {choice.line}
              </>
            ) : (
              choice.line
            ),
        }))}
      />
      {step.onlyIf.kind === "mentions" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-words`} hint="Separate them with commas. Any one of them is enough.">
            The words
          </Label>
          <input
            id={`${id}-words`}
            className={inputClass}
            value={step.onlyIf.words}
            placeholder="urgent, asap"
            onChange={(event) => onChange({ ...step.onlyIf, words: event.target.value })}
          />
          {words.length > 0 && <span className="text-[12px] text-muted">Checks for: {words.map((word) => `“${word}”`).join(", ")}</span>}
        </div>
      )}
      {step.onlyIf.kind === "tex" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-question`} hint="A question Tex answers yes or no from what the step before found.">
            Your question
          </Label>
          <input
            id={`${id}-question`}
            className={inputClass}
            maxLength={300}
            value={step.onlyIf.question}
            placeholder="Is any of these emails urgent?"
            onChange={(event) => onChange({ ...step.onlyIf, question: event.target.value })}
          />
        </div>
      )}
      {step.onlyIf.kind !== "always" && (
        <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-fg-2">
          If it’s false, the run stops here: the steps after it are skipped, and one short line in the Automations chat says so. That counts as a good run, not a failure.
        </p>
      )}
    </div>
  );
}

/** The apps a Tex step may read: connected ones, at most 5, as chips. */
function ReadApps({ step, apps, onChange, id }: { step: EditorStep; apps: readonly App[] | undefined; onChange: (readApps: string[]) => void; id: string }) {
  const choices = appChoices(apps);
  const full = step.readApps.length >= MAX_READ_APPS;
  // Full: the ones not chosen yet are shown, but can't be picked.
  const options = appListOptions(apps, step.readApps).map((item) =>
    "options" in item || !full || step.readApps.includes(item.value) ? item : { ...item, disabled: true, hint: `At most ${MAX_READ_APPS}` },
  );
  return (
    <div className="flex flex-col gap-2">
      <MultiSelect
        id={`${id}-read`}
        label="Apps Tex may read"
        values={step.readApps}
        options={options}
        placeholder={choices.usable.length ? "No app: search to pick some" : "No app is connected yet"}
        minListWidth={260}
        emptyText={(query) => `None of your apps matches “${query}”.`}
        onChange={(next) => onChange(next.slice(0, MAX_READ_APPS))}
      />
      {choices.usable.length === 0 && (
        <p className="text-[12px] text-muted">
          No app is connected yet.{" "}
          <Link href={INTEGRATIONS_APPS_PATH} className={LINK}>
            Connect one
          </Link>
        </p>
      )}
      <span className="text-[12px] text-muted">{full ? `At most ${MAX_READ_APPS} apps.` : `None picked: Tex works only with what the steps before found. Up to ${MAX_READ_APPS}.`}</span>
    </div>
  );
}

export type StepFormProps = {
  step: EditorStep;
  /** Its place: 0 is step 1. */
  index: number;
  /** Its lane on the canvas: an app step's actions are the lane's. Null when the steps are shown as they run. */
  lane: Lane | null;
  onChange: (step: EditorStep) => void;
  /** Move it one place, within its lane; left out where it can't go. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** What the server says is wrong with this step. */
  problems: readonly string[];
  /** "Check this: it now looks at step 2." (its "only if" follows a different step now). */
  warning: string | null;
  /** The id of the step before it now. A change to its "only if", or "It’s right", marks the condition as looked at against it. */
  previousId: string | null;
  apps: readonly App[] | undefined;
};

/** The panel of one step. */
export function StepForm({ step, index, lane, onChange, onMoveUp, onMoveDown, problems, warning, previousId, apps }: StepFormProps) {
  const id = useId();
  const choices = appChoices(apps);
  const set = (next: Partial<EditorStep>) => onChange({ ...step, ...next });

  return (
    <div
      className="flex flex-col gap-6"
      onKeyDown={(event) => {
        // Alt and an arrow moves the step, from anywhere in its panel.
        if (!event.altKey) return;
        if (event.key === "ArrowUp" && onMoveUp) {
          event.preventDefault();
          onMoveUp();
        } else if (event.key === "ArrowDown" && onMoveDown) {
          event.preventDefault();
          onMoveDown();
        }
      }}
    >
      <Problems problems={problems} />
      {warning && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn-soft px-4 py-3 text-[12px] text-warn shadow-[inset_0_0_0_1px_var(--warn-line)]">
          <span className="min-w-0 flex-1 basis-[200px]">{warning} Its “only if” is about the step before it, and that step changed.</span>
          <Button size="sm" onClick={() => set({ follows: previousId })}>
            It’s right
          </Button>
        </div>
      )}

      {step.type === "action" ? (
        <>
          <Section title="App" hint={lane === "read" ? "The app it reads from. Reading never changes anything there." : lane === "write" ? "The app it writes or sends in." : "One of your connected apps."}>
            <Combobox
              id={`${id}-app`}
              label="App"
              value={step.app || null}
              placeholder="Search your apps"
              options={appListOptions(apps, [step.app])}
              minListWidth={260}
              emptyText={(query) => `None of your apps matches “${query}”.`}
              onChange={(app) => set({ app, action: "", inputs: {}, risky: false })}
            />
            {choices.usable.length === 0 && (
              <p className="text-[12px] text-muted">
                No app is connected yet.{" "}
                <Link href={INTEGRATIONS_APPS_PATH} className={LINK}>
                  Connect one
                </Link>{" "}
                first.
              </p>
            )}
          </Section>
          {step.app && (
            <Section
              title="Action"
              hint={lane === "read" ? "Only the actions that read are here. Search by a word." : "Search by a word. The ones that send, delete or pay say “Always asks first”."}
            >
              <ActionPicker
                id={`${id}-action`}
                step={step}
                lane={lane}
                onPick={(action) => {
                  const names = new Set(action.inputs.map((input) => input.name));
                  const inputs = Object.fromEntries(Object.entries(step.inputs).filter(([name]) => names.has(name)));
                  set({ action: action.slug, risky: action.requiresApproval, askFirst: step.askFirst || action.requiresApproval, inputs });
                }}
              />
            </Section>
          )}
          {step.app && step.action && (
            <Section title="Fixed inputs">
              <InputsForm id={id} step={step} onChange={(inputs) => set({ inputs })} />
            </Section>
          )}
          <Section title="Approval">
            <AskFirst step={step} onChange={(askFirst) => set({ askFirst })} />
          </Section>
        </>
      ) : (
        <>
          <Section title="What Tex does in this step" hint="Write it as you would to Tex. Tex has the results of the steps before.">
            <textarea
              id={`${id}-instruction`}
              aria-label="What Tex does in this step"
              className={textareaClass}
              maxLength={2000}
              value={step.instruction}
              placeholder="Pick the emails that are urgent and say why."
              onChange={(event) => set({ instruction: event.target.value })}
            />
            <p className="text-[12px] leading-relaxed text-muted">{TEX_STEP_NOTE}</p>
          </Section>
          <Section title="Apps Tex may read" hint="Only reading: looking up, searching, listing.">
            <ReadApps id={id} step={step} apps={apps} onChange={(readApps) => set({ readApps })} />
          </Section>
        </>
      )}

      <Section title="Only if" hint={index === 0 ? undefined : "Checked on the result of the step before, before this one runs."}>
        <OnlyIf step={step} index={index} id={id} onChange={(onlyIf) => set({ onlyIf, follows: previousId })} />
      </Section>

      <Section title="The result">
        <SwitchRow
          on={step.showResult}
          onToggle={() => set({ showResult: !step.showResult })}
          title="Show me this"
          description="Its result also goes into the run’s answer. Either way it goes on to the next step."
        />
      </Section>

      {(onMoveUp || onMoveDown) && (
        <Section title="Place" hint="Steps run one at a time, top to bottom. Alt and an arrow key move it too.">
          <div role="group" aria-label={`Step ${index + 1}: move`} className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!onMoveUp} onClick={onMoveUp} aria-keyshortcuts="Alt+ArrowUp">
              <ChevronRightIcon size={14} className="-rotate-90" />
              Move up
            </Button>
            <Button size="sm" disabled={!onMoveDown} onClick={onMoveDown} aria-keyshortcuts="Alt+ArrowDown">
              <ChevronRightIcon size={14} className="rotate-90" />
              Move down
            </Button>
          </div>
        </Section>
      )}

      <Section title="Name" hint="Optional. Left empty, the box is named after the action or the instruction.">
        <input
          id={`${id}-title`}
          aria-label="Name of the step"
          className={inputClass}
          maxLength={80}
          value={step.title}
          placeholder={step.type === "action" ? "Fetch today’s emails from my boss" : "Pick the urgent ones"}
          onChange={(event) => set({ title: event.target.value })}
        />
      </Section>
    </div>
  );
}
