"use client";

// The canvas page of an automation: a new one, a saved one, or a draft Tex proposed. Across the top,
// the way back ("Automations › <name>"), how it stands, its steps out of 6, Test run and Save. Below,
// three parts side by side (stacked on a narrow screen): the blocks to add, the canvas (React Flow:
// the trigger, the reads, Tex and the crew, the writes, the results), and the settings of the box
// that is open.
//
// Every automation has the one shape, read → Tex → write, with reading and writing optional
// (`automation-lanes.ts`); its steps stay the flat list the API keeps, in order. While the person
// works, the server checks the parts without saving (`POST /v1/automations/check`): a box with a
// problem is marked in amber, a full plan shows a notice, and the trigger's settings list the next
// runs. Save makes a new one with a one-time key (a double click makes one) or saves the changes
// (same id). "Ask Tex to change this" keeps the parts as the person's own draft and opens the chat.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, type App, type Automation, type AutomationDraft, type AutomationParts } from "@/lib/api/client";
import {
  useAppActionLists,
  useAppEventLists,
  useApps,
  useAutomationCheck,
  useChangeAutomation,
  useChannels,
  useCreateAutomation,
  useCreateAutomationDraft,
  useDeleteAutomation,
  useUpdateAutomation,
} from "@/lib/api/hooks";
import { appHealth } from "@/lib/automation-apps";
import { conditionPill, stepLine, triggerText } from "@/lib/automation-boxes";
import {
  appChoices,
  editorFrom,
  firstProblemKey,
  isDirty,
  partsKey,
  previewSource,
  problemsByStep,
  problemsOfError,
  toOneInstruction,
  toParts,
  toStepped,
  type EditorParts,
} from "@/lib/automation-editor";
import { automationFlow, automationHref, type FlowStep } from "@/lib/automation-flow";
import {
  addStepAt,
  canMoveStep,
  canRemoveStep,
  endOfLane,
  LANE_TITLE,
  laneDiagram,
  moveWithinLane,
  removeStepFrom,
  shownStepCount,
  skipLane,
  sortIntoLanes,
  stepKeyOf,
  stepLanes,
  type ChangesLookup,
  type Insert,
  type Lane,
} from "@/lib/automation-lanes";
import { blockStep, isTriggerBlock, paletteBlocks, paletteGroups, withTriggerBlock, type BlockGroup, type PaletteBlock } from "@/lib/automation-palette";
import {
  conditionWarnings,
  hasCondition,
  MAX_STEPS,
  newStepId,
  previewSteps,
  replaceStep,
  stepApps,
  stepsCostLine,
  type EditorStep,
  type TrailMark,
  type TrailTone,
} from "@/lib/automation-steps";
import { describeAutomationTimes } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { AUTOMATIONS_CHAT_HREF } from "@/lib/conversations";
import { cn, formatDateTime, listNames, titleCase } from "@/lib/format";
import { connectedReturnPath } from "@/lib/integrations";
import { SHOWN_AT, useMediaQuery } from "@/lib/media-query";
import { PRICING_PATH } from "@/lib/pricing";
import { isConnectable } from "../apps/apps-logic";
import { useConnectDialog } from "../apps/connect-dialog";
import { ChatIcon, ChevronRightIcon, PencilIcon, TrashIcon } from "../icons";
import { toast, toastError } from "../toast";
import { Switch } from "../ui";
import { automationState, isFinished } from "./automation-status";
import { AppsForm, AsksForm, InstructionForm, Problems, ResultsForm, TriggerForm, type EditorContext } from "./editor-forms";
import { Details, HealthChip, InspectorFooter, InspectorHeader, PanelSection } from "./inspector";
import type { CanvasBox, CanvasCondition, CanvasEmpty, CanvasHead } from "./lane-canvas";
import { Palette } from "./palette";
import { Btn, Chip, Crumbs, Dot, MoreMenu, Notice, T2, T3, type ChipTone } from "./parts";
import { RunOnceButton } from "./run-once";
import { StepForm } from "./step-form";
import { useDraftSave } from "./use-draft-save";

function CanvasLoading() {
  return <div aria-hidden className="h-full min-h-[320px] w-full animate-pulse bg-bg" />;
}

/** The canvas, with React Flow: its own chunk. */
const LaneCanvas = dynamic(() => import("./lane-canvas"), { ssr: false, loading: CanvasLoading });

/** Every box counts as worked on (after Save was tried, or when a box's problems show from the start). */
const ALL = "*";

/** How long the parts must stay the same before they are sent to be checked. */
export const CHECK_AFTER_MS = 400;

/** What is being made or changed: a new automation (perhaps from a draft), or a saved one (perhaps with Tex's draft of a change). */
export type EditorTarget = { kind: "new"; draft?: AutomationDraft | null } | { kind: "change"; automation: Automation; draft?: AutomationDraft | null };

