"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DraftScreen } from "@/components/automations/draft-screen";
import { NewAutomation, NewBuilder } from "@/components/automations/new-automation";
import { ReviewBuilder } from "@/components/automations/review-builder";
import { Page } from "@/components/page";
import { EDITOR_TEMPLATES } from "@/lib/automation-editor";
import { findShape } from "@/lib/automation-lanes";

/** Reads the address's query (which needs a Suspense boundary on a page that is prerendered). */
function NewOrDraft() {
  const params = useSearchParams();
  const draftId = params.get("draft");
  const template = params.get("template");
  const shape = params.get("shape");
  if (draftId) return <DraftScreen draftId={draftId} />;
  if (template === "pr-review") return <ReviewBuilder automation={null} />;
  if (EDITOR_TEMPLATES.some((item) => item.id === template) || findShape(shape)) return <NewBuilder templateId={template} shapeId={shape} />;
  return <NewAutomation />;
}

/**
 * `/automations/new`: ask Tex in words, or pick how it works. `?shape=read-act` (and the other
 * shapes) or `?template=morning-email` opens the canvas with it filled in; `?template=pr-review` is
 * pull-request review for a new repo; `?draft=drf_…` is a draft Tex proposed, to check and save.
 */
export default function NewAutomationPage() {
  return (
    <Page>
      <Suspense fallback={null}>
        <NewOrDraft />
      </Suspense>
    </Page>
  );
}
