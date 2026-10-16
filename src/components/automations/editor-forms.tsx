"use client";

// The settings of each box while an automation is built or changed by hand: what the side panel
// beside the canvas shows for the box that is open, and what a phone shows for all five, one under
// another. Each form changes the editor's parts (`EditorParts`, src/lib/automation-editor.ts); the
// server checks them as they change and its problems come back here, in red, under the fields.

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
  WEEKDAYS,
  type EditorParts,
  type Schedule,
  type ScheduleKind,
  type WhenMode,
} from "@/lib/automation-editor";
import { ASKS_CHANGES, ASKS_FIRST, INSTRUCTION_NOTE, type FlowStepId } from "@/lib/automation-flow";
import { describeCronInWords } from "@/lib/automations";
import { cn, titleCase } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH, linkChatHref } from "@/lib/integrations";
import { PRICING_PATH } from "@/lib/pricing";
import { BrandIcon } from "../brand-icon";
import { Combobox, Select, type ListItem } from "../select";
import { timezoneOptions } from "../settings/timezones";
import { FilterPills, inputClass } from "../ui";

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
const textareaClass = cn(inputClass, "h-auto min-h-[112px] resize-y py-2 leading-relaxed");

/** The box's problems, in red, for the person and for a screen reader. */
export function Problems({ problems, className }: { problems: readonly string[]; className?: string }) {
  if (problems.length === 0) return null;
  return (
    <ul role="alert" className={cn("flex flex-col gap-1 rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger", className)}>
      {problems.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}

function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium">
          {children}
        </label>
      ) : (
        <span className="text-[12.5px] font-medium">{children}</span>
      )}
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </div>
  );
}

function TimeZoneField({ editor, onChange, id }: { editor: EditorParts; onChange: FormProps["onChange"]; id: string }) {
  const zones = useMemo(() => timezoneOptions(editor.timezone), [editor.timezone]);
  return (
    <div className="flex flex-col gap-1.5">
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
    </div>
  );
}

// ---------------------------------------------------------------- trigger

const MODES: { value: WhenMode; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "schedule", label: "On a schedule" },
  { value: "event", label: "On an app event" },
];

const SCHEDULE_KINDS: { value: ScheduleKind; label: string }[] = [
  { value: "days", label: "On days" },
  { value: "hours", label: "Every few hours" },
  { value: "cron", label: "Cron line" },
];

function ScheduleFields({ editor, onChange, id }: { editor: EditorParts; onChange: FormProps["onChange"]; id: string }) {
  const schedule = editor.schedule;
  const set = (next: Partial<Schedule>) => onChange({ ...editor, schedule: { ...schedule, ...next } });
  const toggleDay = (day: number) => {
    const days = schedule.days.includes(day) ? schedule.days.filter((d) => d !== day) : [...schedule.days, day].sort((a, b) => a - b);
    set({ days });
  };
  const words = describeCronInWords(scheduleToCron(schedule));
  return (
    <div className="flex flex-col gap-3">
      <FilterPills<ScheduleKind>
        label="How the schedule is set"
        options={SCHEDULE_KINDS}
        value={schedule.kind}
        onChange={(kind) => set(kind === "cron" && !schedule.cron.trim() ? { kind, cron: scheduleToCron(schedule) } : { kind })}
      />
      {schedule.kind === "days" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label hint="Pick the days it runs on.">Days</Label>
            <div role="group" aria-label="Days it runs on" className="flex flex-wrap gap-1.5">
              {ALL_DAYS.map((day) => {
                const on = schedule.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "h-8 min-w-11 rounded-lg px-2 text-[12.5px] font-medium transition-colors",
                      on ? "bg-fg text-white" : "bg-surface-2 text-nav hover:text-fg",
                    )}
                  >
                    {DAY_SHORT[day]}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 text-[12px]">
              <button type="button" className={LINK} onClick={() => set({ days: [...ALL_DAYS] })}>
                Every day
              </button>
              <button type="button" className={LINK} onClick={() => set({ days: [...WEEKDAYS] })}>
                Weekdays
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-time`}>At</Label>
            <input id={`${id}-time`} type="time" className={cn(inputClass, "w-36")} value={schedule.time} onChange={(event) => set({ time: event.target.value })} />
          </div>
        </>
      )}
      {schedule.kind === "hours" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-hours`} hint="On the hour. Between 1 and 23.">
            Every how many hours
          </Label>
          <input
            id={`${id}-hours`}
            type="number"
            min={1}
            max={23}
            className={cn(inputClass, "w-28")}
            value={schedule.hours}
            onChange={(event) => set({ hours: Math.min(23, Math.max(1, Number(event.target.value) || 1)) })}
          />
        </div>
      )}
      {schedule.kind === "cron" && (
        <div className="flex flex-col gap-1.5">
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
        </div>
      )}
      {words && <p className="text-[12.5px] text-fg-2">{words}, by the clock below.</p>}
      <TimeZoneField editor={editor} onChange={onChange} id={`${id}-tz`} />
    </div>
  );
}

