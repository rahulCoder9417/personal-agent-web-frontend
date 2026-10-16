"use client";

import Link from "next/link";
import type { AutomationDraft } from "@/lib/api/client";
import { useAutomationDrafts, useDiscardAutomationDraft } from "@/lib/api/hooks";
import { automationFlow, draftExpiry, draftHref } from "@/lib/automation-flow";
import { AUTOMATION_KIND_LABEL } from "@/lib/format";
import { ConfirmButton } from "../confirm-button";
import { toast, toastError } from "../toast";
import { ButtonLink, Meta, SectionLabel } from "../ui";
import { FlowStrip } from "./flow-parts";

/** One open draft: its name and kind, its five steps, how long it is kept, and the ways on. */
function DraftRow({ draft, timezone }: { draft: AutomationDraft; timezone: string | null | undefined }) {
  const discard = useDiscardAutomationDraft();
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-dashed border-accent/40 bg-surface p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-[14.5px] leading-snug font-semibold break-words">
            <Link href={draftHref(draft)} className="hover:text-accent-dark hover:underline">
              {draft.title}
            </Link>
          </h3>
          <span className="text-[12px] text-muted">
            {draft.changeOf ? "A change" : "New"} · {AUTOMATION_KIND_LABEL[draft.kind]} · {draftExpiry(draft)}
          </span>
        </div>
      </div>
      <FlowStrip steps={automationFlow(draft, timezone)} kind={draft.kind} />
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={draftHref(draft)} size="sm" variant="primary" aria-label={`Open the draft ${draft.title} to check and save it`}>
          Open and save
        </ButtonLink>
        <ConfirmButton
          className="ml-auto"
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
    </li>
  );
}

/**
 * The drafts Tex proposed that wait to be saved, above the automations. Shown only when there are
 * some. Each is kept 7 days; a person has at most 20 open at once.
 */
export function DraftsWaiting({ timezone }: { timezone: string | null | undefined }) {
  const drafts = useAutomationDrafts();
  const list = drafts.data ?? [];
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="drafts-waiting" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <SectionLabel className="text-[15px]">
            <span id="drafts-waiting">Waiting for you to save</span>
          </SectionLabel>
          <Meta className="text-[12px]">{list.length}</Meta>
        </div>
        <p className="text-[13px] text-muted">Drafts Tex proposed in the chat. None of them runs until you save it; each is kept for 7 days.</p>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-3">
        {list.map((draft) => (
          <DraftRow key={draft.id} draft={draft} timezone={timezone} />
        ))}
      </ul>
    </section>
  );
}
