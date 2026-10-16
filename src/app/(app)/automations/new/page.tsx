"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DraftScreen } from "@/components/automations/draft-screen";
import { NewAutomation } from "@/components/automations/new-automation";

/** Reads `?draft=` (which needs a Suspense boundary on a page that is prerendered). */
function NewOrDraft() {
  const draftId = useSearchParams().get("draft");
  return draftId ? <DraftScreen draftId={draftId} /> : <NewAutomation />;
}

/**
 * `/automations/new?draft=drf_…`: a draft Tex proposed, on the canvas, to check and save. Without a
 * draft: how a new automation is made (by asking Tex: building one by hand comes later).
 */
export default function NewAutomationPage() {
  return (
    <Suspense fallback={null}>
      <NewOrDraft />
    </Suspense>
  );
}