export type BuilderProps = {
  target: EditorTarget;
  /** The parts it starts from. A new key on the component starts it over. */
  start: EditorParts;
  accountZone: string;
  /** Show every box's problems from the start (a template), not only once a box was worked on. */
  revealProblems?: boolean;
  /** It can't be changed here (a reminder that has run, a draft no longer open): why, in a line. */
  readOnly?: string | null;
  /** Under the top bar: a draft's state, a pause the system made, an app to reconnect. */
  banner?: ReactNode;
  /** The last run of one with steps: each step's mark, by step id, and the run in a line. */
  trail?: ReadonlyMap<string, TrailMark>;
  runLine?: { line: string; tone: TrailTone } | null;
  /** A change Tex proposed: the boxes it alters, by key. */
  changed?: ReadonlySet<string>;
  /** A draft's own Discard. */
  onDiscard?: () => void;
};

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const TRAIL_TONE: Record<TrailTone, ChipTone> = { done: "ok", waiting: "warn", danger: "danger", muted: "neutral", running: "blue" };
const RUN_DOT: Record<TrailTone, "ok" | "warn" | "danger" | "muted" | "running"> = { done: "ok", waiting: "warn", danger: "danger", muted: "muted", running: "running" };

const HEAD_TEXT: Record<Lane | "start" | "steps", string> = {
  start: "START WHEN",
  read: "READ · OPTIONAL",
  tex: "TEX AND THE CREW",
  write: "WRITE OR SEND · OPTIONAL",
  steps: "STEPS, IN THE ORDER THEY RUN",
};

const EMPTY_TEXT: Record<Lane, Omit<CanvasEmpty, "key" | "lane">> = {
  read: { title: "Reading skipped", line: "Tex starts with only what the trigger gives it.", action: "Add a read step" },
  tex: { title: "No Tex step", line: "Each app step is filled in from the steps before it.", action: "Add a Tex step" },
  write: { title: "Writing skipped", line: "Tex only tells you, in the Automations chat.", action: "Add a write step" },
};

/** The box a refused save's first problem is on. */
function problemBox(key: string | null, stepped: boolean): string | null {
  if (!key) return null;
  if (key === "apps" || key === "asks") return "instruction";
  if (key === "instruction") return stepped ? "about" : "instruction";
  return key;
}

/** Tex's box: its first step, or one instruction's box. */
function texBox(parts: EditorParts): string {
  const tex = parts.steps.find((step) => step.type === "tex");
  return parts.steps.length === 0 ? "instruction" : tex ? stepKeyOf(tex) : "trigger";
}

/** The box opened first: the trigger of a new one, else Tex's box. */
function firstBox(parts: EditorParts, target: EditorTarget): string {
  return target.kind === "new" && !target.draft ? "trigger" : texBox(parts);
}

