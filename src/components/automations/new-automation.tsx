"use client";

// `/automations/new`: the two ways to make one. Ask Tex in words (the page stays: Tex checks whether
// it can be an automation, then the canvas opens with Tex's draft to check and save, or a short note
// says why not and what would work), or pick how it works (read, decide, then act; read and tell me;
// write without reading; just Tex) and build it on the canvas. Below, every template. `?shape=` and
// `?template=` open the canvas with one filled in.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/lib/api/client";
import { qk, useAskForDraft, useAutomationDraft, useMe, useThread } from "@/lib/api/hooks";
import { useCatchUpWhileQuiet } from "@/lib/api/stream";
import { EDITOR_TEMPLATES, emptyEditor } from "@/lib/automation-editor";
import { draftHref } from "@/lib/automation-flow";
import { findShape, SHAPES, shapeSteps, type Shape } from "@/lib/automation-lanes";
import { CHECKING_TEXT, DRAFT_ASK_SLOW_MS, draftAskView, type DraftAskView } from "@/lib/draft-ask";
import { cn } from "@/lib/format";
import { GUTTER } from "../page";
import { Spinner } from "../ui";
import { CanvasFrame } from "./automation-screen";
import { Builder } from "./builder";
import { AppLogo, Btn, Crumbs, T1, T2, T3 } from "./parts";
import { TemplateCards } from "./templates";

/** Ideas under the box: a click puts the whole request in it. */
const IDEAS = [
  { label: "Sum up my email every morning", ask: "Every morning at 9, sum up my unread email." },
  { label: "Review my pull requests", ask: "When a pull request opens in my repo, review it and comment on it." },
  { label: "Remind me every Friday", ask: "Remind me every Friday at 5pm to send the weekly report." },
];

/** The ways it can work, by the width the list has (a container query, so the sidebar counts). */
export const SHAPE_GRID = "grid-cols-1 @min-[600px]:grid-cols-2 @min-[1520px]:grid-cols-4";

/** A shape in small: the trigger, reading (or "No reading"), Tex, writing (or "No writing"). */
function Mini({ shape }: { shape: Shape }) {
  // On a narrow card (a phone) the lines give up their length first, then a "No reading" goes onto
  // two lines, so the picture always stays inside its card.
  const gap = <span aria-hidden className="h-0.5 min-w-0 flex-1 rounded-sm bg-line-strong" />;
  const skipped = (text: string) => (
    <span className={cn(T3, "inline-flex min-h-7 items-center rounded-lg border-[1.5px] border-dashed border-line-strong px-2 py-0.5 text-center font-medium text-faint")}>{text}</span>
  );
  return (
    <span aria-hidden className="flex min-h-14 min-w-0 items-center gap-1.5 rounded-xl bg-bg p-3">
      <AppLogo slug="schedule" size={28} />
      {gap}
      {shape.read ? <AppLogo slug="gmail" size={28} /> : skipped("No reading")}
      {gap}
      <AppLogo slug="tex" size={28} />
      {gap}
      {shape.write ? <AppLogo slug="gmail" size={28} /> : skipped("No writing")}
    </span>
  );
}

const LINK = "font-medium text-accent hover:text-accent-dark";

/**
 * Tex's verdict under the box, once there is one: why it can't be an automation (with a way back
 * into the box), a failure, or where to look when it is slow or Tex asked for an OK. Soft fills, no
 * borders. While Tex checks, the box itself says so (`CHECKING_TEXT`), so nothing shows here.
 */
export function AskNote({ view, onTryAgain }: { view: DraftAskView; onTryAgain: () => void }) {
  if (view.kind === "cant")
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-surface-2 px-4 py-3 sm:flex-row sm:items-start">
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <AppLogo slug="tex" size={24} />
          <p className={cn(T2, "min-w-0 flex-1 break-words whitespace-pre-line text-fg-2")}>{view.text}</p>
        </span>
        <Btn size="sm" onClick={onTryAgain} className="self-start">
          Try another prompt
        </Btn>
      </div>
    );
  if (view.kind === "failed")
    return (
      <p role="alert" className={cn(T2, "rounded-xl bg-danger-soft px-4 py-3 text-fg")}>
        {view.text}
        {view.outOfCredits && (
          <>
            {" "}
            <Link href="/settings/credits" className={LINK}>
              Get credits
            </Link>
          </>
        )}
      </p>
    );
  if (view.kind === "elsewhere")
    return (
      <p role="status" className={cn(T2, "rounded-xl bg-surface-2 px-4 py-3 text-fg-2")}>
        {view.why === "asked" ? "Tex needs your OK first" : "Tex is taking longer"} —{" "}
        <Link href={view.href} className={LINK}>
          see it in Chat
        </Link>
      </p>
    );
  return null;
}

