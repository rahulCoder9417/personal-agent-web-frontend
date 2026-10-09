"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { toastError } from "@/components/toast";
import { Button, Card, Field, inputClass, Pill, SectionLabel } from "@/components/ui";
import type { Me } from "@/lib/api/client";
import { useUpdateMe } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import { timezoneOptions } from "./timezones";

const NAME_MAX = 80;

/** Name and time zone. Render it with `key={me.id}` so the fields start from the saved values. */
export function ProfileSection({ me }: { me: Me }) {
  const update = useUpdateMe();
  const [name, setName] = useState(me.name);
  const [timezone, setTimezone] = useState(me.timezone);
  const zones = useMemo(() => timezoneOptions(me.timezone), [me.timezone]);
  const id = useId();

  const trimmed = name.trim();
  const dirty = trimmed !== me.name || timezone !== me.timezone;
  const nameError = trimmed.length === 0 ? "Your name can’t be empty." : null;

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || nameError) return;
    update.mutate(
      {
        ...(trimmed !== me.name ? { name: trimmed } : {}),
        ...(timezone !== me.timezone ? { timezone } : {}),
      },
      { onSuccess: () => setName(trimmed), onError: (error) => toastError("Couldn’t save your profile", error) },
    );
  };

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <SectionLabel>
        <span id={`${id}-title`}>Profile</span>
      </SectionLabel>
      <Card className="p-5">
        <form onSubmit={save} noValidate className="flex flex-col gap-4">
          <Field label="Name" htmlFor={`${id}-name`} hint="Tex uses this when it writes on your behalf." error={dirty ? nameError : null}>
            <input
              id={`${id}-name`}
              value={name}
              maxLength={NAME_MAX}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium">Email</span>
            <div className="flex h-[38px] items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3">
              <span className="truncate text-[12.5px]">{me.email}</span>
              {me.emailVerified ? <Pill tone="done">Verified</Pill> : <Pill tone="danger">Not verified</Pill>}
            </div>
          </div>

          <Field label="Time zone" htmlFor={`${id}-tz`} hint="Automations and reminders run in this time zone.">
            <select
              id={`${id}-tz`}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className={cn(inputClass, "pr-2")}
            >
              {zones.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={!dirty || Boolean(nameError)} pending={update.isPending}>
              Save changes
            </Button>
            {update.isSuccess && !dirty && (
              <span role="status" className="text-[13px] text-success">
                Saved
              </span>
            )}
          </div>
        </form>
      </Card>
    </section>
  );
}
