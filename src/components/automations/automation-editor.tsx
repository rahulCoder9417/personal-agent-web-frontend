"use client";

// Building or changing an automation by hand (HLD 5.4, "Building and changing one by hand"). On a
// wide screen the five boxes are drawn on the canvas, and a click on one opens its settings beside
// it (under it, below 1560px); on a phone the five are a form, one under another, and the canvas
// library is never fetched. While the person types, the server checks the parts without saving
// (`POST /v1/automations/check`): each problem turns its box red, a full plan shows a banner, and
// the next runs are listed. Save makes a new one with a one-time key (a double click makes one);
// Save changes keeps the automation's id. "Ask Tex to change this" keeps the parts as the person's
// own draft and opens the chat with it named.
//
// With steps (phase 4), the canvas is the trigger, each step and the results, laid out by dagre: a
// "+" on an arrow adds a step there (up to 6), and a step's panel moves it up or down or removes it.
// A step whose "only if" now looks at another step turns red until the person checks it. On a phone
// the steps are cards, each opening its settings in place.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, type Automation, type AutomationDraft, type AutomationParts } from "@/lib/api/client";
import { useAppActionLists, useApps, useAutomationCheck, useChangeAutomation, useChannels, useCreateAutomation, useCreateAutomationDraft } from "@/lib/api/hooks";
import {
  firstProblemKey,
  isDirty,
  kindOf,
  partsKey,
  previewSource,
  problemsByStep,
  problemsOfError,
  toOneInstruction,
  toParts,
  toStepped,
  type EditorParts,
} from "@/lib/automation-editor";
import { automationFlow, automationHref, changedSteps, stepKey, type FlowStep } from "@/lib/automation-flow";
import {
  acknowledgeCondition,
  canAddStep,
  conditionWarnings,
  emptyStep,
  insertStep,
  MAX_STEPS,
  moveStep,
  newStepId,
  previewSteps,
  removeStep,
  replaceStep,
  stepApps,
  stepsCostLine,
  type EditorStep,
} from "@/lib/automation-steps";
import type { AutomationKind } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { cn, formatDateTime } from "@/lib/format";
import { useMediaQuery, SHOWN_AT } from "@/lib/media-query";
import { PRICING_PATH } from "@/lib/pricing";
import { toast, toastError } from "../toast";
import { ConfirmButton } from "../confirm-button";
import { ChevronRightIcon, LockIcon, WarningIcon } from "../icons";
import { Button } from "../ui";
import { InstructionForm, Problems, StepForm, type EditorContext } from "./editor-forms";
import { StepBadge } from "./flow-chain";
import { ChangedTag } from "./flow-parts";
import { StepForm as OneStepForm } from "./step-form";
import { useDraftSave } from "./use-draft-save";

const CanvasLoading = () => <div aria-hidden className="h-[256px] w-full animate-pulse rounded-2xl border border-line bg-surface-2" />;
const FlowCanvas = dynamic(() => import("./flow-canvas"), { ssr: false, loading: CanvasLoading });
/** The canvas of an automation with steps, with dagre: its own chunk (steps-canvas.tsx). */
const StepsCanvas = dynamic(() => import("./steps-canvas"), { ssr: false, loading: CanvasLoading });

