"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DraftScreen } from "@/components/automations/draft-screen";
import { NewAutomation } from "@/components/automations/new-automation";

/** Reads `?draft=` (which needs a Suspense boundary on a page that is prerendered). */
function NewOrDraft() {
  const params = useSearchParams();
  const draftId = params.get("draft");
  return draftId ? <DraftScreen draftId={draftId} /> : <NewAutomation templateId={params.get("template")} />;
}

/**
 * `/automations/new?draft=drf_…`: a draft Tex proposed, on the canvas, to check and save. Without a
 * draft: an empty canvas to build one by hand, with templates (`?template=daily-briefing` opens with
 * one filled in), or the way to ask Tex instead.
 */
export default function NewAutomationPage() {
  return (
    <Suspense fallback={null}>
      <NewOrDraft />
    </Suspense>
  );
}
