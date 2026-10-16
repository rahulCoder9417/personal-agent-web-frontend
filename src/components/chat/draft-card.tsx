"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ApiError, type AutomationDraft, type Message } from "@/lib/api/client";
import { useAutomationDraft, useMe } from "@/lib/api/hooks";
import { automationFlow, automationHref, draftExpiry, draftFirstRun, draftHref, draftState } from "@/lib/automation-flow";
import { cn } from "@/lib/format";
import { FlowColumn } from "../automations/flow-parts";
import { useDraftSave } from "../automations/use-draft-save";
import { CheckIcon } from "../icons";
import { Button, ButtonLink } from "../ui";
import { AgentBubble } from "./agent-bubble";

// A draft Tex proposed, in the chat: the automation it would make, drawn small as its five steps
// (plain HTML, not the canvas), "Not saved yet", and the two ways on: Save, or Open in Automations
// to see it on the canvas. Nothing runs until it is saved. The card follows the draft as it changes
// (`automation_draft.updated`): saved, replaced by a newer one, discarded, expired.

const LINK = "font-medium text-accent hover:text-accent-dark";

/** The foot of a card for a draft that is no longer open: what became of it, and where to go. */
function Settled({ draft }: { draft: AutomationDraft }) {
  const state = draftState(draft);
  if (draft.status === "saved" && draft.automationId)
    return (
      <p className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[13px] font-medium text-success">
        <CheckIcon size={14} />
        Saved ·{" "}
        <Link href={automationHref(draft.automationId)} className={LINK}>
          Open
        </Link>
      </p>
    );
  return (
    <p className="border-t border-line px-4 py-2.5 text-[13px] text-muted">
      {state.line}
      {draft.status === "replaced" && draft.replacedBy && (
        <>
          {" "}
          <Link href={draftHref({ id: draft.replacedBy, changeOf: draft.changeOf })} className={LINK}>
            Open it
          </Link>
        </>
      )}
    </p>
  );
}

/** The card for one draft, by its id. */
export function DraftCard({ draftId }: { draftId: string }) {
  const { data: draft, isLoading, error } = useAutomationDraft(draftId);
  const timezone = useMe().data?.timezone;
  const { save, pending } = useDraftSave();
  const steps = useMemo(() => (draft ? automationFlow(draft, timezone) : []), [draft, timezone]);

  if (isLoading) return <div aria-hidden className="h-[260px] w-full max-w-[480px] animate-pulse rounded-2xl bg-surface-2" />;
  if (!draft) {
    // Removed after 30 days (404), or it can't be read now.
    const gone = !error || (error instanceof ApiError && error.status === 404);
    return (
      <div className="w-full max-w-[480px] rounded-2xl bg-surface px-4 py-3 text-[13px] text-muted shadow-[0_0_0_1px_var(--line)]">
        {gone ? "This draft expired. Ask Tex again." : "The draft didn’t load. Open the chat again to retry."}
      </div>
    );
  }

  const state = draftState(draft);
  const open = state.tone === "waiting";
  const firstRun = draftFirstRun(draft);

  return (
    <section
      aria-label={`Draft automation: ${draft.title}`}
      className={cn(
        "flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-surface",
        open ? "shadow-[0_0_0_1px_var(--accent),0_10px_30px_-14px_rgb(51_85_245/0.45)]" : "shadow-[0_0_0_1px_var(--line)]",
      )}
    >
      <div className="flex flex-col gap-0.5 px-4 pt-3.5 pb-2">
        <span className={cn("text-[12px] font-semibold", open ? "text-accent" : "text-muted")}>
          {state.label}
          {open && <span className="font-normal text-muted"> · {draft.changeOf ? "a change to an automation" : "a new automation"}</span>}
        </span>
        <span className={cn("text-[15px] leading-snug font-semibold tracking-[-0.01em] break-words", !open && "text-nav")}>{draft.title}</span>
      </div>

      {/* Once it is no longer open, the card folds to its name and what became of it. */}
      {open && (
        <div className="mx-4 mb-3 rounded-xl bg-surface-2 px-3.5 py-3">
          <FlowColumn steps={steps} kind={draft.kind} />
        </div>
      )}

      {open ? (
        <div className="flex flex-col gap-2.5 px-4 pb-3.5">
          <p className="text-[12.5px] text-muted">
            {[firstRun, "Nothing runs until you save it", draftExpiry(draft)].filter(Boolean).join(" · ")}
            {draft.changeOf && " · Saving replaces the automation it changes."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" className="flex-1" pending={pending} onClick={() => save(draft)}>
              Save
            </Button>
            <ButtonLink href={draftHref(draft)} className="flex-1">
              Open in Automations
            </ButtonLink>
          </div>
        </div>
      ) : (
        <Settled draft={draft} />
      )}
    </section>
  );
}

/**
 * Tex proposed an automation (a message carrying a draft). In web chat: Tex's line ("Here's a draft
 * of …"), then the card. In a chat app's conversation (Telegram) the message is the outline sent
 * there, with its link and Save button; here the card says the same, so it shows alone.
 */
export function DraftQuestion({ message, draftId }: { message: Pick<Message, "text" | "channel">; draftId: string }) {
  return (
    <>
      {message.channel === "web" && message.text && <AgentBubble text={message.text} />}
      <DraftCard draftId={draftId} />
    </>
  );
}