function SettingField({ setting, value, onChange, id }: { setting: AppEventSetting; value: unknown; onChange: (value: unknown) => void; id: string }) {
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
        <Select id={id} label={setting.title} value={settingText(value)} options={options} onChange={(next) => onChange(settingValue(setting.type, next))} />
      </div>
    );
  }
  if (setting.type === "boolean")
    return (
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--fg)]" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{setting.title}</span>
          {hint && <span className="text-[12px] text-muted">{hint}</span>}
        </span>
      </label>
    );
  return (
    <div className="flex flex-col gap-1.5">
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
    </div>
  );
}

function EventFields({ editor, onChange, context, id }: { editor: EditorParts; onChange: FormProps["onChange"]; context: EditorContext; id: string }) {
  const choices = appChoices(context.apps);
  const app = editor.event.app;
  const events = useAppEvents(app);
  const chosen: AppEvent | undefined = events.data?.find((event) => event.slug === editor.event.event);
  const setEvent = (next: Partial<EditorParts["event"]>) => onChange({ ...editor, event: { ...editor.event, ...next } });

  const appOptions: ListItem[] = [
    ...choices.usable.map((item) => ({ value: item.slug, label: item.name })),
    ...(choices.notOnPlan.length ? [{ label: "Not on your plan", options: choices.notOnPlan.map((item) => ({ value: item.slug, label: item.name, disabled: true, hint: "Upgrade" })) }] : []),
    ...(choices.notConnected.length
      ? [{ label: "Not connected", options: choices.notConnected.map((item) => ({ value: item.slug, label: item.name, disabled: true, hint: "Connect first" })) }]
      : []),
  ];
  // An app the automation already watches stays in the list even if it can't be picked now.
  if (app && !choices.usable.some((item) => item.slug === app)) appOptions.unshift({ value: app, label: titleCase(app), hint: "Not usable now" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-app`} hint={choices.usable.length ? "One of your connected apps." : undefined}>
          App
        </Label>
        <Select id={`${id}-app`} label="App" value={app || null} placeholder="Pick an app" options={appOptions} onChange={(next) => setEvent({ app: next, event: "", config: {} })} />
        {choices.usable.length === 0 && (
          <p className="text-[12.5px] text-muted">
            No app is connected yet.{" "}
            <Link href={INTEGRATIONS_APPS_PATH} className={LINK}>
              Connect one
            </Link>{" "}
            first.
          </p>
        )}
      </div>
      {app && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-event`} hint={chosen?.description}>
            What happens
          </Label>
          {events.isError ? (
            <p className="text-[12.5px] text-danger">Couldn’t load {titleCase(app)}’s events just now. Try again in a moment.</p>
          ) : (
            <Select
              id={`${id}-event`}
              label="What happens"
              value={editor.event.event || null}
              placeholder={events.isPending ? "Loading its events…" : "Pick an event"}
              disabled={events.isPending}
              minListWidth={280}
              options={[
                ...(events.data ?? []).map((event) => ({ value: event.slug, label: event.name, description: event.description })),
                ...(editor.event.event && !events.data?.some((event) => event.slug === editor.event.event) ? [{ value: editor.event.event, label: editor.event.event }] : []),
              ]}
              onChange={(next) => setEvent({ event: next, config: {} })}
            />
          )}
          {events.isSuccess && events.data.length === 0 && <p className="text-[12.5px] text-muted">{titleCase(app)} has no events an automation can start on.</p>}
        </div>
      )}
      {chosen && chosen.settings.length > 0 && (
        <fieldset className="flex flex-col gap-3 rounded-[10px] bg-surface-2 p-3">
          <legend className="sr-only">Its settings</legend>
          <span className="text-[12px] text-muted">Its settings: what {titleCase(app)} watches for.</span>
          {chosen.settings.map((setting) => (
            <SettingField
              key={setting.name}
              id={`${id}-set-${setting.name}`}
              setting={setting}
              value={editor.event.config[setting.name]}
              onChange={(value) => setEvent({ config: { ...editor.event.config, [setting.name]: value } })}
            />
          ))}
        </fieldset>
      )}
    </div>
  );
}

