"use client";

import type { AutomationDraft } from "@/lib/api/client";
import { useSaveAutomationDraft } from "@/lib/api/hooks";
import { savedNotice, saveRefusal, type SaveNotice } from "@/lib/draft-save";
import { toast, toastError } from "../toast";

function show(notice: SaveNotice) {
  if (notice.kind === "done") toast({ title: notice.title, body: notice.body, action: notice.action });
  else if (notice.kind === "error") toastError(notice.title, notice.body, notice.action);
}

/**
 * Saves a draft, from its card in the chat or its page, and says how it went in a toast
 * (`src/lib/draft-save.ts`). `paused` is true while "Save paused" is the save in flight.
 */
export function useDraftSave() {
  const mutation = useSaveAutomationDraft();
  function save(draft: AutomationDraft, enabled = true) {
    mutation.mutate(
      { draftId: draft.id, enabled },
      {
        onSuccess: (saved) => show(savedNotice(draft, saved)),
        onError: (error) => show(saveRefusal(draft, error)),
      },
    );
  }
  return {
    save,
    pending: mutation.isPending,
    paused: mutation.isPending && mutation.variables?.enabled === false,
  };
}