/**
 * "Ask Tex to set it up": the words go to Tex as a request for a draft (`useAskForDraft`), and the
 * page stays. While Tex checks, the box says so and waits; Tex's draft opens on the canvas (nothing
 * runs until it is saved); a plain answer is the note under the box, with the words kept to edit.
 * Each try is one turn of Tex, like a chat message. The turn lives in the Automations chat, where
 * it can be found later.
 */
function AskTex({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const box = useRef<HTMLTextAreaElement>(null);
  const [words, setWords] = useState("");
  // The request as the API saved it, and whether Tex has been at it longer than DRAFT_ASK_SLOW_MS.
  const [sent, setSent] = useState<{ message: Message; slow: boolean } | null>(null);
  const ask = useAskForDraft();
  const conversationId = sent?.message.conversationId ?? null;
  const thread = useThread(conversationId);
  const items = useMemo(() => thread.data?.pages.flatMap((page) => page.items), [thread.data]);
  const view = draftAskView({ sending: ask.isPending, sendError: ask.error, sent: sent?.message ?? null, thread: items, slow: sent?.slow ?? false });
  const checking = view.kind === "checking" || view.kind === "draft";
  // The live stream brings the verdict; if it goes quiet meanwhile, the thread is asked for again.
  useCatchUpWhileQuiet(checking && sent !== null, conversationId);

  // Slow: the page says so, asks for the thread once more, and keeps waiting (a later verdict still shows).
  useEffect(() => {
    if (!sent || sent.slow) return;
    const timer = setTimeout(() => {
      setSent((now) => (now?.message.id === sent.message.id ? { ...now, slow: true } : now));
      void qc.invalidateQueries({ queryKey: qk.thread(sent.message.conversationId) });
    }, DRAFT_ASK_SLOW_MS);
    return () => clearTimeout(timer);
  }, [sent, qc]);

  // Tex drafted it: the draft opens on the canvas (a change of an automation, on that automation's page).
  const draftId = view.kind === "draft" ? view.draftId : null;
  const draft = useAutomationDraft(draftId);
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!draftId || opened.current === draftId || (!draft.data && !draft.isError)) return;
    opened.current = draftId;
    router.push(draftHref(draft.data ?? { id: draftId, changeOf: null }));
  }, [draftId, draft.data, draft.isError, router]);

  const submit = () => {
    const text = words.trim();
    if (!text || checking) return;
    setSent(null);
    ask.reset();
    ask.mutate({ text, clientMessageId: crypto.randomUUID() }, { onSuccess: (message) => setSent({ message, slow: false }) });
  };
  const tryAgain = () => {
    const element = box.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  };

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        aria-busy={checking || undefined}
        className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_2px_var(--accent)]"
      >
        <textarea
          ref={box}
          id={`${id}-text`}
          rows={3}
          value={words}
          readOnly={checking}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Every weekday at 10, list the pull requests waiting for my review and email them to me."
          className={cn(T2, "min-h-[60px] resize-none bg-transparent outline-none placeholder:text-muted", checking && "text-fg-2")}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {checking ? (
            <p role="status" className={cn(T3, "flex min-w-0 items-center gap-2 text-fg-2")}>
              <Spinner size={14} className="text-accent" />
              {CHECKING_TEXT}
            </p>
          ) : (
            <div aria-label="Ideas" role="group" className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button
                  key={idea.label}
                  type="button"
                  onClick={() => setWords(idea.ask)}
                  className={cn(T3, "h-8 rounded-full bg-bg px-3 font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg")}
                >
                  {idea.label}
                </button>
              ))}
            </div>
          )}
          <Btn type="submit" variant="primary" disabled={!words.trim() || checking}>
            Draft it
          </Btn>
        </div>
      </form>
      <AskNote view={view} onTryAgain={tryAgain} />
    </>
  );
}

