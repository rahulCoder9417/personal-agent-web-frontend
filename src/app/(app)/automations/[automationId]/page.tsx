"use client";

import { use } from "react";
import { AutomationScreen } from "@/components/automations/automation-screen";
import { DraftScreen } from "@/components/automations/draft-screen";

/**
 * `/automations/aut_…`: one automation, drawn as its flow (the canvas, or a list on a phone). With
 * `?draft=drf_…`: a change Tex proposed for it, with the steps it changes marked, to save or not.
 * With `?edit=1`: the same page with its boxes ready to change (the card's Change).
 */
export default function AutomationPage({ params, searchParams }: PageProps<"/automations/[automationId]">) {
  const { automationId } = use(params);
  const { draft, edit } = use(searchParams);
  const draftId = typeof draft === "string" && draft ? draft : null;
  return draftId ? <DraftScreen draftId={draftId} /> : <AutomationScreen automationId={decodeURIComponent(automationId)} editing={edit === "1"} />;
}
