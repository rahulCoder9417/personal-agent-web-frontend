"use client";

// An automation's own page (`/automations/aut_…`): its canvas, ready to change. Pull-request review
// has its own canvas with fixed boxes; a reminder that has run is shown as it ran, not changed.

import { useMemo, type ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { useAutomation, useAutomationRuns, useMe } from "@/lib/api/hooks";
import { editorFrom } from "@/lib/automation-editor";
import { hasSteps } from "@/lib/automation-flow";
import { runSummary, runTrail } from "@/lib/automation-steps";
import { cn } from "@/lib/format";
import { EmptyState, ErrorState } from "../ui";
import { AppsNotice, isFinished, PausedNotice, useAutomationApps } from "./automation-status";
import { Builder } from "./builder";
import { BtnLink, Crumbs, T2 } from "./parts";
import { ReviewBuilder } from "./review-builder";

export { isFinished } from "./automation-status";

/** The page around a canvas that hasn't loaded: the way back, and what is wrong or a placeholder. */
export function CanvasFrame({ current, children }: { current: string; children: ReactNode }) {
  return (
    <div className="type-scale flex min-h-0 flex-1 flex-col bg-bg">
      <header className="flex shrink-0 items-center border-b border-line bg-surface px-4 py-3 md:min-h-16 md:px-6">
        <Crumbs className={T2} parts={[{ href: "/automations", label: "Automations" }]} current={current} />
      </header>
      <div className="scroll-pane min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-8">{children}</div>
    </div>
  );
}

/** While the automation loads: the canvas's place. */
function Loading() {
  return (
    <div aria-hidden className="mx-auto flex max-w-[340px] flex-col gap-12">
      {[0, 1, 2].map((row) => (
        <span key={row} className={cn("h-[100px] animate-pulse rounded-[14px] bg-surface-2")} />
      ))}
    </div>
  );
}

/** An address that leads to no automation of this account: deleted, mistyped, or someone else's. */
export function AutomationNotFound() {
  return (
    <EmptyState
      mood="paused"
      title="This automation isn’t here"
      action={
        <BtnLink href="/automations" variant="primary">
          All automations
        </BtnLink>
      }
    >
      It may have been deleted, or the link belongs to another account.
    </EmptyState>
  );
}

/** A saved automation on its canvas, with its last run's trail and what needs the person above it. */
function Saved({ automation }: { automation: Automation }) {
  const me = useMe();
  const zone = me.data?.timezone ?? "UTC";
  const stepped = hasSteps(automation);
  // An automation with steps: its last run's trail on the boxes (kept fresh by the live stream).
  const runs = useAutomationRuns(automation.id, { enabled: stepped });
  const lastRun = stepped ? runs.data?.[0] : undefined;
  const trail = useMemo(() => runTrail(lastRun), [lastRun]);
  const { broken } = useAutomationApps(automation);
  const start = useMemo(() => editorFrom(automation, zone), [automation, zone]);
  const finished = isFinished(automation);
  const banner = !automation.enabled || broken.length > 0 ? (
    <>
      <PausedNotice automation={automation} />
      <AppsNotice broken={broken} />
    </>
  ) : null;
  return (
    <Builder
      key={automation.id}
      target={{ kind: "change", automation }}
      start={start}
      accountZone={zone}
      readOnly={finished ? "This reminder has run its one time, so it is finished. It shows how Tex ran it." : null}
      banner={banner}
      trail={trail}
      runLine={lastRun ? runSummary(lastRun) : null}
    />
  );
}

/** An automation's own page, by its id: loading, not found, failed, or the automation on its canvas. */
export function AutomationScreen({ automationId }: { automationId: string }) {
  const automation = useAutomation(automationId);
  const missing = automation.error instanceof ApiError && automation.error.status === 404;
  if (automation.data) return automation.data.preset === "pr_review" ? <ReviewBuilder automation={automation.data} /> : <Saved automation={automation.data} />;
  return (
    <CanvasFrame current={missing ? "Not here" : "Loading…"}>
      {missing ? <AutomationNotFound /> : automation.isError ? <ErrorState error={automation.error} onRetry={() => void automation.refetch()} /> : <Loading />}
    </CanvasFrame>
  );
}