/** Every box counts as worked on (after Save was tried, or when a box's problems show from the start). */
const ALL = "*";

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
export function editorSteps(
  editor: EditorParts,
  target: EditorTarget,
  accountZone: string | null | undefined,
  actionLabel?: (step: EditorStep) => string | null | undefined,
): FlowStep[] {
  const base = target.kind === "change" ? { enabled: target.automation.enabled, pausedReason: target.automation.pausedReason, lastRunAt: target.automation.lastRunAt } : {};
  const steps = automationFlow(previewSource(editor, base, actionLabel), accountZone);
  return steps.map((step) => {
    if (step.id === "trigger" && !editor.mode) return { ...step, title: "Pick when it runs", short: "When?", lines: ["Once, on a schedule or on an app event"] };
    if (step.id === "trigger" && editor.mode === "event" && !editor.event.app) return { ...step, title: "Pick an app and what happens", lines: [] };
    if (step.key === "instruction" && !editor.title.trim() && !editor.instruction.trim()) return { ...step, title: "Say what Tex does", lines: ["A title and the instruction"] };
    if (step.key === "instruction" && !editor.title.trim()) return { ...step, title: "Give it a title" };
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
  const [selected, setSelected] = useState<string>("trigger");
  // On a new canvas a box shows its problems once it has been worked on, or once Save was tried.
  const fresh = target.kind === "new" && !target.draft && !revealProblems;
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set(fresh ? [] : [ALL]));
  const [saveProblems, setSaveProblems] = useState<{ key: string; problems: ReturnType<typeof problemsOfError> } | null>(null);
  const isTouched = useCallback((key: string) => touched.has(ALL) || touched.has(key), [touched]);
  const touch = (key: string) => {
    if (!isTouched(key)) setTouched(new Set([...touched, key]));
  };
  const touchAll = () => setTouched(new Set([ALL]));

  const key = partsKey(editor);
  const settledKey = useDebounced(key, CHECK_AFTER_MS);
  const parts = useMemo(() => JSON.parse(settledKey) as AutomationParts, [settledKey]);
  const automationId = target.kind === "change" ? target.automation.id : null;
  const check = useAutomationCheck(parts, settledKey, automationId);
  const dirty = isDirty(editor, start);
  const stepped = editor.steps.length > 0;

  // The apps' action lists, to name each action as its app does and to say what a run can cost.
  const actionApps = useMemo(() => stepApps(editor.steps.filter((step) => step.type === "action")), [editor.steps]);
  const lists = useAppActionLists(actionApps);
  const lookup = useCallback((app: string, action: string) => lists.byApp.get(app)?.find((item) => item.slug === action), [lists.byApp]);
  const actionLabel = useCallback((step: EditorStep) => (step.type === "action" && step.app && step.action ? lookup(step.app, step.action)?.name : undefined), [lookup]);

  const problems = saveProblems?.key === key ? saveProblems.problems : check.data?.problems;
  const read = problemsByStep(problems);
  const warnings = useMemo(() => conditionWarnings(editor.steps), [editor.steps]);
  const shown = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const [step, list] of read.byStep) if (isTouched(step)) map.set(step, list);
    for (const step of editor.steps) {
      const k = stepKey(step.id);
      const list = [...(warnings.has(step.id) ? [warnings.get(step.id)!] : []), ...(isTouched(k) ? (read.byStepId.get(step.id) ?? []) : [])];
      if (list.length) map.set(k, list);
    }
    return map;
  }, [read.byStep, read.byStepId, editor.steps, warnings, isTouched]);
  const checking = key !== settledKey || check.isFetching;
  const knownBad = !checking && check.data?.ok === false && settledKey === key;

  const steps = useMemo(() => editorSteps(editor, target, accountZone, actionLabel), [editor, target, accountZone, actionLabel]);
  const changed = useMemo(() => (target.kind === "change" ? changedSteps(previewSource(editor), target.automation) : undefined), [editor, target]);
  const kind = kindOf(editor) ?? "once";
  const context: EditorContext = { apps: apps.data, channels: channels.data, accountZone };
  const costLine = stepped ? stepsCostLine(previewSteps(editor.steps), lookup) : null;

  const onSelect = useCallback((next: string) => setSelected(next), []);
  const changeBox = (box: string) => (next: EditorParts) => {
    setEditor(next);
    touch(box);
  };

  // ---------------------------------------------------------------- the steps' own editing

  const setSteps = (next: EditorStep[]) => setEditor({ ...editor, steps: next });
  const addStep = useCallback(
    (at: number) => {
      setEditor((current) => {
        if (!canAddStep(current.steps)) return current;
        const step = emptyStep("tex", newStepId(current.steps.map((item) => item.id)));
        setSelected(stepKey(step.id));
        return { ...current, steps: insertStep(current.steps, at, step) };
      });
    },
    [],
  );
  const stepOps = (step: EditorStep, index: number) => ({
    onChange: (next: EditorStep) => {
      setSteps(replaceStep(editor.steps, next));
      touch(stepKey(step.id));
    },
    onMove: (by: -1 | 1) => setSteps(moveStep(editor.steps, step.id, by)),
    onRemove: () => {
      const rest = removeStep(editor.steps, step.id);
      setSteps(rest);
      setSelected(rest.length === 0 ? "trigger" : stepKey(rest[Math.min(index, rest.length - 1)].id));
      if (rest.length === 0) toast({ title: "No steps left", body: "It runs as one instruction again: write what Tex does in its box." });
    },
    onAcknowledge: () => setSteps(acknowledgeCondition(editor.steps, step.id)),
  });
  const intoSteps = () => {
    const next = toStepped(editor);
    setEditor(next);
    setSelected(stepKey(next.steps[0].id));
  };
  const backToOne = () => {
    setEditor(toOneInstruction(editor));
    setSelected("instruction");
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
      touchAll();
      const first = firstProblemKey(found);
      if (first) setSelected(first);
    }
    if (error instanceof ApiError && error.planLimit) toastError(title, error.message, { label: "See plans", href: PRICING_PATH });
    else if (found?.length) toastError(title, "Fix the boxes in red, then save again.");
    else toastError(title, error);
  }

  const title = editor.title.trim() || "the automation";
  const pending = create.isPending || change.isPending || draftSave.pending;
  const blocked = warnings.size > 0;

  function save(enabled?: boolean) {
    touchAll();
    if (blocked) {
      const first = editor.steps.find((step) => warnings.has(step.id));
      if (first) setSelected(stepKey(first.id));
      toastError(`Couldn’t save “${title}” yet`, "A step’s “only if” now looks at another step. Check the steps in red, then save again.");
      return;
    }
    const body = toParts(editor);
    // Tex's draft, saved as it is: the draft's own Save.
    if (target.draft && target.draft.status === "open" && !dirty) {
      draftSave.save(target.draft, { paused: enabled === false });
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

  const open = steps.find((step) => step.key === selected) ?? steps[0];
  const runs = runsLine(editor, check.data?.nextRuns);
  const openStep = open.step ? editor.steps.findIndex((step) => step.id === open.step!.id) : -1;
  const openAt = steps.indexOf(open);
  const prev = steps[openAt - 1];
  const next = steps[openAt + 1];

  /** The settings of a box: a step's own panel, or one of the other boxes' forms. */
  const boxForm = (box: FlowStep) => {
    const index = box.step ? editor.steps.findIndex((step) => step.id === box.step!.id) : -1;
    if (index >= 0) {
      const step = editor.steps[index];
      const ops = stepOps(step, index);
      return (
        <OneStepForm
          step={step}
          index={index}
          count={editor.steps.length}
          onChange={ops.onChange}
          onMove={ops.onMove}
          onRemove={ops.onRemove}
          problems={isTouched(box.key) ? (read.byStepId.get(step.id) ?? []) : []}
          warning={warnings.get(step.id) ?? null}
          previousId={index > 0 ? editor.steps[index - 1].id : null}
          apps={apps.data}
        />
      );
    }
    return <StepForm step={box.id} editor={editor} onChange={changeBox(box.id)} problems={shown.get(box.key) ?? []} context={context} />;
  };

  /** One instruction or steps: the way from one to the other. */
  const shapeSwitch = stepped ? (
    <ConfirmButton label="Back to one instruction" confirmLabel="Remove the steps" ariaLabel="Back to one instruction: the steps are removed" onConfirm={backToOne} />
  ) : (
    <Button size="sm" onClick={intoSteps} title={`Split the work into up to ${MAX_STEPS} steps, done one at a time`}>
      Split into steps
    </Button>
  );

  /** With steps: the title and purpose, above the steps (they have no box of their own). */
  const purpose = stepped && (
    <section aria-label="Title and purpose" className={cn("flex flex-col gap-3 rounded-2xl border bg-surface p-4 sm:p-5", shown.has("instruction") ? "border-danger/50" : "border-line")}>
      <InstructionForm editor={editor} onChange={changeBox("instruction")} problems={shown.get("instruction") ?? []} context={context} />
    </section>
  );

  return (
    <section aria-label="Edit the automation" className="flex min-w-0 flex-col gap-4">
      {read.planLimit && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] text-fg">
          <WarningIcon size={15} className="shrink-0 text-danger" />
          <span className="min-w-0 flex-1">{read.general.find((problem) => problem.code === "plan_limit")?.message}</span>
          <Link href={PRICING_PATH} className="font-medium text-accent hover:text-accent-dark">
            See plans
          </Link>
        </p>
      )}
      {read.stepsList.length > 0 && <Problems problems={read.stepsList} className="rounded-xl bg-danger-soft px-4 py-3" />}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-2.5">
        <p className="min-w-0 flex-1 basis-[260px] text-[12.5px] text-fg-2">
          {stepped
            ? `${editor.steps.length} of ${MAX_STEPS} steps, done one at a time, in order. ${costLine ?? ""}`
            : "One instruction for Tex. For a job in parts (find, decide, then act), split it into steps."}
        </p>
        {shapeSwitch}
      </div>

      {wide ? (
        <>
          {purpose}
          <div className="flex min-w-0 gap-4 max-[1560px]:flex-col">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-[12.5px] text-muted">
                {stepped ? "Pick a box to change it; “+” on an arrow adds a step there. A box in red has something to fix." : "Pick a box to change it. A box in red has something to fix."}
              </p>
              {stepped ? (
                <StepsCanvas
                  steps={steps}
                  kind={kind}
                  selected={selected}
                  changed={changed}
                  problems={shown}
                  editing
                  count={editor.steps.length}
                  onInsert={addStep}
                  panelId={panelId}
                  onSelect={onSelect}
                />
              ) : (
                <FlowCanvas steps={steps} kind={kind} selected={selected} changed={changed} problems={shown} editing panelId={panelId} onSelect={onSelect} />
              )}
            </div>
            <aside
              id={panelId}
              aria-label={`${open.label}: its settings`}
              className={cn(
                "flex w-[400px] shrink-0 flex-col rounded-2xl border bg-surface max-[1560px]:w-full",
                shown.has(open.key) ? "border-danger/50" : "border-line",
              )}
            >
              <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
                <StepBadge step={open} kind={kind} size={36} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
                    {/* A step is named "Step 2 · Gmail" already; the other boxes get their place. */}
                    {!stepped && (
                      <>
                        <span className="tabular-nums">
                          Step {openAt + 1} of {steps.length}
                        </span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    {open.label}
                    {open.step?.askFirst && <LockIcon size={12} />}
                    {changed?.has(open.key) && <ChangedTag />}
                  </span>
                  <h3 className="text-[15px] leading-snug font-semibold break-words">{open.title}</h3>
                  {open.step?.condition && <span className="text-[12.5px] text-fg-2">{open.step.condition}</span>}
                </div>
              </div>
              <div className="w-full max-w-[680px] px-4 py-4 sm:px-5">{openStep >= 0 || !open.step ? boxForm(open) : null}</div>
              <div className="mt-auto flex items-center gap-2 border-t border-line px-3 py-2">
                {prev && (
                  <Button variant="ghost" size="sm" onClick={() => setSelected(prev.key)}>
                    <ChevronRightIcon size={14} className="rotate-180" />
                    {prev.label}
                  </Button>
                )}
                {next && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(next.key)}>
                    Next: {next.label}
                    <ChevronRightIcon size={14} />
                  </Button>
                )}
              </div>
            </aside>
          </div>
        </>
      ) : (
        <ol aria-label={stepped ? "The trigger, the steps and the results, in order" : "The five parts, in order"} className="flex flex-col">
          {stepped && <li className="pb-3">{purpose}</li>}
          {steps.map((step, index) => (
            <li key={step.key} className={cn("relative flex flex-col gap-2", index < steps.length - 1 && "pb-3")}>
              {/* The line between two boxes, down their badges. */}
              {index < steps.length - 1 && <span aria-hidden className="absolute bottom-0 left-[31px] h-3 w-px -translate-x-1/2 bg-line-strong" />}
              {stepped && step.id === "results" && (
                <Button className="w-full" disabled={!canAddStep(editor.steps)} onClick={() => addStep(editor.steps.length)}>
                  {canAddStep(editor.steps) ? "+ Add a step" : `Up to ${MAX_STEPS} steps`}
                </Button>
              )}
              <PhoneCard step={step} index={index} kind={kind} changed={changed?.has(step.key) ?? false} problems={shown.get(step.key) ?? []} collapsible={Boolean(step.step)} startOpen={selected === step.key}>
                {boxForm(step)}
              </PhoneCard>
            </li>
          ))}
        </ol>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-pop)] backdrop-blur">
        <p aria-live="polite" className="flex min-w-0 flex-1 basis-[260px] items-start gap-2 text-[12.5px] text-fg-2">
          <span
            aria-hidden
            className={cn("mt-[5px] size-2 shrink-0 rounded-full", checking ? "animate-pulse bg-line-strong" : knownBad || blocked ? "bg-danger" : editor.mode ? "bg-online" : "bg-line-strong")}
          />
          <span className="min-w-0">
          {!editor.mode && touched.size === 0
            ? "Pick when it runs to begin, then fill in each box."
            : checking
              ? "Checking…"
              : knownBad || blocked
                ? "Some boxes need a fix before it can be saved."
                : (runs ?? "Looks good.")}
          {!checking && knownBad && runs && <span className="block text-muted">{runs}</span>}
          </span>
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

/**
 * One box on a phone: its mark, name and title, then its settings. A step's card opens and closes
 * (its settings are long); the trigger and the results stay open.
 */
function PhoneCard({
  step,
  index,
  kind,
  changed,
  problems,
  collapsible,
  startOpen,
  children,
}: {
  step: FlowStep;
  index: number;
  kind: AutomationKind;
  changed: boolean;
  problems: readonly string[];
  collapsible: boolean;
  startOpen: boolean;
  children: ReactNode;
}) {
  const [shut, setShut] = useState(!startOpen);
  const closed = collapsible && shut;
  const bodyId = useId();
  return (
    <section aria-label={step.label} className={cn("flex flex-col gap-4 rounded-2xl border bg-surface p-4", problems.length ? "border-danger/50" : "border-line")}>
      <div className="flex items-start gap-3">
        <StepBadge step={step} kind={kind} size={30} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            {!step.step && (
              <>
                <span className="tabular-nums">{index + 1}</span>
                <span aria-hidden>·</span>
              </>
            )}
            {step.label}
            {step.step?.askFirst && <LockIcon size={12} />}
            {changed && <ChangedTag />}
          </span>
          <h3 className="text-[14.5px] leading-snug font-semibold break-words">{step.title}</h3>
          {step.step?.condition && <span className="text-[12px] text-fg-2">{step.step.condition}</span>}
          {closed && problems[0] && <span className="text-[12px] font-medium text-danger">{problems[0]}</span>}
        </div>
        {collapsible && (
          <Button size="sm" aria-expanded={!closed} aria-controls={bodyId} onClick={() => setShut(!shut)}>
            {closed ? "Edit" : "Done"}
          </Button>
        )}
      </div>
      {!closed && <div id={bodyId}>{children}</div>}
    </section>
  );
}
