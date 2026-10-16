"use client";

import { use } from "react";
import { AutomationScreen } from "@/components/automations/automation-screen";

/** `/automations/aut_…`: one automation, drawn as its flow (the canvas, or a list on a phone). */
export default function AutomationPage({ params }: PageProps<"/automations/[automationId]">) {
  const { automationId } = use(params);
  return <AutomationScreen automationId={decodeURIComponent(automationId)} />;
}
