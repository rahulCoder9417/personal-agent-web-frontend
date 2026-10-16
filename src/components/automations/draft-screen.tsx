"use client";

// A draft Tex proposed (or the person's own version, kept for Tex), on the canvas:
// `/automations/new?draft=…`, or for a change of an automation `/automations/<it>?draft=…`, where
// the boxes it changes are marked. An open draft can be saved as it is, saved paused, changed on the
// canvas first, or discarded. Nothing runs until it is saved. A draft that is no longer open is shown
// as it was, with what became of it.

import { useMemo } from "react";
import { ApiError, type AutomationDraft } from "@/lib/api/client";
import { useAutomation, useAutomationDraft, useDiscardAutomationDraft, useMe } from "@/lib/api/hooks";
import { editorFrom } from "@/lib/automation-editor";
import { automationHref, changedSteps, draftExpiry, draftFirstRun, draftHref, draftState } from "@/lib/automation-flow";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { CheckIcon } from "../icons";
import { toast, toastError } from "../toast";
import { EmptyState, ErrorState } from "../ui";
import { CanvasFrame } from "./automation-screen";
import { Builder } from "./builder";
import { BtnLink, Dot, T2 } from "./parts";

/** What the draft is, and what became of it: under the canvas's top bar. */
function DraftBanner({ draft, changing }: { draft: AutomationDraft; changing: string | null }) {
  const state = draftState(draft);
  if (state.tone === "waiting") {
    const firstRun = draftFirstRun(draft);
    return (
      <p role="status" className={cn(T2, "flex items-start gap-2 text-fg-2")}>
        <span className="flex h-5 shrink-0 items-center">
          <Dot tone="warn" />
        </span>
        <span>
          <span className="font-semibold text-fg">Not saved yet.</span> {draft.madeBy === "user" ? "Your own version, kept for Tex to change." : "Tex proposed this in the chat."} Nothing runs until you
          save it; change any box first if you like.
          {changing && <> Saving replaces “{changing}” with this version.</>} <span className="text-muted">{[firstRun, draftExpiry(draft)].filter(Boolean).join(" · ")}.</span>
        </span>
      </p>
    );
  }
  if (draft.status === "saved")
    return (
      <div role="status" className={cn(T2, "flex flex-wrap items-center gap-x-4 gap-y-2")}>
        <p className="flex min-w-0 flex-1 items-center gap-2">
          <CheckIcon size={16} className="shrink-0 text-success" />
          <span>
            <span className="font-semibold">Saved.</span> It runs from now on, and each result lands in your Automations chat.
          </span>
        </p>
        {draft.automationId && (
          <BtnLink href={automationHref(draft.automationId)} size="sm" variant="primary">
            Open the automation
          </BtnLink>
        )}
      </div>
    );
  if (draft.status === "replaced")
    return (
      <div role="status" className={cn(T2, "flex flex-wrap items-center gap-x-4 gap-y-2")}>
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Tex made a newer version</span> of this draft, so this one can no longer be saved.
        </p>
        {draft.replacedBy && (
          <BtnLink href={draftHref({ id: draft.replacedBy, changeOf: draft.changeOf })} size="sm" variant="primary">
            Open it
          </BtnLink>
        )}
      </div>
    );
  return (
    <div role="status" className={cn(T2, "flex flex-wrap items-center gap-x-4 gap-y-2")}>
      <p className="min-w-0 flex-1">
        {state.line} {state.label === "Expired" && <span className="text-muted">A draft is kept for 7 days.</span>}
      </p>
      <BtnLink href={chatDraftHref(`Set up again: ${draft.title}`)} size="sm">
        Ask Tex in chat
      </BtnLink>
    </div>
  );
}

function DraftBody({ draft }: { draft: AutomationDraft }) {
  const zone = useMe().data?.timezone ?? "UTC";
  // A change: the automation it changes, to mark the boxes that differ, and to save it in place.
  const current = useAutomation(draft.changeOf ?? "", { enabled: draft.changeOf !== null });
  const before = draft.changeOf ? current.data : undefined;
  const state = draftState(draft);
  const discard = useDiscardAutomationDraft();
  const changed = useMemo(() => (before ? changedSteps(draft, before) : undefined), [draft, before]);
  const start = useMemo(() => editorFrom(draft, zone), [draft, zone]);
  const open = state.tone === "waiting";
  // A change is saved against the automation it changes, so that has to be there.
  const waitingForIt = open && draft.changeOf !== null && !before;
  const readOnly = open ? (waitingForIt ? (current.isError ? "The automation this changes isn’t here any more, so this change can’t be saved." : "Loading the automation this changes…") : null) : "This draft can’t be changed now.";

  return (
    <Builder
      key={`${draft.id}:${before ? "change" : "new"}`}
      target={before ? { kind: "change", automation: before, draft } : { kind: "new", draft }}
      start={start}
      accountZone={zone}
      readOnly={readOnly}
      banner={<DraftBanner draft={draft} changing={before?.title ?? null} />}
      changed={changed}
      onDiscard={() =>
        discard.mutate(draft.id, {
          onSuccess: () => toast({ title: `Discarded “${draft.title}”`, body: "Nothing was set up." }),
          onError: (error) => toastError(`Couldn’t discard “${draft.title}”`, error),
        })
      }
    />
  );
}

/** A draft by its id: loading, not found, failed, or the draft on the canvas. */
export function DraftScreen({ draftId }: { draftId: string }) {
  const draft = useAutomationDraft(draftId);
  const missing = draft.error instanceof ApiError && draft.error.status === 404;
  if (draft.data) return <DraftBody draft={draft.data} />;
  return (
    <CanvasFrame current={missing ? "Not here" : "A draft"}>
      {missing ? (
        <EmptyState
          mood="paused"
          title="This draft isn’t here"
          action={
            <BtnLink href="/" variant="primary">
              Ask Tex in chat
            </BtnLink>
          }
        >
          A draft is removed 30 days after Tex proposed it, and a link from another account doesn’t open here. Ask Tex again.
        </EmptyState>
      ) : draft.isError ? (
        <ErrorState error={draft.error} onRetry={() => void draft.refetch()} />
      ) : (
        <div aria-hidden className="mx-auto flex max-w-[340px] flex-col gap-12">
          {[0, 1, 2].map((row) => (
            <span key={row} className="h-[100px] animate-pulse rounded-[14px] bg-surface-2" />
          ))}
        </div>
      )}
    </CanvasFrame>
  );
}