export function NewAutomation() {
  const id = useId();

  return (
    <div className="type-scale scroll-pane min-h-0 flex-1 overflow-y-auto">
      {/* The whole width of the sheet, with the same gutters as every other screen. */}
      <div className={cn("flex w-full min-w-0 flex-col gap-8 pt-6 pb-12 md:pt-12", GUTTER)}>
        <header className="flex flex-col gap-3">
          <Crumbs className={T3} parts={[{ href: "/automations", label: "Automations" }]} current="New automation" />
          <div className="flex flex-col gap-1">
            <h1 className={T1}>New automation</h1>
            <p className={cn(T2, "text-muted")}>Say it in words, or pick how it should work and build it on the canvas.</p>
          </div>
        </header>

        <section aria-labelledby={`${id}-ask`} className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-[0_0_0_1px_var(--line)]">
          <div className="flex items-center gap-3">
            <AppLogo slug="tex" size={36} />
            <span className="flex flex-col gap-1">
              <label id={`${id}-ask`} htmlFor={`${id}-text`} className={cn(T2, "font-semibold")}>
                Ask Tex to set it up
              </label>
              <span className={cn(T3, "text-muted")}>Tex drafts it on the canvas. Nothing runs until you save.</span>
            </span>
          </div>
          <AskTex id={id} />
        </section>

        <section aria-labelledby={`${id}-shapes`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-shapes`} className={cn(T2, "font-semibold")}>
              Or pick how it works
            </h2>
            <p className={cn(T3, "text-muted")}>Every automation starts on a trigger and ends with Tex. Reading from an app first and writing to an app after are both optional.</p>
          </div>
          {/* The four in one row once each has room for its picture (about 370px), two by two below that, then one under another. */}
          <div className="@container">
            <ul className={cn("grid gap-4", SHAPE_GRID)}>
              {SHAPES.map((shape) => (
                <li key={shape.id} className="min-w-0">
                  <Link
                    href={`/automations/new?shape=${shape.id}`}
                    className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-6 text-fg shadow-[0_0_0_1px_var(--line)] transition-shadow hover:shadow-[0_0_0_2px_var(--accent)]"
                  >
                    <Mini shape={shape} />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className={cn(T2, "font-semibold")}>{shape.title}</span>
                      <span className={cn(T2, "text-fg-2")}>{shape.blurb}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="templates" aria-labelledby={`${id}-templates`} className="flex scroll-mt-6 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-templates`} className={cn(T2, "font-semibold")}>
              Start from a template
            </h2>
            <p className={cn(T3, "text-muted")}>A template fills the canvas; change anything after.</p>
          </div>
          <TemplateCards />
        </section>
      </div>
    </div>
  );
}

/** A new automation on the canvas: from a shape, from a template, or empty. */
export function NewBuilder({ templateId, shapeId }: { templateId?: string | null; shapeId?: string | null }) {
  const zone = useMe().data?.timezone;
  const template = EDITOR_TEMPLATES.find((item) => item.id === templateId) ?? null;
  const shape = findShape(shapeId);
  const start = useMemo(() => {
    if (!zone) return null;
    const empty = emptyEditor(zone);
    if (template) return template.fill(empty);
    if (shape) return { ...empty, steps: shapeSteps(shape) };
    return empty;
  }, [zone, template, shape]);
  if (!start || !zone)
    return (
      <CanvasFrame current="New automation">
        <div aria-hidden className="mx-auto flex max-w-[340px] flex-col gap-12">
          {[0, 1, 2].map((row) => (
            <span key={row} className="h-[100px] animate-pulse rounded-[14px] bg-surface-2" />
          ))}
        </div>
      </CanvasFrame>
    );
  return <Builder key={template?.id ?? shape?.id ?? "empty"} target={{ kind: "new" }} start={start} accountZone={zone} revealProblems={Boolean(template)} />;
}
