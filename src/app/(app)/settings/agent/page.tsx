"use client";

import { PageBody } from "@/components/page";
import { AI_CHOICES_INTRO, TextcrewAiSection } from "@/components/settings/agent-choice";
import { ClaudePlanSection } from "@/components/settings/agent-claude";
import { CrewModels, crewDescription } from "@/components/settings/agent-crew";
import { ApiKeysSection } from "@/components/settings/agent-keys";
import { RunningNowCard, RuntimeChoice } from "@/components/settings/agent-runtime";
import { describeAiChoices } from "@/components/settings/agent-summary";
import { SETTINGS_COLUMN, SettingRow, SettingsGroup } from "@/components/settings/settings-rows";
import { Card, ErrorState, SkeletonRows } from "@/components/ui";
import { useAgentSettings } from "@/lib/api/hooks";

/**
 * Settings → Agent & AI, in one column: what runs now (and how that is decided, folded away), then
 * the engine (which agent), the crew (Claude Code's model and effort for Tex and for each of the
 * crew), then the three ways to give Tex its AI, in the order we recommend them.
 */
export default function AgentSettingsPage() {
  const settings = useAgentSettings();

  if (settings.isPending) {
    return (
      <PageBody className={SETTINGS_COLUMN}>
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      </PageBody>
    );
  }
  if (settings.isError) {
    return (
      <PageBody className={SETTINGS_COLUMN}>
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      </PageBody>
    );
  }

  const choices = describeAiChoices(settings.data);
  const connected = settings.data.claude.connected;

  return (
    <PageBody className={SETTINGS_COLUMN}>
      <RunningNowCard settings={settings.data} />

      <SettingsGroup id="engine" title="Engine" description="Which agent runs Tex. The models below apply when Claude Code is the engine.">
        <Card>
          <SettingRow wide label="Agent" help={connected ? undefined : "Claude Code becomes a choice once your Claude plan is connected."}>
            <RuntimeChoice settings={settings.data} />
          </SettingRow>
        </Card>
      </SettingsGroup>

      <SettingsGroup id="crew" title="Crew" description={crewDescription(settings.data)}>
        <CrewModels settings={settings.data} />
      </SettingsGroup>

      <SettingsGroup id="ai-access" title="AI access" description={AI_CHOICES_INTRO}>
        <div className="flex flex-col gap-4">
          <ApiKeysSection state={choices.own_key} />
          <ClaudePlanSection settings={settings.data} state={choices.claude_plan} />
          <TextcrewAiSection settings={settings.data} state={choices.textcrew} />
        </div>
      </SettingsGroup>
    </PageBody>
  );
}
