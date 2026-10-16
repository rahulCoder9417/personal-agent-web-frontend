"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui";
import { ApiError, errorMessage, type Plan, type Subscription } from "@/lib/api/client";
import { useResumeSubscription } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { resumeCopy } from "./pricing-logic";

function resumeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "There’s no cancelled plan to keep. It may have renewed or ended already.";
  return errorMessage(error);
}

/**
 * The cancelled plan's own column: "Keep my plan" undoes the cancel (`POST
 * /v1/billing/subscription/resume`), after a dialog that says it renews again. Subscribing again
 * would start a second paid month beside the one still running, so it isn't offered.
 */
export function KeepPlan({ plan, subscription }: { plan: Plan; subscription: Subscription }) {
  const [asking, setAsking] = useState(false);
  const resume = useResumeSubscription();
  const copy = resumeCopy(plan, subscription);
  const ends = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : null;

  return (
    <>
      <Button variant="primary" onClick={() => setAsking(true)} disabled={asking}>
        Keep my plan
      </Button>
      <p className="text-[12.5px] text-muted">{ends ? `Yours ends ${ends}.` : "Yours ends with this period."} Keep it and it renews as before; nothing is charged today.</p>
      {asking && (
        <ConfirmDialog
          title={copy.title}
          confirmLabel={copy.confirmLabel}
          cancelLabel={copy.cancelLabel}
          tone="primary"
          onClose={() => setAsking(false)}
          onConfirm={async () => {
            try {
              await resume.mutateAsync();
              toast(copy.done);
            } catch (error) {
              toastError(`Couldn’t keep ${plan.name}`, resumeError(error));
            }
          }}
        >
          <p>{copy.body}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