export function TriggerForm({ editor, onChange, problems, context }: FormProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3.5">
      <Problems problems={problems} />
      <div className="flex flex-col gap-1.5">
        <Label>When it runs</Label>
        <FilterPills<WhenMode | "none">
          label="When it runs"
          options={MODES}
          value={editor.mode ?? "none"}
          onChange={(mode) => onChange({ ...editor, mode: mode as WhenMode })}
        />
        {!editor.mode && <span className="text-[12.5px] text-muted">Once at a moment, again and again on a schedule, or each time something happens in an app.</span>}
      </div>
      {editor.mode === "once" && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-date`}>Day</Label>
              <input id={`${id}-date`} type="date" className={cn(inputClass, "w-44")} value={editor.date} onChange={(event) => onChange({ ...editor, date: event.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-time`}>Time</Label>
              <input id={`${id}-time`} type="time" className={cn(inputClass, "w-36")} value={editor.time} onChange={(event) => onChange({ ...editor, time: event.target.value })} />
            </div>
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
  return (
    <div className="flex flex-col gap-3.5">
      <Problems problems={problems} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`} hint="A few words to know it by in your list.">
          Title
        </Label>
        <input id={`${id}-title`} className={inputClass} maxLength={120} value={editor.title} placeholder="Monday pull requests" onChange={(event) => onChange({ ...editor, title: event.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
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
      </div>
      <p className="text-[12px] leading-relaxed text-muted">{INSTRUCTION_NOTE}</p>
    </div>
  );
}

// ---------------------------------------------------------------- apps

export function AppsForm({ editor, onChange, problems, context }: FormProps) {
  const choices = appChoices(context.apps);
  const toggle = (slug: string) =>
    onChange({ ...editor, apps: editor.apps.includes(slug) ? editor.apps.filter((app) => app !== slug) : [...editor.apps, slug] });
  // Named before, but no longer usable: still listed, so it can be taken off.
  const stale = editor.apps.filter((slug) => !choices.usable.some((app) => app.slug === slug));
  const watched = editor.mode === "event" && editor.event.app ? editor.event.app : null;
  return (
    <div className="flex flex-col gap-3.5">
      <Problems problems={problems} />
      <p className="text-[12.5px] text-fg-2">
        {editor.apps.length
          ? "During a run Tex may use only the apps ticked here, and the app the trigger watches. An action in any other app is refused."
          : "None ticked: Tex uses whichever of your connected apps the instruction needs. Tick some to keep its runs to those."}
      </p>
      <ul className="flex flex-col gap-1">
        {choices.usable.map((app) => (
          <li key={app.slug}>
            <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13.5px] hover:bg-surface-2">
              <input type="checkbox" className="size-4 accent-[var(--fg)]" checked={editor.apps.includes(app.slug)} onChange={() => toggle(app.slug)} />
              <BrandIcon name={app.slug} size={16} />
              <span className="min-w-0 flex-1 truncate">{app.name}</span>
              {watched === app.slug && <span className="text-[12px] text-muted">The trigger’s app</span>}
            </label>
          </li>
        ))}
        {stale.map((slug) => (
          <li key={slug}>
            <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13.5px] text-danger hover:bg-surface-2">
              <input type="checkbox" className="size-4" checked onChange={() => toggle(slug)} />
              <BrandIcon name={slug} size={16} />
              <span className="min-w-0 flex-1 truncate">{titleCase(slug)}</span>
              <span className="text-[12px]">Not connected or not on your plan</span>
            </label>
          </li>
        ))}
        {choices.notOnPlan.map((app) => (
          <li key={app.slug} className="flex h-9 items-center gap-2.5 px-2 text-[13.5px] text-muted">
            <input type="checkbox" className="size-4" disabled aria-label={`${app.name} isn’t on your plan`} />
            <BrandIcon name={app.slug} size={16} />
            <span className="min-w-0 flex-1 truncate">{app.name}</span>
            <Link href={PRICING_PATH} className="text-[12px] font-medium text-accent hover:text-accent-dark">
              Not on your plan
            </Link>
          </li>
        ))}
      </ul>
      {choices.usable.length === 0 && <p className="text-[12.5px] text-muted">No app is connected yet.</p>}
      <p className="text-[12px] text-muted">
        Only connected apps your plan includes can be ticked.{" "}
        <Link href={INTEGRATIONS_APPS_PATH} className={LINK}>
          Connect more
        </Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- asks you first

function Choice({ on, onPick, title, children }: { on: boolean; onPick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn("flex flex-col gap-1 rounded-[10px] border p-3 text-left transition-colors", on ? "border-fg bg-surface" : "border-line bg-surface hover:border-line-strong")}
    >
      <span className="flex items-center gap-2 text-[13.5px] font-semibold">
        <span aria-hidden className={cn("grid size-4 place-items-center rounded-full border", on ? "border-fg" : "border-line-strong")}>
          {on && <span className="size-2 rounded-full bg-fg" />}
        </span>
        {title}
      </span>
      <span className="pl-6 text-[12.5px] text-fg-2">{children}</span>
    </button>
  );
}

export function AsksForm({ editor, onChange, problems }: FormProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <Problems problems={problems} />
      <div role="radiogroup" aria-label="When Tex asks you first" className="flex flex-col gap-2">
        <Choice on={editor.askFirst === "risky"} onPick={() => onChange({ ...editor, askFirst: "risky" })} title={ASKS_FIRST}>
          The platform’s rule: before Tex sends something to another person, deletes something or pays, it asks you in the chat.
        </Choice>
        <Choice on={editor.askFirst === "changes"} onPick={() => onChange({ ...editor, askFirst: "changes" })} title={ASKS_CHANGES}>
          Stricter: any app action that changes something (creating, updating, sending, deleting) waits for your OK. Reading and searching still don’t ask.
        </Choice>
      </div>
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
    <div className="flex flex-col gap-3.5">
      <Problems problems={problems} />
      <label className="flex items-start gap-2.5 text-[13.5px]">
        <input type="checkbox" className="mt-0.5 size-4" checked disabled aria-describedby="results-always" />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Your Automations chat</span>
          <span id="results-always" className="text-[12.5px] text-muted">
            Always: every run answers there, never in your other chats. Write there to follow up.
          </span>
        </span>
      </label>
      {telegram || editor.copyTo === "telegram" ? (
        <label className="flex items-start gap-2.5 text-[13.5px]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--fg)]"
            checked={editor.copyTo === "telegram"}
            onChange={(event) => onChange({ ...editor, copyTo: event.target.checked ? "telegram" : null })}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Also a copy to Telegram</span>
            <span className="text-[12.5px] text-muted">{telegram ? `To your linked chat, ${telegram.displayId}.` : "No Telegram chat is linked now."}</span>
          </span>
        </label>
      ) : (
        <p className="text-[12.5px] text-muted">
          Want a copy of each answer on Telegram?{" "}
          <Link href={linkChatHref("telegram")} className={LINK}>
            Link your Telegram
          </Link>{" "}
          first, then tick it here.
        </p>
      )}
      {other && (
        <label className="flex items-start gap-2.5 text-[13.5px]">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--fg)]" checked onChange={() => onChange({ ...editor, copyTo: null })} />
          <span className="font-medium">Also a copy to {titleCase(other)}</span>
        </label>
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
