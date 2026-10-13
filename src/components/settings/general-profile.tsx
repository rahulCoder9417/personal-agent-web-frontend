"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Combobox } from "@/components/select";
import { toastError } from "@/components/toast";
import { Button, Card, inputClass, Pill } from "@/components/ui";
import type { Me } from "@/lib/api/client";
import { useUpdateMe } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import { SettingRow, SettingsGroup } from "./settings-rows";
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
  const nameError = dirty && trimmed.length === 0 ? "Your name can’t be empty." : null;

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
    <SettingsGroup title="Profile">
      <Card>
        <form onSubmit={save} noValidate>
          <SettingRow label="Name" htmlFor={`${id}-name`} help="Tex uses this when it writes on your behalf.">
            <input
              id={`${id}-name`}
              value={name}
              maxLength={NAME_MAX}
              autoComplete="name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${id}-name-error` : undefined}
              onChange={(event) => setName(event.target.value)}
              className={cn(inputClass, nameError && "border-danger")}
            />
            {nameError && (
              <p id={`${id}-name-error`} role="alert" className="mt-1.5 text-[12.5px] text-danger">
                {nameError}
              </p>
            )}
          </SettingRow>

          <SettingRow label="Email">
            <div className="flex min-w-0 items-center gap-2 sm:justify-end">
              <span className="truncate text-[13.5px]">{me.email}</span>
              {me.emailVerified ? <Pill tone="done">Verified</Pill> : <Pill tone="danger">Not verified</Pill>}
            </div>
          </SettingRow>

          <SettingRow label="Time zone" htmlFor={`${id}-tz`} help="Automations and reminders run in this time zone.">
            <Combobox
              id={`${id}-tz`}
              label="Time zone"
              value={timezone}
              options={zones}
              onChange={setTimezone}
              minListWidth={320}
              placeholder="Search for a city or region"
              emptyText={(query) => `No time zone matches “${query}”. Try a city, such as London or Kolkata.`}
            />
          </SettingRow>

          <div className="flex items-center justify-end gap-3 px-5 py-3">
            {update.isSuccess && !dirty && (
              <span role="status" className="text-[13px] text-success">
                Saved
              </span>
            )}
            <Button type="submit" variant="primary" disabled={!dirty || Boolean(nameError)} pending={update.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
    </SettingsGroup>
  );
}
