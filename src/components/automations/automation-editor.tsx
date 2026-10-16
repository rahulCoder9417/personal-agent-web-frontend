"use client";

// Building or changing an automation by hand (HLD 5.4, "Building and changing one by hand"). On a
// wide screen the five boxes are drawn on the canvas, and a click on one opens its settings beside
// it (under it, below 1560px); on a phone the five are a form, one under another, and the canvas
// library is never fetched. While the person types, the server checks the parts without saving
// (`POST /v1/automations/check`): each problem turns its box red, a full plan shows a banner, and
// the next runs are listed. Save makes a new one with a one-time key (a double click makes one);
// Save changes keeps the automation's id. "Ask Tex to change this" keeps the parts as the person's
// own draft and opens the chat with it named.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ApiError, type Automation, type AutomationDraft, type AutomationParts } from "@/lib/api/client";
import { useApps, useAutomationCheck, useChangeAutomation, useChannels, useCreateAutomation, useCreateAutomationDraft } from "@/lib/api/hooks";
import { isDirty, kindOf, partsKey, previewSource, problemsByStep, problemsOfError, toParts, type EditorParts } from "@/lib/automation-editor";
import { automationFlow, automationHref, changedSteps, FLOW_STEP_IDS, type FlowStep, type FlowStepId } from "@/lib/automation-flow";
import { chatDraftHref } from "@/lib/chat-link";
import { cn, formatDateTime } from "@/lib/format";
import { useMediaQuery, SHOWN_AT } from "@/lib/media-query";
import { PRICING_PATH } from "@/lib/pricing";
import { toast, toastError } from "../toast";
import { Button } from "../ui";
import { StepForm, type EditorContext } from "./editor-forms";
import { ChangedTag, StepMark } from "./flow-parts";
import { useDraftSave } from "./use-draft-save";

const FlowCanvas = dynamic(() => import("./flow-canvas"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-[260px] w-full animate-pulse rounded-xl border border-line bg-surface-2" />,
});

/** How long the parts must stay the same before they are sent to be checked. */
export const CHECK_AFTER_MS = 400;

/** What is being edited: a new automation (perhaps from a draft), or a saved one (perhaps with Tex's draft of a change). */
export type EditorTarget = { kind: "new"; draft?: AutomationDraft | null } | { kind: "change"; automation: Automation; draft?: AutomationDraft | null };

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** The steps as the canvas draws the form, with a plain ask where a box is still empty. */
export function editorSteps(editor: EditorParts, target: EditorTarget, accountZone: string | null | undefined): FlowStep[] {
  const base = target.kind === "change" ? { enabled: target.automation.enabled, pausedReason: target.automation.pausedReason, lastRunAt: target.automation.lastRunAt } : {};
  const steps = automationFlow(previewSource(editor, base), accountZone);
  return steps.map((step) => {
    if (step.id === "trigger" && !editor.mode) return { ...step, title: "Pick when it runs", short: "When?", lines: ["Once, on a schedule or on an app event"] };
    if (step.id === "trigger" && editor.mode === "event" && !editor.event.app) return { ...step, title: "Pick an app and what happens", lines: [] };
    if (step.id === "instruction" && !editor.title.trim() && !editor.instruction.trim()) return { ...step, title: "Say what Tex does", lines: ["A title and the instruction"] };
    if (step.id === "instruction" && !editor.title.trim()) return { ...step, title: "Give it a title" };
    return step;
  });
}

/** "Mon 19 Oct, 9:00 AM · Mon 26 Oct, 9:00 AM": when it would run, from the server's check. */
function runsLine(editor: EditorParts, nextRuns: readonly string[] | undefined): string | null {
  if (editor.mode === "event") return "Runs each time that happens.";
  if (!editor.mode || !nextRuns?.length) return null;
  const words = nextRuns.map((at) => formatDateTime(at));
  return editor.mode === "once" ? `Runs once: ${words[0]}.` : `Next runs: ${words.join(" · ")}.`;
}

