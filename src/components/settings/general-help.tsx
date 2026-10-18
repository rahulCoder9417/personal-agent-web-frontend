"use client";

import { SupportButtons } from "@/components/help/contact-support";
import { ButtonLink, Card } from "@/components/ui";
import { SettingRow, SettingsGroup } from "./settings-rows";

/** The way to the Help page, and to support, for someone who went looking for them in Settings. */
export function HelpSection() {
  return (
    <SettingsGroup id="help" title="Help" description="How Textcrew works, in short answers.">
      <Card>
        <SettingRow
          label="How Textcrew works"
          help="Telegram commands such as /new, your AI, apps, approvals, automations, credits and privacy."
        >
          <div className="flex sm:justify-end">
            <ButtonLink href="/help">Open Help</ButtonLink>
          </div>
        </SettingRow>
        <SettingRow label="Contact support" help="Write to support@textcrew.in. We usually reply within a day.">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <SupportButtons size="md" />
          </div>
        </SettingRow>
      </Card>
    </SettingsGroup>
  );
}
