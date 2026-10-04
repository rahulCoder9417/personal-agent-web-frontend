"use client";

import { PageBody } from "@/components/page";
import { AiChoicesIntro, TextcrewAiSection } from "@/components/settings/agent-choice";
import { ClaudePlanSection } from "@/components/settings/agent-claude";
import { ApiKeysSection } from "@/components/settings/agent-keys";
import { HowItsDecided, RunningNowCard, RuntimeSection } from "@/components/settings/agent-runtime";
import { describeAiChoices } from "@/components/settings/agent-summary";
import { Card, ErrorState, SkeletonRows } from "@/components/ui";
import { useAgentSettings } from "@/lib/api/hooks";

export default function AgentSettingsPage() {
  const settings = useAgentSettings();

  if (settings.isPending) {
    return (
      <PageBody>
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      </PageBody>
    );
  }
  if (settings.isError) {
    return (
      <PageBody>
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      </PageBody>
    );
  }

  const choices = describeAiChoices(settings.data);

  return (
    <PageBody>
      <RunningNowCard settings={settings.data} />
      <div className="grid items-start gap-x-7 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* The three ways to get AI, in the order we recommend them. */}
        <div className="flex min-w-0 flex-col gap-6">
          <AiChoicesIntro />
          <ApiKeysSection state={choices.own_key} />
          <ClaudePlanSection settings={settings.data} state={choices.claude_plan} />
          <TextcrewAiSection settings={settings.data} state={choices.textcrew} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <RuntimeSection settings={settings.data} />
          <HowItsDecided />
        </div>
      </div>
    </PageBody>
  );
}
