"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ApiError, type AutomationDraft } from "@/lib/api/client";
import { useAutomation, useAutomationDraft, useDiscardAutomationDraft, useMe } from "@/lib/api/hooks";
import { automationFlow, automationHref, changedSteps, draftExpiry, draftFirstRun, draftHref, draftState } from "@/lib/automation-flow";
import { chatDraftHref } from "@/lib/chat-link";
import { AUTOMATION_KIND_LABEL, cn } from "@/lib/format";
import { ConfirmButton } from "../confirm-button";
import { CheckIcon } from "../icons";
import { PageBody, READING } from "../page";
import { toast, toastError } from "../toast";
import { Button, ButtonLink, EmptyState, ErrorState, Pill } from "../ui";
import { AutomationHeading, BackToAutomations } from "./automation-screen";
import { FlowView } from "./flow-view";
import { useDraftSave } from "./use-draft-save";

// A draft Tex proposed, on the canvas: `/automations/new?draft=…`, or for a change of an automation
// `/automations/<it>?draft=…`, where the steps it changes are marked. The person saves it here (or
// saves it paused, to turn on later), or discards it. Nothing runs until it is saved.

const LINK = "font-medium text-accent hover:text-accent-dark";

function Banner({ tone, children }: { tone: "waiting" | "done" | "muted"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl px-4 py-3 text-[13.5px]",
        tone === "waiting" && "bg-accent-soft text-fg",
        tone === "done" && "bg-success-soft text-fg",
        tone === "muted" && "bg-surface-2 text-fg-2",
      )}
    >
      {children}
    </div>
  );
}

/** What the draft is and what can be done with it, by its state. */
function DraftBanner({ draft, changing }: { draft: AutomationDraft; changing?: string | null }) {
  const state = draftState(draft);
  const { save, pending, paused } = useDraftSave();
  const discard = useDiscardAutomationDraft();

  if (state.tone === "waiting") {
    const firstRun = draftFirstRun(draft);
    return (
      <Banner tone="waiting">
        <p className="min-w-0 flex-1 basis-[320px]">
          <span className="font-semibold">Not saved yet.</span> Tex proposed this in the chat. Nothing runs until you save it.
          {changing && <> Saving replaces “{changing}” with this version.</>}{" "}
          <span className="text-muted">{[firstRun, draftExpiry(draft)].filter(Boolean).join(" · ")}.</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" pending={pending && !paused} disabled={pending} onClick={() => save(draft)}>
            Save
          </Button>
          <Button pending={paused} disabled={pending} onClick={() => save(draft, false)}>
            Save paused
          </Button>
          <ConfirmButton
            label="Discard"
            confirmLabel="Discard draft"
            ariaLabel={`Discard the draft ${draft.title}`}
            pending={discard.isPending}
            onConfirm={() =>
              discard.mutate(draft.id, {
                onSuccess: () => toast({ title: `Discarded “${draft.title}”`, body: "Nothing was set up." }),
                onError: (error) => toastError(`Couldn’t discard “${draft.title}”`, error),
              })
            }
          />
        </div>
      </Banner>
    );
  }
  if (draft.status === "saved")
    return (
      <Banner tone="done">
        <p className="flex min-w-0 flex-1 items-center gap-2">
          <CheckIcon size={15} className="shrink-0 text-success" />
          <span>
            <span className="font-semibold">Saved.</span> It runs from now on, and each result lands in your Automations chat.
          </span>
        </p>
        {draft.automationId && (
          <ButtonLink href={automationHref(draft.automationId)} variant="primary">
            Open the automation
          </ButtonLink>
        )}
      </Banner>
    );
  if (draft.status === "replaced")
    return (
      <Banner tone="muted">
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Tex made a newer version</span> of this draft, so this one can no longer be saved.
        </p>
        {draft.replacedBy && (
          <ButtonLink href={draftHref({ id: draft.replacedBy, changeOf: draft.changeOf })} variant="primary">
            Open it
          </ButtonLink>
        )}
      </Banner>
    );
  return (
    <Banner tone="muted">
      <p className="min-w-0 flex-1">
        {state.line}{" "}
        {state.label === "Expired" && <span className="text-muted">A draft is kept for 7 days.</span>}
      </p>
      <ButtonLink href={chatDraftHref(`Set up again: ${draft.title}`)}>Ask Tex in chat</ButtonLink>
    </Banner>
  );
}

/** A draft by its id: loading, not found, failed, or the draft on the canvas. */
export function DraftScreen({ draftId }: { draftId: string }) {
  const draft = useAutomationDraft(draftId);
  const missing = draft.error instanceof ApiError && draft.error.status === 404;
  return (
    <PageBody className="gap-6">
      <BackToAutomations />
      {draft.data ? (
        <DraftBody draft={draft.data} />
      ) : missing ? (
        <EmptyState
          mood="paused"
          title="This draft isn’t here"
          action={
            <ButtonLink href="/" variant="primary">
              Ask Tex in chat
            </ButtonLink>
          }
        >
          A draft is removed 30 days after Tex proposed it, and a link from another account doesn’t open here. Ask Tex again.
        </EmptyState>
      ) : draft.isError ? (
        <ErrorState error={draft.error} onRetry={() => void draft.refetch()} />
      ) : (
        <div aria-hidden className="flex flex-col gap-5">
          <span className="h-12 w-1/3 animate-pulse rounded-xl bg-surface-2" />
          <span className="h-[260px] animate-pulse rounded-xl bg-surface-2" />
        </div>
      )}
    </PageBody>
  );
}

function DraftBody({ draft }: { draft: AutomationDraft }) {
  const timezone = useMe().data?.timezone;
  // A change: the automation it changes, to mark the steps that differ. Gone since: drawn as new.
  const current = useAutomation(draft.changeOf ?? "", { enabled: draft.changeOf !== null });
  const before = draft.changeOf ? current.data : undefined;
  const state = draftState(draft);
  const settled = state.tone === "waiting" ? undefined : state;
  const steps = useMemo(() => automationFlow({ ...draft, settled }, timezone), [draft, settled, timezone]);
  const changed = useMemo(() => (before ? changedSteps(draft, before) : undefined), [draft, before]);

  return (
    <>
      <AutomationHeading
        automation={draft}
        title={draft.title}
        kindLabel={draft.changeOf ? `A change · ${AUTOMATION_KIND_LABEL[draft.kind]}` : `A draft · ${AUTOMATION_KIND_LABEL[draft.kind]}`}
        status={<Pill tone={state.tone}>{state.label}</Pill>}
      />
      <p className={cn("-mt-2 text-[13.5px] text-muted", READING)}>
        {draft.changeOf ? (
          <>
            How the automation would run after this change, step by step. The steps marked “Changed” are different from{" "}
            {before ? (
              <Link href={automationHref(before.id)} className={LINK}>
                “{before.title}”
              </Link>
            ) : (
              "the automation it changes"
            )}{" "}
            as it runs now.
          </>
        ) : (
          "How Tex would run it, step by step. Check each step; to change something, tell Tex in chat and it proposes a new version."
        )}
      </p>
      <DraftBanner draft={draft} changing={before?.title ?? null} />
      <FlowView steps={steps} kind={draft.kind} changed={changed} label={`The draft “${draft.title}”, step by step`} />
    </>
  );
}
