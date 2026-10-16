"use client";

// The settings of each box while an automation is built or changed by hand: what the side panel
// beside the canvas shows for the box that is open, and what a phone shows for all five, one under
// another. Each form changes the editor's parts (`EditorParts`, src/lib/automation-editor.ts); the
// server checks them as they change and its problems come back here, under the box's heading.
//
// Every control is the app's own (src/components): the segmented control for the kind of trigger
// and of schedule, the date and time pickers, the searchable lists for the time zone, the app and
// its event, the chips for the apps, the radio cards and the switches. No native select, date, time,
// number, checkbox or radio is drawn here.

import Link from "next/link";
import { useId, useMemo, type ReactNode } from "react";
import type { App, AppEvent, AppEventSetting, ChannelLink } from "@/lib/api/client";
import { useAppEvents } from "@/lib/api/hooks";
import {
  ALL_DAYS,
  appChoices,
  DAY_SHORT,
  scheduleToCron,
  settingText,
  settingValue,
  wallClock,
  WEEKDAYS,
  type EditorParts,
  type Schedule,
  type ScheduleKind,
  type WhenMode,
} from "@/lib/automation-editor";
import { ASKS_CHANGES, ASKS_FIRST, INSTRUCTION_NOTE, KEPT_LINE, type FlowStepId } from "@/lib/automation-flow";
import { describeCronInWords } from "@/lib/automations";
import { cn, titleCase } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH, linkChatHref } from "@/lib/integrations";
import type { ListItem } from "@/lib/listbox";
import { PRICING_PATH } from "@/lib/pricing";
import { BrandIcon } from "../brand-icon";
import { DatePicker } from "../date-picker";
import { ChatIcon, ClockIcon, LockIcon, WarningIcon } from "../icons";
import { MultiSelect } from "../multi-select";
import { NumberStepper } from "../number-stepper";
import { RadioCards, SegmentedControl } from "../segmented-control";
import { Combobox, Select } from "../select";
import { timezoneOptions } from "../settings/timezones";
import { TimePicker } from "../time-picker";
import { inputClass, SwitchRow } from "../ui";
import { KindIcon } from "./kind-icon";

/** What the forms need besides the parts: the person's apps, linked chats and time zone. */
export type EditorContext = {
  apps: readonly App[] | undefined;
  channels: readonly ChannelLink[] | undefined;
  accountZone: string;
};

type FormProps = {
  editor: EditorParts;
  onChange: (next: EditorParts) => void;
  /** What the server says is wrong with this box. */
  problems: readonly string[];
  context: EditorContext;
};

const LINK = "font-medium text-accent hover:text-accent-dark";
export const textareaClass = cn(inputClass, "h-auto min-h-[120px] resize-y py-2.5 leading-relaxed");

/** The box's problems, for the person and for a screen reader. */
export function Problems({ problems, className }: { problems: readonly string[]; className?: string }) {
  if (problems.length === 0) return null;
  return (
    <div role="alert" className={cn("flex gap-2.5 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-fg", className)}>
      <WarningIcon size={15} className="mt-px shrink-0 text-danger" />
      <ul className="flex min-w-0 flex-col gap-1">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

export function Label({ htmlFor, id, children, hint }: { htmlFor?: string; id?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} id={id} className="text-[12.5px] font-medium text-fg">
          {children}
        </label>
      ) : (
        <span id={id} className="text-[12.5px] font-medium text-fg">
          {children}
        </span>
      )}
      {hint && <span className="text-[12px] leading-snug text-muted">{hint}</span>}
    </div>
  );
}

/** A label with its control under it. */
function FieldBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>{children}</div>;
}

