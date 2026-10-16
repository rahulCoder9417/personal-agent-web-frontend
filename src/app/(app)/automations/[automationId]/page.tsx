"use client";

import { use } from "react";
import { AutomationScreen } from "@/components/automations/automation-screen";
import { DraftScreen } from "@/components/automations/draft-screen";
import { Page } from "@/components/page";

/**
 * `/automations/aut_…`: one automation on its canvas, ready to change (pull-request review on its
 * own, with fixed boxes). With `?draft=drf_…`: a change Tex proposed for it, with the boxes it
 * changes marked, to save or not. `?edit=1`, from older links, opens the same canvas.
 */
export default function AutomationPage({ params, searchParams }: PageProps<"/automations/[automationId]">) {
  const { automationId } = use(params);
  const { draft } = use(searchParams);
  const draftId = typeof draft === "string" && draft ? draft : null;
  return <Page>{draftId ? <DraftScreen draftId={draftId} /> : <AutomationScreen automationId={decodeURIComponent(automationId)} />}</Page>;
}
