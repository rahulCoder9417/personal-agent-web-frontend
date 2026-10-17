"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ApiError, type AutomationDraft, type Message } from "@/lib/api/client";
import { useAutomationDraft, useMe } from "@/lib/api/hooks";
import { automationFlow, automationHref, draftExpiry, draftFirstRun, draftHref, draftState } from "@/lib/automation-flow";
import { cn } from "@/lib/format";
import { useDraftSave } from "../automations/use-draft-save";
import { CheckIcon, ClockIcon } from "../icons";
import { Button, ButtonLink } from "../ui";
import { AgentBubble } from "./agent-bubble";
import { DraftSteps } from "./draft-steps";

// A draft Tex proposed, in the chat: the automation it would make, drawn small as its steps
// (plain HTML, not the canvas), "Not saved yet", and the two ways on: Save, or Open in Automations
// to see it on the canvas. Nothing runs until it is saved. The card follows the draft as it changes
// (`automation_draft.updated`): saved, replaced by a newer one, discarded, expired.

const LINK = "font-medium text-accent hover:text-accent-dark";

/** The foot of a card for a draft that is no longer open: what became of it, and where to go. */
function Settled({ draft }: { draft: AutomationDraft }) {
  const state = draftState(draft);
  if (draft.status === "saved" && draft.automationId)
    return (
      <p className="flex items-center gap-1.5 border-t border-line px-4 py-3 text-[13px] leading-5 font-medium text-success">
        <CheckIcon size={14} className="shrink-0" />
        <span>Saved</span>
        <span className="text-muted">·</span>
        <Link href={automationHref(draft.automationId)} className={LINK}>
          Open
        </Link>
      </p>
    );
  return (
    <p className="border-t border-line px-4 py-3 text-[13px] leading-5 text-muted">
      {state.line}
      {draft.status === "replaced" && draft.replacedBy && (
        <>
          {" "}
          <Link href={draftHref({ id: draft.replacedBy, changeOf: draft.changeOf })} className={cn(LINK, "whitespace-nowrap")}>
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
      <div className="w-full max-w-[480px] rounded-2xl bg-surface px-4 py-3.5 text-[13px] leading-5 text-muted shadow-[0_0_0_1px_var(--line)]">
        {gone ? "This draft expired. Ask Tex again." : "The draft didn’t load. Open the chat again to retry."}
      </div>
    );
  }

  const state = draftState(draft);
  const open = state.tone === "waiting";
  const firstRun = draftFirstRun(draft);
  // "First run: Tomorrow, 5:20 AM" reads as a small label and the time; "Runs each time it happens" as is.
  const [runLabel, runWhen] = firstRun?.startsWith("First run: ") ? ["First run", firstRun.slice("First run: ".length)] : [null, firstRun];
  // The small print, in short pieces that wrap between them, never inside one.
  const notes = ["Nothing runs until you save it", draftExpiry(draft), draft.changeOf ? "Saving replaces the automation it changes" : null].filter(
    (note): note is string => Boolean(note),
  );

  return (
    <section
      aria-label={`Draft automation: ${draft.title}`}
      className={cn(
        "@container flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-surface",
        open ? "shadow-[0_0_0_1px_var(--accent),0_10px_30px_-14px_rgb(51_85_245/0.45)]" : "shadow-[0_0_0_1px_var(--line)]",
      )}
    >
      {/* While open, the head says it isn't saved yet; once folded, the foot says what became of it, so the head is just the name. */}
      <header className={cn("flex flex-col gap-1 px-4", open ? "pt-4 pb-3.5" : "py-3.5")}>
        {open && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] leading-4">
            <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              {state.label}
            </span>
            <span className="text-muted">· {draft.changeOf ? "a change to an automation" : "a new automation"}</span>
          </p>
        )}
        <h3 className={cn("text-[16px] leading-snug font-semibold tracking-[-0.01em] break-words", !open && "text-nav")}>{draft.title}</h3>
      </header>

      {/* Once it is no longer open, the card folds to its name and what became of it. */}
      {open ? (
        <div className="flex flex-col px-4 pb-4">
          <div className="rounded-xl bg-surface-2 px-4 py-4">
            <DraftSteps steps={steps} kind={draft.kind} heading={draft.title} />
          </div>

          <div className="mt-3.5 flex flex-col gap-1.5 px-1">
            {runWhen && (
              <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5">
                <ClockIcon size={14} className="shrink-0 text-muted" />
                {runLabel && <span className="text-muted">{runLabel}</span>}
                <span className="font-medium text-fg">{runWhen}</span>
              </p>
            )}
            {/* One under another on a narrow card; side by side, a dot between, where it is wide. */}
            <ul
              aria-label="Before you save"
              className="flex flex-col gap-0.5 text-[12.5px] leading-[18px] text-muted @[360px]:flex-row @[360px]:flex-wrap @[360px]:items-center @[360px]:gap-x-2"
            >
              {notes.map((note, index) => (
                <li key={note} className="inline-flex items-center gap-2">
                  {index > 0 && <span aria-hidden className="hidden size-[3px] rounded-full bg-line-strong @[360px]:block" />}
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 @[360px]:grid-cols-2">
            <Button variant="primary" size="lg" className="w-full" pending={pending} onClick={() => save(draft)}>
              Save
            </Button>
            <ButtonLink href={draftHref(draft)} size="lg" className="w-full">
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
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      {message.channel === "web" && message.text && <AgentBubble text={message.text} />}
      <DraftCard draftId={draftId} />
    </div>
  );
}
