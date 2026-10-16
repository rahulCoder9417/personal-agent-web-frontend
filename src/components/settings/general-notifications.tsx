"use client";

import { useId } from "react";
import { Select } from "@/components/select";
import { toast, toastError } from "@/components/toast";
import { Card, Switch } from "@/components/ui";
import type { Me } from "@/lib/api/client";
import { useChannels, useUpdateNotifications } from "@/lib/api/hooks";
import {
  changeToast,
  clockLabel,
  clockOptions,
  NOTICE_SWITCHES,
  TELEGRAM_NOTICES_ID,
  withNotificationChange,
  type NotificationSettingsUpdate,
} from "@/lib/notifications";
import { SettingRow, SettingsGroup } from "./settings-rows";

/**
 * "Tell me on Telegram when…": three switches and quiet hours. Only once Telegram is linked: before
 * that there is nowhere to tell. Each change is saved at once and said in a toast; one the backend
 * refuses is put back.
 */
export function TelegramNoticesSection({ me }: { me: Me }) {
  const channels = useChannels();
  const update = useUpdateNotifications();
  const id = useId();
  const linked = (channels.data ?? []).some((link) => link.channel === "telegram");
  if (!linked) return null;

  const settings = me.notifications;
  const quiet = settings.quietHours;
  const save = (change: NotificationSettingsUpdate) =>
    update.mutate(change, {
      onSuccess: () => toast({ title: changeToast(change, withNotificationChange(settings, change)) }),
      onError: (error) => toastError("Couldn’t save that", error),
    });

  return (
    <SettingsGroup
      id={TELEGRAM_NOTICES_ID}
      title="Tell me on Telegram when…"
      description="Always in addition to the chat you asked in, never instead. Approvals reach Telegram too, whatever these say."
    >
      <Card>
        {NOTICE_SWITCHES.map(({ key, label, help }) => (
          <SettingRow key={key} label={label} help={help}>
            <div className="flex justify-end">
              <Switch on={settings[key]} label={label} onToggle={() => save({ [key]: !settings[key] })} />
            </div>
          </SettingRow>
        ))}
      </Card>
      <Card>
        <SettingRow
          label="Quiet hours"
          help={`In your time zone (${me.timezone}). Messages still arrive at once, without a sound.`}
        >
          <div className="flex justify-end">
            <Switch on={quiet.enabled} label="Quiet hours" onToggle={() => save({ quietHours: { enabled: !quiet.enabled } })} />
          </div>
        </SettingRow>
        {quiet.enabled && (
          <SettingRow label="Between" htmlFor={`${id}-start`} help={`${clockLabel(quiet.start)} to ${clockLabel(quiet.end)}${quiet.start > quiet.end ? ", over midnight" : ""}.`}>
            <div className="flex items-center gap-2">
              <Select
                id={`${id}-start`}
                label="Quiet from"
                value={quiet.start}
                options={clockOptions(quiet.start).filter((o) => o.value !== quiet.end)}
                onChange={(start) => save({ quietHours: { start } })}
                className="flex-1"
              />
              <span className="text-[13px] text-muted">to</span>
              <Select
                id={`${id}-end`}
                label="Quiet until"
                value={quiet.end}
                options={clockOptions(quiet.end).filter((o) => o.value !== quiet.start)}
                onChange={(end) => save({ quietHours: { end } })}
                className="flex-1"
              />
            </div>
          </SettingRow>
        )}
      </Card>
    </SettingsGroup>
  );
}
