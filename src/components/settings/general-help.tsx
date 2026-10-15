import { ButtonLink, Card } from "@/components/ui";
import { SettingRow, SettingsGroup } from "./settings-rows";

/** The way to the Help page, for someone who went looking for it in Settings. */
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
      </Card>
    </SettingsGroup>
  );
}
