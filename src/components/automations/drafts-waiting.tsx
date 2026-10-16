"use client";

import Link from "next/link";
import type { AutomationDraft } from "@/lib/api/client";
import { useAutomationDrafts, useDiscardAutomationDraft } from "@/lib/api/hooks";
import { draftExpiry, draftHref } from "@/lib/automation-flow";
import { rowApps, shortWhen } from "@/lib/automation-list";
import { useArmed } from "../confirm-button";
import { toast, toastError } from "../toast";
import { Btn, BtnLink, LogoStack, T2, T3 } from "./parts";

/** Discard, asking once more ("Discard draft") before it does. */
function DiscardButton({ draft }: { draft: AutomationDraft }) {
  const discard = useDiscardAutomationDraft();
  const [armed, setArmed] = useArmed(discard.isPending);
  const go = () =>
    discard.mutate(draft.id, {
      onSuccess: () => toast({ title: `Discarded “${draft.title}”`, body: "Nothing was set up." }),
      onError: (error) => toastError(`Couldn’t discard “${draft.title}”`, error),
    });
  if (!armed && !discard.isPending)
    return (
      <Btn size="sm" variant="ghost" aria-label={`Discard the draft ${draft.title}`} onClick={() => setArmed(true)}>
        Discard
      </Btn>
    );
  return (
    <span className="flex items-center gap-1">
      <Btn size="sm" variant="remove" className="bg-danger-soft text-danger" pending={discard.isPending} onClick={go}>
        Discard draft
      </Btn>
      {!discard.isPending && (
        <Btn size="sm" variant="ghost" onClick={() => setArmed(false)}>
          Keep it
        </Btn>
      )}
    </span>
  );
}

/** One open draft, as a row: what it uses, its name, what it is and how long it is kept, and the ways on. */
function DraftRow({ draft, timezone }: { draft: AutomationDraft; timezone: string | null | undefined }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-4 py-4 first:border-t-0 md:px-6">
      <LogoStack marks={rowApps({ ...draft, preset: null })} />
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
        <Link href={draftHref(draft)} className={`${T2} font-semibold break-words text-fg hover:text-accent-dark`}>
          {draft.title}
        </Link>
        <span className={`${T3} text-muted`}>
          {draft.changeOf ? "A change" : "New"} · {shortWhen({ ...draft, preset: null }, timezone)} · {draftExpiry(draft)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <BtnLink href={draftHref(draft)} size="sm" variant="primary" aria-label={`Open the draft ${draft.title} to check and save it`}>
          Open and save
        </BtnLink>
        <DiscardButton draft={draft} />
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
    <section aria-labelledby="drafts-waiting" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="drafts-waiting" className={`${T2} font-semibold`}>
          Waiting for you to save <span className="font-medium text-muted">{list.length}</span>
        </h2>
        <p className={`${T3} text-muted`}>Drafts Tex proposed in the chat. None of them runs until you save it; each is kept for 7 days.</p>
      </div>
      <ul className="rounded-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
        {list.map((draft) => (
          <DraftRow key={draft.id} draft={draft} timezone={timezone} />
        ))}
      </ul>
    </section>
  );
}
