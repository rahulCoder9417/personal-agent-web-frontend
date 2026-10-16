"use client";

// `/automations/new`: the two ways to make one. Ask Tex in words (the chat opens with them typed in,
// and Tex answers with a draft to check and save), or pick how it works (read, decide, then act;
// read and tell me; write without reading; just Tex) and build it on the canvas. Below, every
// template. `?shape=` and `?template=` open the canvas with one filled in.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { useMe } from "@/lib/api/hooks";
import { EDITOR_TEMPLATES, emptyEditor } from "@/lib/automation-editor";
import { findShape, SHAPES, shapeSteps, type Shape } from "@/lib/automation-lanes";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
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

/** A shape in small: the trigger, reading (or "No reading"), Tex, writing (or "No writing"). */
function Mini({ shape }: { shape: Shape }) {
  const gap = <span aria-hidden className="h-0.5 min-w-2 flex-1 rounded-sm bg-line-strong" />;
  const skipped = (text: string) => (
    <span className={cn(T3, "inline-flex h-7 items-center rounded-lg border-[1.5px] border-dashed border-line-strong px-2 font-medium whitespace-nowrap text-faint")}>{text}</span>
  );
  return (
    <span aria-hidden className="flex min-h-14 items-center gap-2 rounded-xl bg-bg p-3">
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

export function NewAutomation() {
  const router = useRouter();
  const [ask, setAsk] = useState("");
  const id = useId();
  const draft = () => {
    if (ask.trim()) router.push(chatDraftHref(ask));
  };

  return (
    <div className="type-scale scroll-pane min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 pt-6 pb-12 md:px-8 md:pt-12">
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              draft();
            }}
            className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_2px_var(--accent)]"
          >
            <textarea
              id={`${id}-text`}
              rows={3}
              value={ask}
              onChange={(event) => setAsk(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  draft();
                }
              }}
              placeholder="Every weekday at 10, list the pull requests waiting for my review and email them to me."
              className={cn(T2, "min-h-[60px] resize-none bg-transparent outline-none placeholder:text-muted")}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div aria-label="Ideas" role="group" className="flex flex-wrap gap-2">
                {IDEAS.map((idea) => (
                  <button
                    key={idea.label}
                    type="button"
                    onClick={() => setAsk(idea.ask)}
                    className={cn(T3, "h-8 rounded-full bg-bg px-3 font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg")}
                  >
                    {idea.label}
                  </button>
                ))}
              </div>
              <Btn type="submit" variant="primary" disabled={!ask.trim()}>
                Draft it
              </Btn>
            </div>
          </form>
        </section>

        <section aria-labelledby={`${id}-shapes`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-shapes`} className={cn(T2, "font-semibold")}>
              Or pick how it works
            </h2>
            <p className={cn(T3, "text-muted")}>Every automation starts on a trigger and ends with Tex. Reading from an app first and writing to an app after are both optional.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {SHAPES.map((shape) => (
              <li key={shape.id}>
                <Link
                  href={`/automations/new?shape=${shape.id}`}
                  className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-6 text-fg shadow-[0_0_0_1px_var(--line)] transition-shadow hover:shadow-[0_0_0_2px_var(--accent)]"
                >
                  <Mini shape={shape} />
                  <span className="flex flex-col gap-1">
                    <span className={cn(T2, "font-semibold")}>{shape.title}</span>
                    <span className={cn(T3, "text-fg-2")}>{shape.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