export function AutomationEditor({
  target,
  start,
  accountZone,
  onCancel,
  onSaved,
  revealProblems = false,
}: {
  target: EditorTarget;
  /** The parts it starts from. A new key on the component starts it over (a template). */
  start: EditorParts;
  accountZone: string;
  onCancel?: () => void;
  /** Called after a change is saved (the page goes back to showing it). A new one opens its own page. */
  onSaved?: (automation: Automation) => void;
  /** Show every box's problems from the start (a template), not only once a box was worked on. */
  revealProblems?: boolean;
}) {
  const router = useRouter();
  const panelId = useId();
  const wide = useMediaQuery(SHOWN_AT.sidebar);
  const apps = useApps();
  const channels = useChannels();
  const create = useCreateAutomation();
  const change = useChangeAutomation();
  const askTex = useCreateAutomationDraft();
  const draftSave = useDraftSave();

  const [editor, setEditor] = useState(start);
  const [selected, setSelected] = useState<FlowStepId>("trigger");
  // On a new canvas a box shows its problems once it has been worked on, or once Save was tried.
  const fresh = target.kind === "new" && !target.draft && !revealProblems;
  const [touched, setTouched] = useState<ReadonlySet<FlowStepId>>(() => new Set(fresh ? [] : FLOW_STEP_IDS));
  const [saveProblems, setSaveProblems] = useState<{ key: string; problems: ReturnType<typeof problemsOfError> } | null>(null);

  const key = partsKey(editor);
  const settledKey = useDebounced(key, CHECK_AFTER_MS);
  const parts = useMemo(() => JSON.parse(settledKey) as AutomationParts, [settledKey]);
  const automationId = target.kind === "change" ? target.automation.id : null;
  const check = useAutomationCheck(parts, settledKey, automationId);
  const dirty = isDirty(editor, start);

  const problems = saveProblems?.key === key ? saveProblems.problems : check.data?.problems;
  const read = problemsByStep(problems);
  const shown = useMemo(() => {
    const map = new Map<FlowStepId, readonly string[]>();
    for (const [step, list] of read.byStep) if (touched.has(step)) map.set(step, list);
    return map;
  }, [read.byStep, touched]);
  const checking = key !== settledKey || check.isFetching;
  const knownBad = !checking && check.data?.ok === false && settledKey === key;

  const steps = useMemo(() => editorSteps(editor, target, accountZone), [editor, target, accountZone]);
  const changed = useMemo(() => (target.kind === "change" ? changedSteps(previewSource(editor), target.automation) : undefined), [editor, target]);
  const kind = kindOf(editor) ?? "once";
  const context: EditorContext = { apps: apps.data, channels: channels.data, accountZone };

  const onSelect = useCallback((id: FlowStepId) => setSelected(id), []);
  const changeStep = (step: FlowStepId) => (next: EditorParts) => {
    setEditor(next);
    if (!touched.has(step)) setTouched(new Set([...touched, step]));
  };

  // One key per attempt at these parts: a double click, or a retry, makes one automation.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const requestId = () => {
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    return attempt.current.id;
  };

  function refused(error: unknown, title: string) {
    const found = error instanceof ApiError ? problemsOfError(error.details) : null;
    if (found?.length) {
      setSaveProblems({ key, problems: found });
      setTouched(new Set(FLOW_STEP_IDS));
      const first = found.find((problem) => problem.step);
      if (first?.step) setSelected(first.step);
    }
    if (error instanceof ApiError && error.planLimit) toastError(title, error.message, { label: "See plans", href: PRICING_PATH });
    else if (found?.length) toastError(title, "Fix the boxes in red, then save again.");
    else toastError(title, error);
  }

  const title = editor.title.trim() || "the automation";
  const pending = create.isPending || change.isPending || draftSave.pending;

  function save(enabled?: boolean) {
    setTouched(new Set(FLOW_STEP_IDS));
    const body = toParts(editor);
    // Tex's draft, saved as it is: the draft's own Save.
    if (target.draft && target.draft.status === "open" && !dirty) {
      draftSave.save(target.draft, enabled !== false);
      return;
    }
    const draftId = target.draft?.status === "open" ? target.draft.id : null;
    if (target.kind === "new") {
      create.mutate(
        { ...body, title: body.title ?? "", instruction: body.instruction ?? "", enabled: enabled !== false, draftId, clientRequestId: requestId() },
        {
          onSuccess: (automation) => {
            toast({
              title: automation.enabled ? `Saved “${automation.title}”` : `Saved “${automation.title}”, paused`,
              body: automation.enabled ? "It runs from now on. Each run answers in your Automations chat." : "It won’t run until you turn it on. Try it first with Run once now.",
            });
            router.push(automationHref(automation.id));
          },
          onError: (error) => refused(error, `Couldn’t save “${title}”`),
        },
      );
    } else {
      change.mutate(
        { automationId: target.automation.id, ...body, title: body.title ?? "", instruction: body.instruction ?? "", draftId },
        {
          onSuccess: (automation) => {
            toast({ title: `Saved the changes to “${automation.title}”`, body: automation.enabled ? "The next run follows them." : "It stays paused." });
            onSaved?.(automation);
          },
          onError: (error) => refused(error, `Couldn’t save the changes to “${title}”`),
        },
      );
    }
  }

  function askTexToChange() {
    const body = toParts(editor);
    const changeOf = target.kind === "change" ? target.automation.id : (target.draft?.changeOf ?? null);
    const replacesDraftId = target.draft?.status === "open" ? target.draft.id : null;
    askTex.mutate(
      { ...body, title: body.title || "New automation", instruction: body.instruction || "", changeOf, replacesDraftId },
      {
        onSuccess: (draft) => router.push(chatDraftHref(`Change this draft (${draft.id}): `)),
        onError: (error) => toastError("Couldn’t hand it to Tex", error),
      },
    );
  }

  const open = steps.find((step) => step.id === selected) ?? steps[0];
  const runs = runsLine(editor, check.data?.nextRuns);

  return (
    <section aria-label="Edit the automation" className="flex min-w-0 flex-col gap-4">
      {read.planLimit && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] text-fg">
          <span className="min-w-0 flex-1">{read.general.find((problem) => problem.code === "plan_limit")?.message}</span>
          <Link href={PRICING_PATH} className="font-medium text-accent hover:text-accent-dark">
            See plans
          </Link>
        </p>
      )}

      {wide ? (
        <div className="flex min-w-0 gap-4 max-[1560px]:flex-col">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[12.5px] text-muted">Pick a box to change it. A box in red has something to fix.</p>
            <FlowCanvas steps={steps} kind={kind} selected={selected} changed={changed} problems={shown} editing panelId={panelId} onSelect={onSelect} />
          </div>
          <aside
            id={panelId}
            aria-label={`${open.label}: its settings`}
            className={cn(
              "flex w-[380px] shrink-0 flex-col gap-3 rounded-xl border bg-surface p-4 max-[1560px]:w-full",
              shown.has(open.id) ? "border-danger/50" : "border-line",
            )}
          >
            <div className="flex items-start gap-3">
              <StepMark step={open} kind={kind} size={34} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  {open.label}
                  {changed?.has(open.id) && <ChangedTag />}
                </span>
                <h3 className="text-[15px] leading-snug font-semibold break-words">{open.title}</h3>
              </div>
            </div>
            <StepForm step={open.id} editor={editor} onChange={changeStep(open.id)} problems={shown.get(open.id) ?? []} context={context} />
          </aside>
        </div>
      ) : (
        <ol aria-label="The five parts, in order" className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <li key={step.id}>
              <section
                aria-label={step.label}
                className={cn("flex flex-col gap-3 rounded-xl border bg-surface p-4", shown.has(step.id) ? "border-danger/50" : "border-line")}
              >
                <div className="flex items-start gap-3">
                  <StepMark step={step} kind={kind} size={30} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      <span className="tabular-nums">{index + 1}.</span> {step.label}
                      {changed?.has(step.id) && <ChangedTag />}
                    </span>
                    <h3 className="text-[14.5px] leading-snug font-semibold break-words">{step.title}</h3>
                  </div>
                </div>
                <StepForm step={step.id} editor={editor} onChange={changeStep(step.id)} problems={shown.get(step.id) ?? []} context={context} />
              </section>
            </li>
          ))}
        </ol>
      )}

      <div className="z-10 -mx-1 flex md:sticky md:bottom-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-raised)] backdrop-blur">
        <p aria-live="polite" className="min-w-0 flex-1 basis-[260px] text-[12.5px] text-fg-2">
          {!editor.mode && touched.size === 0
            ? "Pick when it runs to begin, then fill in each box."
            : checking
              ? "Checking…"
              : knownBad
                ? "Some boxes need a fix before it can be saved."
                : (runs ?? "Looks good.")}
          {!checking && knownBad && runs && <span className="block text-muted">{runs}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {target.kind === "new" ? (
            <>
              <Button variant="primary" pending={create.isPending && create.variables?.enabled !== false} disabled={pending || knownBad} onClick={() => save(true)}>
                Save
              </Button>
              <Button pending={create.isPending && create.variables?.enabled === false} disabled={pending || knownBad} onClick={() => save(false)}>
                Save paused
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" pending={change.isPending} disabled={pending || knownBad || (!dirty && !target.draft)} onClick={() => save()}>
                Save changes
              </Button>
              {onCancel && (
                <Button variant="ghost" disabled={pending} onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </>
          )}
          {target.kind === "new" && onCancel && (
            <Button variant="ghost" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="ghost" pending={askTex.isPending} disabled={pending || !editor.mode} onClick={askTexToChange} title="Keeps what is here as a draft and opens the chat, to tell Tex what to change">
            Ask Tex to change this
          </Button>
        </div>
      </div>
    </section>
  );
}