/** A group of fields that belong together, under a quiet heading (the event's settings). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
      <legend className="sr-only">{title}</legend>
      <span aria-hidden className="text-[11.5px] font-semibold tracking-[0.02em] text-muted uppercase">
        {title}
      </span>
      {children}
    </fieldset>
  );
}

/** "Every weekday at 8:30 AM, by the clock below": what the choices make, read back. */
function ReadBack({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-accent-soft/70 px-3 py-2 text-[12.5px] text-fg-2">
      <ClockIcon size={14} className="mt-px shrink-0 text-accent-dark" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function TimeZoneField({ editor, onChange, id }: { editor: EditorParts; onChange: FormProps["onChange"]; id: string }) {
  const zones = useMemo(() => timezoneOptions(editor.timezone), [editor.timezone]);
  return (
    <FieldBlock>
      <Label htmlFor={id} hint="It runs by the clock of this place. Yours to start with.">
        Time zone
      </Label>
      <Combobox
        id={id}
        label="Time zone"
        value={editor.timezone}
        options={zones}
        onChange={(timezone) => onChange({ ...editor, timezone })}
        minListWidth={300}
        placeholder="Search for a city or region"
        emptyText={(query) => `No time zone matches “${query}”. Try a city, such as London or Kolkata.`}
      />
    </FieldBlock>
  );
}

// ---------------------------------------------------------------- trigger

const MODES: { value: WhenMode; label: string; icon: ReactNode }[] = [
  { value: "once", label: "Once", icon: <KindIcon kind="once" size={14} /> },
  { value: "schedule", label: "On a schedule", icon: <KindIcon kind="repeat" size={14} /> },
  { value: "event", label: "On an app event", icon: <KindIcon kind="event" size={14} /> },
];

const MODE_LINE: Record<WhenMode, string> = {
  once: "One time, at the moment you pick: a reminder, a follow-up, a job for later.",
  schedule: "Again and again: on the days you pick, every few hours, or by a cron line.",
  event: "The moment something happens in one of your connected apps: a new email, a pull request.",
};

const SCHEDULE_KINDS: { value: ScheduleKind; label: string }[] = [
  { value: "days", label: "On days" },
  { value: "hours", label: "Every few hours" },
  { value: "cron", label: "Cron line" },
];

/** The quick picks of days, and the days each one is. */
const DAY_SETS: { label: string; days: readonly number[] }[] = [
  { label: "Every day", days: ALL_DAYS },
  { label: "Weekdays", days: WEEKDAYS },
  { label: "Weekends", days: [0, 6] },
];

/** Monday first, as the calendar has it. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function DaysField({ days, onChange, labelId }: { days: readonly number[]; onChange: (days: number[]) => void; labelId: string }) {
  const toggle = (day: number) => onChange(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b));
  const same = (set: readonly number[]) => set.length === days.length && set.every((day) => days.includes(day));
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-7 gap-1">
        {DAY_ORDER.map((day) => {
          const on = days.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(day)}
              className={cn(
                "h-9 min-w-0 rounded-[9px] text-[12.5px] font-medium transition-colors outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
                on ? "bg-accent text-white shadow-[0_1px_2px_rgb(21_21_21/0.15)]" : "bg-surface text-nav ring-1 ring-line-strong ring-inset hover:text-fg",
              )}
            >
              {DAY_SHORT[day]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DAY_SETS.map((set) => (
          <button
            key={set.label}
            type="button"
            aria-pressed={same(set.days)}
            onClick={() => onChange([...set.days].sort((a, b) => a - b))}
            className={cn(
              "h-7 rounded-full px-2.5 text-[12px] font-medium transition-colors",
              same(set.days) ? "bg-accent-soft text-accent-dark" : "text-nav ring-1 ring-line ring-inset hover:text-fg",
            )}
          >
            {set.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScheduleFields({ editor, onChange, id }: { editor: EditorParts; onChange: FormProps["onChange"]; id: string }) {
  const schedule = editor.schedule;
  const set = (next: Partial<Schedule>) => onChange({ ...editor, schedule: { ...schedule, ...next } });
  const words = describeCronInWords(scheduleToCron(schedule));
  return (
    <div className="flex flex-col gap-4">
      <FieldBlock>
        <Label id={`${id}-how`}>How it repeats</Label>
        <SegmentedControl<ScheduleKind>
          aria-labelledby={`${id}-how`}
          options={SCHEDULE_KINDS}
          value={schedule.kind}
          fill
          wrap
          size="sm"
          onChange={(kind) => set(kind === "cron" && !schedule.cron.trim() ? { kind, cron: scheduleToCron(schedule) } : { kind })}
        />
      </FieldBlock>
      {schedule.kind === "days" && (
        <>
          <FieldBlock>
            <Label id={`${id}-days`} hint="Pick the days it runs on.">
              Days
            </Label>
            <DaysField days={schedule.days} labelId={`${id}-days`} onChange={(days) => set({ days })} />
          </FieldBlock>
          <FieldBlock>
            <Label htmlFor={`${id}-time`}>At</Label>
            <div className="w-44">
              <TimePicker id={`${id}-time`} value={schedule.time} onChange={(time) => set({ time })} />
            </div>
          </FieldBlock>
        </>
      )}
      {schedule.kind === "hours" && (
        <FieldBlock>
          <Label id={`${id}-hours-label`} hint="On the hour, from midnight. Between 1 and 23.">
            How often
          </Label>
          <NumberStepper
            id={`${id}-hours`}
            label="Every how many hours"
            value={schedule.hours}
            min={1}
            max={23}
            format={(n) => (n === 1 ? "Every hour" : `Every ${n} hours`)}
            onChange={(hours) => set({ hours })}
          />
        </FieldBlock>
      )}
      {schedule.kind === "cron" && (
        <FieldBlock>
          <Label htmlFor={`${id}-cron`} hint="Five fields: minute, hour, day of the month, month, weekday. For example 0 9 * * 1 is every Monday at 9.">
            Cron line
          </Label>
          <input
            id={`${id}-cron`}
            className={cn(inputClass, "font-mono")}
            value={schedule.cron}
            spellCheck={false}
            placeholder="0 9 * * 1"
            onChange={(event) => set({ cron: event.target.value })}
          />
        </FieldBlock>
      )}
      {words && <ReadBack>{words}, by the clock below.</ReadBack>}
      <TimeZoneField editor={editor} onChange={onChange} id={`${id}-tz`} />
    </div>
  );
}

export function SettingField({ setting, value, onChange, id }: { setting: AppEventSetting; value: unknown; onChange: (value: unknown) => void; id: string }) {
  const hint = [setting.description, setting.default !== undefined ? `Left empty: ${settingText(setting.default)}.` : null].filter(Boolean).join(" ");
  const label = (
    <>
      {setting.title}
      {setting.required ? <span className="text-danger"> *</span> : <span className="font-normal text-muted"> (optional)</span>}
    </>
  );
  if (setting.enum?.length) {
    const options: ListItem[] = [
      ...(setting.required ? [] : [{ value: "", label: "Any" }]),
      ...setting.enum.map((option) => ({ value: settingText(option), label: settingText(option) })),
    ];
    return (
      <FieldBlock>
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
        <Select id={id} label={setting.title} value={settingText(value)} options={options} onChange={(next) => onChange(settingValue(setting.type, next))} />
      </FieldBlock>
    );
  }
  if (setting.type === "boolean") return <SwitchRow on={value === true} onToggle={() => onChange(value !== true)} title={setting.title} description={hint || undefined} />;
  return (
    <FieldBlock>
      <Label htmlFor={id} hint={setting.type === "array" ? `${hint} Several: separate them with commas.` : hint}>
        {label}
      </Label>
      <input
        id={id}
        className={inputClass}
        inputMode={setting.type === "integer" || setting.type === "number" ? "numeric" : undefined}
        value={settingText(value)}
        placeholder={setting.default !== undefined ? settingText(setting.default) : undefined}
        onChange={(event) => onChange(settingValue(setting.type, event.target.value))}
      />
    </FieldBlock>
  );
}

const appIcon = (slug: string) => <BrandIcon name={slug} size={16} />;

/**
 * The person's apps as options, with their logos: the ones that can be used now, then, greyed, the
 * ones the plan doesn't include and the ones not connected. `keep` are apps already chosen: one that
 * can't be picked now (or isn't in the catalog) is still listed, so it can be seen and taken off.
 */
export function appOptions(apps: readonly App[] | undefined, keep: readonly string[] = []): ListItem[] {
  const choices = appChoices(apps);
  const usable = new Set(choices.usable.map((item) => item.slug));
  const stale = keep.filter((slug) => slug && !usable.has(slug));
  const named = new Map((apps ?? []).map((app) => [app.slug, app.name]));
  return [
    ...stale.map((slug) => ({ value: slug, label: named.get(slug) ?? titleCase(slug), icon: appIcon(slug), hint: "Not usable now" })),
    ...choices.usable.map((item) => ({ value: item.slug, label: item.name, icon: appIcon(item.slug) })),
    ...(choices.notOnPlan.some((item) => !stale.includes(item.slug))
      ? [
          {
            label: "Not on your plan",
            options: choices.notOnPlan.filter((item) => !stale.includes(item.slug)).map((item) => ({ value: item.slug, label: item.name, icon: appIcon(item.slug), disabled: true, hint: "Upgrade" })),
          },
        ]
      : []),
    ...(choices.notConnected.some((item) => !stale.includes(item.slug))
      ? [
          {
            label: "Not connected",
            options: choices.notConnected
              .filter((item) => !stale.includes(item.slug))
              .map((item) => ({ value: item.slug, label: item.name, icon: appIcon(item.slug), disabled: true, hint: "Connect first" })),
          },
        ]
      : []),
  ];
}

function EventFields({ editor, onChange, context, id }: { editor: EditorParts; onChange: FormProps["onChange"]; context: EditorContext; id: string }) {
  const choices = appChoices(context.apps);
  const app = editor.event.app;
  const events = useAppEvents(app);
  const chosen: AppEvent | undefined = events.data?.find((event) => event.slug === editor.event.event);
  const setEvent = (next: Partial<EditorParts["event"]>) => onChange({ ...editor, event: { ...editor.event, ...next } });
  const eventOptions: ListItem[] = [
    ...(events.data ?? []).map((event) => ({ value: event.slug, label: event.name, description: event.description, keywords: [event.slug] })),
    ...(editor.event.event && !events.data?.some((event) => event.slug === editor.event.event) ? [{ value: editor.event.event, label: editor.event.event }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <FieldBlock>
        <Label htmlFor={`${id}-app`} hint={choices.usable.length ? "One of your connected apps." : undefined}>
          App
        </Label>
        <Combobox
          id={`${id}-app`}
          label="App"
          value={app || null}
          placeholder="Search your apps"
          options={appOptions(context.apps, [app])}
          minListWidth={260}
          emptyText={(query) => `None of your apps matches “${query}”.`}
          onChange={(next) => setEvent({ app: next, event: "", config: {} })}
        />
        {choices.usable.length === 0 && (
          <p className="text-[12.5px] text-muted">
            No app is connected yet.{" "}
            <Link href={INTEGRATIONS_APPS_PATH} className={LINK}>
              Connect one
            </Link>{" "}
            first.
          </p>
        )}
      </FieldBlock>
      {app && (
        <FieldBlock>
          <Label htmlFor={`${id}-event`} hint={chosen?.description ?? `What happens in ${titleCase(app)} that starts a run.`}>
            What happens
          </Label>
          {events.isError ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-fg-2">Couldn’t load {titleCase(app)}’s events just now. Try again in a moment.</p>
          ) : (
            <Combobox
              id={`${id}-event`}
              label="What happens"
              value={editor.event.event || null}
              placeholder={events.isPending ? "Loading its events…" : "Search its events"}
              disabled={events.isPending}
              minListWidth={320}
              options={eventOptions}
              emptyText={(query) => `No ${titleCase(app)} event matches “${query}”.`}
              onChange={(next) => setEvent({ event: next, config: {} })}
            />
          )}
          {events.isSuccess && events.data.length === 0 && <p className="text-[12.5px] text-muted">{titleCase(app)} has no events an automation can start on.</p>}
        </FieldBlock>
      )}
      {chosen && chosen.settings.length > 0 && (
        <Group title={`What ${titleCase(app)} watches for`}>
          {chosen.settings.map((setting) => (
            <SettingField
              key={setting.name}
              id={`${id}-set-${setting.name}`}
              setting={setting}
              value={editor.event.config[setting.name]}
              onChange={(value) => setEvent({ config: { ...editor.event.config, [setting.name]: value } })}
            />
          ))}
        </Group>
      )}
      {app && editor.event.event && <ReadBack>It runs each time that happens, as {titleCase(app)} reports it. An app event has no clock of its own.</ReadBack>}
    </div>
  );
}

export function TriggerForm({ editor, onChange, problems, context }: FormProps) {
  const id = useId();
  const today = wallClock(new Date().toISOString(), editor.timezone).date;
  return (
    <div className="flex flex-col gap-4">
      <Problems problems={problems} />
      <FieldBlock>
        <Label id={`${id}-mode`}>When it runs</Label>
        <SegmentedControl<WhenMode>
          aria-labelledby={`${id}-mode`}
          options={MODES}
          value={editor.mode}
          fill
          wrap
          onChange={(mode) => onChange({ ...editor, mode })}
        />
        <span className="text-[12.5px] text-muted">{editor.mode ? MODE_LINE[editor.mode] : "Once at a moment, again and again on a schedule, or each time something happens in an app."}</span>
      </FieldBlock>
      {editor.mode === "once" && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
            <FieldBlock>
              <Label htmlFor={`${id}-date`}>Day</Label>
              <DatePicker id={`${id}-date`} value={editor.date} min={today} today={today} onChange={(date) => onChange({ ...editor, date })} />
            </FieldBlock>
            <FieldBlock>
              <Label htmlFor={`${id}-time`}>Time</Label>
              <TimePicker id={`${id}-time`} value={editor.time} onChange={(time) => onChange({ ...editor, time })} />
            </FieldBlock>
          </div>
          <TimeZoneField editor={editor} onChange={onChange} id={`${id}-tz`} />
        </>
      )}
      {editor.mode === "schedule" && <ScheduleFields editor={editor} onChange={onChange} id={id} />}
      {editor.mode === "event" && <EventFields editor={editor} onChange={onChange} context={context} id={id} />}
      {editor.mode === "schedule" && <p className="text-[12px] text-muted">An automation runs at most every 15 minutes.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- instruction

export function InstructionForm({ editor, onChange, problems }: FormProps) {
  const id = useId();
  if (editor.steps.length > 0) return <PurposeForm editor={editor} onChange={onChange} problems={problems} id={id} />;
  return (
    <div className="flex flex-col gap-4">
      <Problems problems={problems} />
      <FieldBlock>
        <Label htmlFor={`${id}-title`} hint="A few words to know it by in your list.">
          Title
        </Label>
        <input id={`${id}-title`} className={inputClass} maxLength={120} value={editor.title} placeholder="Monday pull requests" onChange={(event) => onChange({ ...editor, title: event.target.value })} />
      </FieldBlock>
      <FieldBlock>
        <Label htmlFor={`${id}-text`} hint="Write it as you would to Tex in chat.">
          What Tex does each time
        </Label>
        <textarea
          id={`${id}-text`}
          className={textareaClass}
          maxLength={4000}
          value={editor.instruction}
          placeholder="List my open pull requests, oldest first, with who is waiting on whom."
          onChange={(event) => onChange({ ...editor, instruction: event.target.value })}
        />
        <span aria-hidden className="self-end text-[11.5px] text-muted tabular-nums">
          {editor.instruction.length} / 4000
        </span>
      </FieldBlock>
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-fg-2">{INSTRUCTION_NOTE}</p>
    </div>
  );
}

/** With steps, the instruction is the automation's purpose in one line; the steps say what to do. */
function PurposeForm({ editor, onChange, problems, id }: Pick<FormProps, "editor" | "onChange" | "problems"> & { id: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Problems problems={problems} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
        <FieldBlock>
          <Label htmlFor={`${id}-title`} hint="A few words to know it by in your list.">
            Title
          </Label>
          <input id={`${id}-title`} className={inputClass} maxLength={120} value={editor.title} placeholder="Urgent mail from my boss" onChange={(event) => onChange({ ...editor, title: event.target.value })} />
        </FieldBlock>
        <FieldBlock>
          <Label htmlFor={`${id}-text`} hint="What it is for, in one line. Tex reads it with the steps, so it knows why it does each one.">
            Purpose
          </Label>
          <input
            id={`${id}-text`}
            className={inputClass}
            maxLength={300}
            value={editor.instruction}
            placeholder="Reply fast to urgent mail from my boss"
            onChange={(event) => onChange({ ...editor, instruction: event.target.value })}
          />
        </FieldBlock>
      </div>
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-fg-2">
        With steps, Tex follows them one at a time, in order, and the platform refuses anything that isn’t the current step. The apps it may use are the ones the steps name.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- apps

export function AppsForm({ editor, onChange, problems, context }: FormProps) {
  const id = useId();
  const choices = appChoices(context.apps);
  const watched = editor.mode === "event" && editor.event.app ? editor.event.app : null;
  return (
    <div className="flex flex-col gap-4">
      <Problems problems={problems} />
      <FieldBlock>
        <Label
          htmlFor={`${id}-apps`}
          hint={
            editor.apps.length
              ? "During a run Tex may use only these apps, and the app the trigger watches. An action in any other app is refused."
              : "None picked: Tex uses whichever of your connected apps the instruction needs. Pick some to keep its runs to those."
          }
        >
          Apps Tex may use
        </Label>
        <MultiSelect
          id={`${id}-apps`}
          label="Apps Tex may use"
          values={editor.apps}
          options={appOptions(context.apps, editor.apps)}
          placeholder={choices.usable.length ? "Any connected app: search to pick some" : "No app is connected yet"}
          minListWidth={260}
          emptyText={(query) => `None of your apps matches “${query}”.`}
          onChange={(apps) => onChange({ ...editor, apps })}
        />
      </FieldBlock>
      {watched && (
        <p className="flex items-center gap-2 text-[12.5px] text-fg-2">
          <BrandIcon name={watched} size={14} />
          {titleCase(watched)} is the trigger’s app, so Tex may always use it.
        </p>
      )}
      <p className="text-[12px] text-muted">
        Only connected apps your plan includes can be picked.{" "}
        <Link href={INTEGRATIONS_APPS_PATH} className={LINK}>
          Connect more
        </Link>
        {choices.notOnPlan.length > 0 && (
          <>
            {" · "}
            <Link href={PRICING_PATH} className={LINK}>
              See plans
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- asks you first

export function AsksForm({ editor, onChange, problems }: FormProps) {
  return (
    <div className="flex flex-col gap-4">
      <Problems problems={problems} />
      <RadioCards<EditorParts["askFirst"]>
        label="When Tex asks you first"
        value={editor.askFirst}
        onChange={(askFirst) => onChange({ ...editor, askFirst })}
        options={[
          {
            value: "risky",
            label: ASKS_FIRST,
            icon: <LockIcon size={15} />,
            description: "The platform’s rule: before Tex sends something to another person, deletes something or pays, it asks you in the chat.",
          },
          {
            value: "changes",
            label: ASKS_CHANGES,
            icon: <LockIcon size={15} />,
            description: "Stricter: any app action that changes something (creating, updating, sending, deleting) waits for your OK. Reading and searching still don’t ask.",
          },
        ]}
      />
      <p className="text-[12px] text-muted">It can’t be looser than the platform’s rule: sending, deleting or paying always waits for your OK.</p>
    </div>
  );
}

// ---------------------------------------------------------------- results

export function ResultsForm({ editor, onChange, problems, context }: FormProps) {
  const links = context.channels ?? [];
  const telegram = links.find((link) => link.channel === "telegram");
  // A copy that goes to another chat app today (made there) stays offered.
  const other = editor.copyTo && editor.copyTo !== "telegram" ? editor.copyTo : null;
  return (
    <div className="flex flex-col gap-2.5">
      <Problems problems={problems} />
      <SwitchRow
        on
        locked
        onToggle={() => {}}
        icon={<ChatIcon size={16} className="text-success" />}
        title="Your Automations chat"
        description="Always: every run answers there, never in your other chats. Write there to follow up."
      />
      {telegram || editor.copyTo === "telegram" ? (
        <SwitchRow
          on={editor.copyTo === "telegram"}
          onToggle={() => onChange({ ...editor, copyTo: editor.copyTo === "telegram" ? null : "telegram" })}
          icon={<BrandIcon name="telegram" size={16} />}
          title="Also a copy to Telegram"
          description={telegram ? `To your linked chat, ${telegram.displayId}.` : "No Telegram chat is linked now."}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-muted">
          Want a copy of each answer on Telegram?{" "}
          <Link href={linkChatHref("telegram")} className={LINK}>
            Link your Telegram
          </Link>{" "}
          first, then switch it on here.
        </p>
      )}
      {other && <SwitchRow on onToggle={() => onChange({ ...editor, copyTo: null })} icon={<BrandIcon name={other} size={16} />} title={`Also a copy to ${titleCase(other)}`} />}
      {editor.steps.length > 0 && (
        <p className="text-[12px] leading-relaxed text-muted">
          The answer has Tex’s short summary, the results of the steps with “Show me this” on, and a line of how each step went. {KEPT_LINE}
        </p>
      )}
    </div>
  );
}

/** The form of one box. */
export function StepForm({ step, ...props }: FormProps & { step: FlowStepId }) {
  switch (step) {
    case "trigger":
      return <TriggerForm {...props} />;
    case "instruction":
      return <InstructionForm {...props} />;
    case "apps":
      return <AppsForm {...props} />;
    case "asks":
      return <AsksForm {...props} />;
    default:
      return <ResultsForm {...props} />;
  }
}