export function Builder({ target, start, accountZone, revealProblems = false, readOnly = null, banner, trail, runLine, changed, onDiscard }: BuilderProps) {
  const router = useRouter();
  const compact = !useMediaQuery(SHOWN_AT.sidebar);
  const apps = useApps();
  const channels = useChannels();
  const create = useCreateAutomation();
  const change = useChangeAutomation();
  const update = useUpdateAutomation();
  const remove = useDeleteAutomation();
  const askTex = useCreateAutomationDraft();
  const draftSave = useDraftSave();
  const connect = useConnectDialog({ returnPath: (app) => connectedReturnPath(app.slug) });
  const editing = !readOnly;
  const saved = target.kind === "change" ? target.automation : null;

  const [editor, setEditor] = useState(start);
  const [selected, setSelected] = useState<string>(() => firstBox(start, target));
  const fresh = target.kind === "new" && !target.draft && !revealProblems;
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set(fresh ? [] : [ALL]));
  const [saveProblems, setSaveProblems] = useState<{ key: string; problems: ReturnType<typeof problemsOfError> } | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Insert[] | null>(null);
  const [dragging, setDragging] = useState<PaletteBlock | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  const isTouched = useCallback((key: string) => touched.has(ALL) || touched.has(key), [touched]);
  const touch = (key: string) => {
    if (!isTouched(key)) setTouched(new Set([...touched, key]));
  };

  // ---------------------------------------------------------------- the check, and the apps' lists

  const key = partsKey(editor);
  const settledKey = useDebounced(key, CHECK_AFTER_MS);
  const parts = useMemo(() => JSON.parse(settledKey) as AutomationParts, [settledKey]);
  const check = useAutomationCheck(editing ? parts : null, settledKey, saved?.id ?? null);
  const dirty = isDirty(editor, start);
  const stepped = editor.steps.length > 0;

  const choices = appChoices(apps.data);
  const usableSlugs = useMemo(() => (editing ? choices.usable.map((app) => app.slug) : []), [editing, choices.usable]);
  const actionApps = useMemo(() => stepApps(editor.steps.filter((step) => step.type === "action")), [editor.steps]);
  const lists = useAppActionLists([...actionApps, ...usableSlugs]);
  const events = useAppEventLists(usableSlugs);
  const lookup = useCallback((app: string, action: string) => lists.byApp.get(app)?.find((item) => item.slug === action), [lists.byApp]);
  const changes: ChangesLookup = useCallback((app, action) => lookup(app, action)?.changesSomething, [lookup]);
  const actionLabel = useCallback((step: EditorStep) => (step.type === "action" && step.app && step.action ? lookup(step.app, step.action)?.name : undefined), [lookup]);

  const problems = saveProblems?.key === key ? saveProblems.problems : check.data?.problems;
  const read = problemsByStep(problems);
  const warnings = useMemo(() => conditionWarnings(editor.steps), [editor.steps]);
  const shown = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const [step, list] of read.byStep) if (isTouched(step)) map.set(step, list);
    for (const step of editor.steps) {
      const k = stepKeyOf(step);
      const list = [...(warnings.has(step.id) ? [warnings.get(step.id)!] : []), ...(isTouched(k) ? (read.byStepId.get(step.id) ?? []) : [])];
      if (list.length) map.set(k, list);
    }
    return map;
  }, [read.byStep, read.byStepId, editor.steps, warnings, isTouched]);
  const checking = editing && (key !== settledKey || check.isFetching);
  const knownBad = editing && !checking && check.data?.ok === false && settledKey === key;

  // ---------------------------------------------------------------- the diagram

  const lanes = useMemo(() => stepLanes(editor.steps, changes), [editor.steps, changes]);
  const diagram = useMemo(() => laneDiagram(editor.steps, lanes), [editor.steps, lanes]);
  const base = saved ? { enabled: saved.enabled, pausedReason: saved.pausedReason, lastRunAt: saved.lastRunAt, nextRunAt: saved.nextRunAt } : {};
  const source = previewSource(editor, base, actionLabel);
  const flow = useMemo(() => automationFlow(previewSource(editor, base, actionLabel), accountZone), [editor, actionLabel, accountZone, base.enabled, base.pausedReason, base.lastRunAt, base.nextRunAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const flowByKey = useMemo(() => new Map(flow.map((step) => [step.key, step])), [flow]);
  const preview = useMemo(() => previewSteps(editor.steps, actionLabel), [editor.steps, actionLabel]);
  const health = (slug: string) => appHealth(slug, apps.data).health;
  const appName = (slug: string) => apps.data?.find((app) => app.slug === slug)?.name ?? titleCase(slug);
  const iconOf = (slug: string) => apps.data?.find((app) => app.slug === slug)?.iconUrl ?? null;
  const connectChip = (slug: string): CanvasBox["chips"] => {
    const state = health(slug);
    if (state === "connect") return [{ text: `Connect ${appName(slug)}`, tone: "warn" }];
    if (state === "reconnect") return [{ text: `Reconnect ${appName(slug)}`, tone: "warn" }];
    if (state === "plan") return [{ text: "Not on your plan", tone: "warn" }];
    return [];
  };
  const changedChip = (boxKey: string): CanvasBox["chips"] => (changed?.has(boxKey) ? [{ text: "Changed", tone: "blue" }] : []);

  const boxes = new Map<string, CanvasBox>();
  {
    const text = triggerText(source, editor.mode, accountZone);
    boxes.set("trigger", {
      key: "trigger",
      ...text,
      iconUrl: iconOf(text.logo),
      problem: shown.get("trigger")?.[0] ?? null,
      chips: [...(editor.mode === "event" && editor.event.app ? (connectChip(editor.event.app) ?? []) : []), ...(changedChip("trigger") ?? [])],
      dim: saved ? !saved.enabled : false,
    });
  }
  editor.steps.forEach((step, index) => {
    const boxKey = stepKeyOf(step);
    const shape = preview[index];
    const box = flowByKey.get(boxKey);
    const mark = trail?.get(step.id);
    const action = step.type === "action";
    boxes.set(boxKey, {
      key: boxKey,
      logo: action ? step.app || "app" : "tex",
      iconUrl: action ? iconOf(step.app) : null,
      label: `Step ${index + 1} · ${action ? (step.app ? appName(step.app) : "An app") : "Tex"}`,
      title: box?.title ?? shape.title,
      line: stepLine(shape, action && step.app && step.action ? lookup(step.app, step.action)?.description : null),
      problem: shown.get(boxKey)?.[0] ?? null,
      removable: canRemoveStep(editor.steps, step.id),
      chips: [
        ...(action && (step.askFirst || step.risky) ? [{ text: "Asks you first", lock: true }] : []),
        ...(action && step.app ? (connectChip(step.app) ?? []) : []),
        ...(mark ? [{ text: mark.label, tone: TRAIL_TONE[mark.tone] }] : []),
        ...(changedChip(boxKey) ?? []),
      ],
    });
  });
  if (!stepped) {
    const uses = editor.apps.map(appName);
    const problem = shown.get("instruction")?.[0] ?? shown.get("apps")?.[0] ?? shown.get("asks")?.[0] ?? null;
    boxes.set("instruction", {
      key: "instruction",
      logo: "tex",
      label: "Tex",
      title: editor.title.trim() || "Say what Tex does",
      line: editor.instruction.trim().split(/\n/)[0] || "Write what Tex does each time it runs.",
      problem,
      chips: [
        ...(uses.length ? [{ text: `Uses ${listNames(uses, "and")}` }] : []),
        ...(editor.askFirst === "changes" ? [{ text: "Asks before any change", lock: true }] : []),
        ...(changed && (changed.has("instruction") || changed.has("apps") || changed.has("asks")) ? [{ text: "Changed", tone: "blue" as const }] : []),
      ],
    });
  }
  const empties = new Map<string, CanvasEmpty>();
  for (const item of diagram.items) if (item.kind === "empty") empties.set(item.key, { key: item.key, lane: item.lane, ...EMPTY_TEXT[item.lane] });
  const heads: CanvasHead[] = diagram.heads.map((head) => ({
    before: head.before,
    text: HEAD_TEXT[head.lane],
    ...(head.skip ? { skip: head.lane === "read" ? "Skip reading" : "Skip writing" } : {}),
  }));
  const conditions = new Map<string, CanvasCondition>();
  editor.steps.forEach((step, index) => {
    if (!hasCondition(step, index)) return;
    const pill = conditionPill(preview[index].onlyIf, index);
    if (pill) conditions.set(stepKeyOf(step), { text: pill, warn: warnings.has(step.id) });
  });
  const results = { title: "Automations chat", line: editor.copyTo ? `Results go to · and ${titleCase(editor.copyTo)}` : "Results go to" };

  // ---------------------------------------------------------------- the palette

  const blocks = useMemo(() => paletteBlocks(choices.usable.map((app) => ({ slug: app.slug, name: app.name })), events.byApp, lists.byApp), [choices.usable, events.byApp, lists.byApp]);
  const only = pending ? new Set<BlockGroup>(pending.map((insert) => insert.lane)) : undefined;
  const groups = paletteGroups(blocks, query, only ? { only } : {});
  const notConnected = choices.notConnected.filter((app) => isConnectable(app));

  // ---------------------------------------------------------------- changing it

  const select = (next: string) => {
    setSelected(next);
    if (compact) requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const changeBox = (box: string) => (next: EditorParts) => {
    setEditor(next);
    touch(box);
  };

  function addBlock(block: PaletteBlock, at?: number) {
    if (!editing) return;
    if (isTriggerBlock(block)) {
      setEditor((current) => withTriggerBlock(current, block));
      setSelected("trigger");
      setPending(null);
      return;
    }
    const lane = block.group as Lane;
    const place = at ?? pending?.find((insert) => insert.lane === lane)?.index ?? endOfLane(diagram.lanes, lane);
    // One instruction becomes its first step first, so the new step's id is unlike that one's too.
    const base = editor.steps.length ? editor : toStepped(editor);
    const step = blockStep(block, newStepId(base.steps.map((item) => item.id)));
    if (!step) return;
    const result = addStepAt(base, place, step, toStepped);
    if (!result.added) {
      toastError(`An automation has up to ${MAX_STEPS} steps`, "Remove one to add another.");
      return;
    }
    setEditor(result.editor);
    setSelected(stepKeyOf(step));
    setPending(null);
  }

  /** A removal with a way back: Undo puts the steps back as they were, if nothing changed since. */
  function removeWithUndo(next: EditorParts, title: string, body?: string) {
    const before = editor;
    setEditor(next);
    toast({ title, body, action: { label: "Undo", onClick: () => setEditor((current) => (current === next ? before : current)) } });
    if (next.steps.length === 0 && before.steps.length > 0) toast({ title: "No steps left", body: "It runs as one instruction again: say what Tex does in its box." });
  }

  function removeBox(boxKey: string) {
    const step = editor.steps.find((item) => stepKeyOf(item) === boxKey);
    if (!step || !canRemoveStep(editor.steps, step.id)) return;
    const next = removeStepFrom(editor, step.id);
    removeWithUndo(next, "Step removed");
    if (selected === boxKey) setSelected(texBox(next));
  }

  function skip(lane: "read" | "write") {
    const count = lanes.filter((item) => item === lane).length;
    const next = { ...editor, steps: skipLane(editor.steps, lanes, lane) };
    removeWithUndo(next, lane === "read" ? "Reading skipped" : "Writing skipped", `${count} step${count === 1 ? "" : "s"} removed.`);
    if (selected.startsWith("step:") && !next.steps.some((step) => stepKeyOf(step) === selected)) setSelected(texBox(next));
  }

  function plus(inserts: Insert[]) {
    if (!editing) return;
    if (inserts.length === 0 || editor.steps.length >= MAX_STEPS) {
      toastError(`An automation has up to ${MAX_STEPS} steps`, "Remove one to add another.");
      return;
    }
    setPending(inserts);
    setQuery("");
    setPaletteOpen(true);
    requestAnimationFrame(() => paletteRef.current?.scrollIntoView({ behavior: "smooth", block: compact ? "start" : "nearest" }));
  }

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
      setTouched(new Set([ALL]));
      const first = problemBox(firstProblemKey(found), stepped);
      if (first) setSelected(first);
    }
    if (error instanceof ApiError && error.planLimit) toastError(title, error.message, { label: "See plans", href: PRICING_PATH });
    else if (found?.length) toastError(title, "Fix the boxes marked in amber, then save again.");
    else toastError(title, error);
  }

  const name = editor.title.trim() || saved?.title || "New automation";
  const savePending = create.isPending || change.isPending || draftSave.pending;
  const blocked = warnings.size > 0;

  function save(enabled?: boolean) {
    setTouched(new Set([ALL]));
    if (knownBad) {
      // The check found something: every box's problems show, and the first one opens.
      const first = problemBox(firstProblemKey(check.data?.problems ?? []), stepped);
      if (first) setSelected(first);
      toastError(`Couldn’t save “${name}” yet`, "Fix the boxes marked in amber, then save again.");
      return;
    }
    if (blocked) {
      const first = editor.steps.find((step) => warnings.has(step.id));
      if (first) setSelected(stepKeyOf(first));
      toastError(`Couldn’t save “${name}” yet`, "A step’s “only if” now looks at another step. Check the steps marked in amber, then save again.");
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
              body: automation.enabled ? "It runs from now on. Each run answers in your Automations chat." : "It won’t run until you turn it on. Try it first with Test run.",
            });
            router.push(automationHref(automation.id));
          },
          onError: (error) => refused(error, `Couldn’t save “${name}”`),
        },
      );
    } else {
      change.mutate(
        { automationId: target.automation.id, ...body, title: body.title ?? "", instruction: body.instruction ?? "", draftId },
        {
          onSuccess: (automation) => {
            toast({ title: `Saved the changes to “${automation.title}”`, body: automation.enabled ? "The next run follows them." : "It stays paused." });
            // The canvas now shows it as saved, in the server's own words.
            setEditor(editorFrom(automation, accountZone));
            setSaveProblems(null);
            if (target.draft) router.push(automationHref(automation.id));
          },
          onError: (error) => refused(error, `Couldn’t save the changes to “${name}”`),
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

  // ---------------------------------------------------------------- the settings of the open box

  const context: EditorContext = { apps: apps.data, channels: channels.data, accountZone };
  const runs = (() => {
    if (editor.mode === "event") return "Runs each time that happens.";
    if (!editor.mode || !check.data?.nextRuns?.length) return null;
    const words = check.data.nextRuns.map((at) => formatDateTime(at));
    return editor.mode === "once" ? `Runs once: ${words[0]}.` : `Next runs: ${words.join(" · ")}.`;
  })();
  const costLine = stepped ? stepsCostLine(preview, lookup) : null;

  function panel(): ReactNode {
    const flowBox = (boxKey: string): FlowStep | undefined => flowByKey.get(boxKey) ?? (boxKey === "instruction" ? flowByKey.get("instruction") : undefined);
    if (selected === "about") {
      const times = saved ? describeAutomationTimes(saved) : null;
      return (
        <>
          <InspectorHeader logo="tex" label="This automation" title={name} />
          {editing ? (
            <InstructionForm editor={editor} onChange={changeBox("instruction")} problems={stepped ? (shown.get("instruction") ?? []) : []} context={context} />
          ) : null}
          {times && (
            <dl className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <dt className={cn(T3, "text-muted")}>Next run</dt>
                <dd className={cn(T2, "font-medium")}>{times.next}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className={cn(T3, "text-muted")}>Last run</dt>
                <dd className={cn(T2, "font-medium")}>{times.last}</dd>
              </div>
            </dl>
          )}
          {costLine && <p className={cn(T3, "rounded-xl bg-bg px-4 py-3 text-fg-2")}>{costLine}</p>}
        </>
      );
    }
    if (selected === "results") {
      return (
        <>
          <InspectorHeader logo="chat" label="Results" title="Automations chat" />
          {editing ? <ResultsForm editor={editor} onChange={changeBox("results")} problems={shown.get("results") ?? []} context={context} /> : <Details details={flowBox("results")?.details ?? []} note={flowBox("results")?.note} />}
        </>
      );
    }
    if (selected === "trigger") {
      const text = boxes.get("trigger")!;
      return (
        <>
          <InspectorHeader logo={text.logo} iconUrl={text.iconUrl} label={text.label === "Start when" ? "Start when" : `Start when · ${text.label}`} title={text.title} status={editor.mode === "event" && editor.event.app ? <HealthChip health={health(editor.event.app)} /> : undefined} />
          {editing ? (
            <>
              <TriggerForm editor={editor} onChange={changeBox("trigger")} problems={shown.get("trigger") ?? []} context={context} />
              {runs && <p className={cn(T3, "rounded-xl bg-accent-soft/70 px-4 py-3 text-fg-2")}>{runs}</p>}
            </>
          ) : (
            <Details details={flowBox("trigger")?.details ?? []} note={flowBox("trigger")?.note} />
          )}
        </>
      );
    }
    if (selected === "instruction" && !stepped) {
      return (
        <>
          <InspectorHeader logo="tex" label="Tex" title={editor.title.trim() || "What Tex does"} />
          {editing ? (
            <>
              <InstructionForm editor={editor} onChange={changeBox("instruction")} problems={shown.get("instruction") ?? []} context={context} />
              <PanelSection>
                <AppsForm editor={editor} onChange={changeBox("apps")} problems={shown.get("apps") ?? []} context={context} />
              </PanelSection>
              <PanelSection title="When Tex asks you first">
                <AsksForm editor={editor} onChange={changeBox("asks")} problems={shown.get("asks") ?? []} context={context} />
              </PanelSection>
              <InspectorFooter note="Uses credits like a chat reply" />
            </>
          ) : (
            <Details details={flowBox("instruction")?.details ?? []} note={flowBox("instruction")?.note} />
          )}
        </>
      );
    }
    const index = editor.steps.findIndex((step) => stepKeyOf(step) === selected);
    if (index < 0) return <p className={cn(T2, "text-muted")}>Click a box on the canvas to change it.</p>;
    const step = editor.steps[index];
    const box = boxes.get(selected)!;
    const lane = diagram.mode === "lanes" ? lanes[index] : null;
    const action = step.type === "action";
    const found = action && step.app && step.action ? lookup(step.app, step.action) : undefined;
    const laneName = lanes[index] === "read" ? "Read" : lanes[index] === "write" ? "Write or send" : "Tex";
    const note = action ? (found ? (found.changesSomething ? "1 credit when it runs" : "Free to read") : step.risky ? "1 credit when it runs" : null) : "Uses credits like a chat reply";
    const move = (by: -1 | 1) => () => setEditor((current) => ({ ...current, steps: moveWithinLane(current.steps, stepLanes(current.steps, changes), step.id, by) }));
    return (
      <>
        <InspectorHeader
          logo={box.logo}
          iconUrl={box.iconUrl}
          label={action ? `${laneName} · ${step.app ? appName(step.app) : "Pick an app"}` : "Tex"}
          title={box.title}
          status={action && step.app ? <HealthChip health={health(step.app)} /> : undefined}
        />
        {editing ? (
          <>
            <StepForm
              step={step}
              index={index}
              lane={lane}
              onChange={(next) => {
                setEditor((current) => ({ ...current, steps: replaceStep(current.steps, next) }));
                touch(selected);
              }}
              onMoveUp={canMoveStep(lanes, index, -1) ? move(-1) : undefined}
              onMoveDown={canMoveStep(lanes, index, 1) ? move(1) : undefined}
              problems={isTouched(selected) ? (read.byStepId.get(step.id) ?? []) : []}
              warning={warnings.get(step.id) ?? null}
              previousId={index > 0 ? editor.steps[index - 1].id : null}
              apps={apps.data}
            />
            <InspectorFooter onRemove={canRemoveStep(editor.steps, step.id) ? () => removeBox(selected) : undefined} note={note} />
          </>
        ) : (
          <Details details={flowBox(selected)?.details ?? []} note={flowBox(selected)?.note} />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------- the top bar

  const state = saved ? automationState(saved) : null;
  const finished = saved ? isFinished(saved) : false;
  const unsaved = target.kind === "new" || dirty || Boolean(target.draft && target.draft.status === "open");
  const STATE_TONE: Record<NonNullable<typeof state>["tone"], ChipTone> = { on: "ok", paused: "neutral", danger: "warn", done: "neutral" };
  const problemCount = shown.size + read.stepsList.length;

  const menu = [
    ...(editing && editor.mode ? [{ label: "Ask Tex to change this", icon: <ChatIcon size={16} />, onSelect: askTexToChange, pending: askTex.isPending }] : []),
    ...(saved && !target.draft ? [{ label: "See runs in the chat", icon: <ChatIcon size={16} />, href: AUTOMATIONS_CHAT_HREF }] : []),
    ...(editing && diagram.mode === "mixed" ? [{ label: "Sort into lanes", icon: <PencilIcon size={16} />, onSelect: () => setEditor({ ...editor, steps: sortIntoLanes(editor.steps, lanes) }) }] : []),
    ...(editing && stepped
      ? [
          {
            label: "Back to one instruction",
            icon: <PencilIcon size={16} />,
            confirm: { title: "Back to one instruction?", body: "The steps are removed; Tex’s words in them join the instruction, and their apps become the apps Tex may use.", label: "Remove the steps" },
            onSelect: () => {
              setEditor(toOneInstruction(editor));
              setSelected("instruction");
            },
          },
        ]
      : []),
    ...(onDiscard && target.draft?.status === "open"
      ? [{ label: "Discard draft", icon: <TrashIcon size={16} />, confirm: { title: "Discard this draft?", body: "Nothing was set up, so nothing stops.", label: "Discard draft" }, onSelect: onDiscard }]
      : []),
    ...(saved && !target.draft
      ? [
          {
            label: "Delete",
            icon: <TrashIcon size={16} />,
            pending: remove.isPending,
            confirm: { title: `Delete “${saved.title}”?`, body: "It stops running and is gone for good. Its runs stay in the Automations chat.", label: "Delete for good" },
            onSelect: () =>
              remove.mutate(saved.id, {
                onSuccess: () => {
                  toast({ title: `Deleted “${saved.title}”` });
                  router.push("/automations");
                },
                onError: (error) => toastError(`Couldn’t delete “${saved.title}”`, error),
              }),
          },
        ]
      : []),
  ];

  const topBar = (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-surface px-4 py-3 md:min-h-16 md:px-6">
      <div className="flex min-w-0 flex-[1_1_280px] flex-wrap items-center gap-x-3 gap-y-2">
        <Crumbs
          className={T2}
          parts={[{ href: "/automations", label: "Automations" }]}
          current={
            <button
              type="button"
              onClick={() => select("about")}
              title="Name and purpose"
              aria-label={`${name}: its name and purpose`}
              className={cn("group/name inline-flex max-w-full items-center gap-2 rounded-md text-left", shown.has("instruction") && stepped && "text-warn")}
            >
              <span className="truncate">{name}</span>
              {editing && <PencilIcon size={12} className="shrink-0 text-faint transition-colors group-hover/name:text-fg" />}
            </button>
          }
        />
        {unsaved && editing ? (
          <Chip>
            <Dot tone="warn" size={6} />
            Not saved
          </Chip>
        ) : state ? (
          <Chip tone={STATE_TONE[state.tone]}>
            {state.tone === "on" && <Dot tone="ok" size={6} />}
            {state.label}
          </Chip>
        ) : null}
        {saved && !finished && !target.draft && (
          <Switch
            on={saved.enabled}
            size="sm"
            label={`${saved.enabled ? "Pause" : "Resume"} ${saved.title}`}
            disabled={update.isPending}
            onToggle={() =>
              update.mutate(
                { automationId: saved.id, enabled: !saved.enabled },
                {
                  onSuccess: (next) => toast({ title: next.enabled ? `“${next.title}” is on again` : `Paused “${next.title}”`, body: next.enabled ? undefined : "It won’t run until you turn it back on." }),
                  onError: (error) => toastError(`Couldn’t ${saved.enabled ? "pause" : "resume"} “${saved.title}”`, error),
                },
              )
            }
          />
        )}
        {runLine && (
          <span title={runLine.line} className={cn(T3, "flex min-w-0 items-center gap-2 text-muted")}>
            <Dot tone={RUN_DOT[runLine.tone]} size={6} />
            <span className="truncate">{runLine.line}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editing && (
          <span aria-live="polite" className={cn(T3, "text-muted tabular-nums")}>
            {shownStepCount(editor.steps)} of {MAX_STEPS} steps
            {checking && <span className="sr-only"> · checking</span>}
          </span>
        )}
        {(knownBad || blocked) && problemCount > 0 && (
          <button
            type="button"
            onClick={() => {
              const first = [...shown.keys()][0];
              if (first) select(problemBox(first, stepped) ?? first);
            }}
            className="rounded-md"
          >
            <Chip tone="warn">
              {problemCount} to fix
              <ChevronRightIcon size={12} strokeWidth={2.4} />
            </Chip>
          </button>
        )}
        {saved && !finished && !target.draft && <RunOnceButton automation={saved} unsaved={dirty} />}
        {editing &&
          (target.kind === "new" ? (
            <>
              <Btn pending={savePending && (create.variables?.enabled === false || draftSave.paused)} disabled={savePending} onClick={() => save(false)}>
                Save paused
              </Btn>
              <Btn variant="primary" pending={savePending && create.variables?.enabled !== false && !draftSave.paused} disabled={savePending} onClick={() => save(true)}>
                Save
              </Btn>
            </>
          ) : unsaved ? (
            <Btn variant="primary" pending={savePending} disabled={savePending} onClick={() => save()}>
              Save
            </Btn>
          ) : (
            <Btn disabled>Saved</Btn>
          ))}
        {menu.length > 0 && <MoreMenu label={`More for ${name}`} items={menu} />}
      </div>
    </header>
  );

  // ---------------------------------------------------------------- the page

  const pendingLabel = pending
    ? pending.length === 1
      ? `Adding to ${LANE_TITLE[pending[0].lane]}: pick a block`
      : `Adding a step here: pick a block of ${listNames(pending.map((insert) => LANE_TITLE[insert.lane].toLowerCase()), "or")}`
    : null;

  return (
    <div className="type-scale flex min-h-0 flex-1 flex-col bg-bg">
      {topBar}
      <div className="@container/builder flex min-h-0 flex-1 flex-col overflow-y-auto @min-[1040px]/builder:overflow-hidden">
        {(banner || read.planLimit || read.stepsList.length > 0 || (editing && diagram.mode === "mixed") || readOnly) && (
          <div className="flex shrink-0 flex-col gap-3 border-b border-line bg-surface px-4 py-3 md:px-6">
            {readOnly && <p className={cn(T2, "text-fg-2")}>{readOnly}</p>}
            {banner}
            {read.planLimit && (
              <Notice
                action={
                  <Link href={PRICING_PATH} className={cn(T3, "font-medium text-accent-dark hover:text-fg")}>
                    See plans
                  </Link>
                }
              >
                {read.general.find((problem) => problem.code === "plan_limit")?.message}
              </Notice>
            )}
            {read.stepsList.length > 0 && <Problems problems={read.stepsList} />}
            {editing && diagram.mode === "mixed" && (
              <div role="status" className={cn(T2, "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-bg px-4 py-3")}>
                <p className="min-w-0 flex-[1_1_320px] text-fg-2">
                  <span className="font-semibold text-fg">Shown in the order they run.</span> These steps don’t run read, then Tex, then write, so nothing was moved. Sorting
                  them into lanes changes the order they run in.
                </p>
                <Btn size="sm" onClick={() => setEditor({ ...editor, steps: sortIntoLanes(editor.steps, lanes) })}>
                  Sort into lanes
                </Btn>
              </div>
            )}
          </div>
        )}
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1",
            editing ? "@min-[1040px]/builder:grid-cols-[288px_minmax(0,1fr)_360px]" : "@min-[1040px]/builder:grid-cols-[minmax(0,1fr)_360px]",
            "@min-[1040px]/builder:grid-rows-[minmax(0,1fr)]",
          )}
        >
          {editing && (
            <aside
              ref={paletteRef}
              aria-label="Blocks"
              className="border-b border-line bg-surface px-4 py-6 @min-[1040px]/builder:overflow-y-auto @min-[1040px]/builder:border-r @min-[1040px]/builder:border-b-0"
            >
              {/* On a phone the blocks fold away until wanted. */}
              <Btn className={cn("w-full md:hidden", paletteOpen && "mb-6")} onClick={() => setPaletteOpen(!paletteOpen)} aria-expanded={paletteOpen}>
                {paletteOpen ? "Hide the blocks" : "Add a block"}
              </Btn>
              <div className={cn(!paletteOpen && "max-md:hidden")}>
                <Palette
                  groups={groups}
                  query={query}
                  onQuery={setQuery}
                  onPick={(block) => addBlock(block)}
                  onDragStart={setDragging}
                  onDragEnd={() => setDragging(null)}
                  pending={pendingLabel ? { label: pendingLabel, onCancel: () => setPending(null) } : null}
                  notConnected={notConnected}
                  onConnect={(app: App) => connect.open(app, "connect")}
                  loading={lists.pending || events.pending}
                  dragging={dragging?.key ?? null}
                />
              </div>
            </aside>
          )}
          <section aria-label="Canvas" className={cn("relative min-w-0 bg-bg", compact ? "" : "h-[720px] @min-[1040px]/builder:h-auto")}>
            <LaneCanvas
              diagram={diagram}
              boxes={boxes}
              empties={empties}
              results={results}
              heads={heads}
              conditions={conditions}
              selected={selected}
              count={editor.steps.length}
              editing={editing}
              compact={compact}
              dragging={dragging ? dragging.group : null}
              onSelect={select}
              onRemove={removeBox}
              onSkip={skip}
              onPlus={plus}
              onDrop={(insert) => dragging && addBlock(dragging, insert.index)}
              onDropTrigger={() => dragging && addBlock(dragging)}
              label={`${name}, step by step`}
            />
          </section>
          <aside
            ref={inspectorRef}
            aria-label="Settings for the open box"
            className="flex flex-col gap-6 border-t border-line bg-surface p-6 @min-[1040px]/builder:overflow-y-auto @min-[1040px]/builder:border-t-0 @min-[1040px]/builder:border-l"
          >
            {panel()}
          </aside>
        </div>
      </div>
      {connect.dialog}
    </div>
  );
}
