"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApps, useAutomations, useMe } from "@/lib/api/hooks";
import { appChoices, EDITOR_TEMPLATES, emptyEditor, type EditorParts } from "@/lib/automation-editor";
import { AUTOMATION_KINDS } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { cn, titleCase } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { BrandIcon } from "../brand-icon";
import { PageBody, READING } from "../page";
import { ButtonLink, IconTile, SectionLabel } from "../ui";
import { AutomationEditor } from "./automation-editor";
import { BackToAutomations } from "./automation-screen";
import { KIND_TINT, KindIcon } from "./kind-icon";
import { PlanMeter } from "./plan-meter";

/**
 * `/automations/new` without a draft: an empty canvas to build one by hand, box by box, with a few
 * templates that fill it, and the other way in, asking Tex in chat.
 */
export function NewAutomation() {
  const me = useMe();
  const apps = useApps();
  const automations = useAutomations();
  const zone = me.data?.timezone;
  const [template, setTemplate] = useState<{ id: string; start: EditorParts } | null>(null);
  const empty = useMemo(() => (zone ? emptyEditor(zone) : null), [zone]);
  const usable = new Set(appChoices(apps.data).usable.map((app) => app.slug));

  return (
    <PageBody className="gap-6">
      <BackToAutomations />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-1.5">
          <h2 className="text-[19px] leading-tight font-semibold tracking-[-0.015em]">A new automation</h2>
          <p className={cn("text-[14px] text-muted", READING)}>
            Build it box by box: when it runs, what Tex does, the apps it may use, when it asks you first, and where the results go. Each box is checked as you
            fill it in. Nothing runs until you save; Save paused lets you try it first with Run once now.
          </p>
        </div>
        {automations.data && <PlanMeter used={automations.data.length} />}
      </div>

      <section aria-labelledby="editor-templates" className="flex flex-col gap-2.5">
        <SectionLabel>
          <span id="editor-templates">Start from a template</span>
        </SectionLabel>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-2.5">
          {EDITOR_TEMPLATES.map((item) => {
            const on = template?.id === item.id;
            const needs = item.app && apps.isSuccess && !usable.has(item.app) ? titleCase(item.app) : null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => empty && setTemplate({ id: item.id, start: item.fill(empty) })}
                  className={cn(
                    "flex h-full w-full flex-col gap-1.5 rounded-xl border bg-surface p-3 text-left transition-colors",
                    on ? "border-fg" : "border-line hover:border-fg/40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <IconTile size={26}>{item.app ? <BrandIcon name={item.app} size={14} /> : <KindIcon kind="repeat" size={14} className="text-nav" />}</IconTile>
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold">{item.name}</span>
                  </span>
                  <span className="text-[12.5px] text-fg-2">{item.blurb}</span>
                  {needs && <span className="text-[12px] text-muted">Needs {needs} connected</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-[12.5px] text-muted">
          A template fills the boxes; change anything after.{" "}
          {template && (
            <button type="button" className="font-medium text-accent hover:text-accent-dark" onClick={() => setTemplate(null)}>
              Start empty instead
            </button>
          )}
          {apps.isSuccess && usable.size === 0 && (
            <>
              {" "}
              <Link href={INTEGRATIONS_APPS_PATH} className="font-medium text-accent hover:text-accent-dark">
                Connect an app
              </Link>{" "}
              to use app events.
            </>
          )}
        </p>
      </section>

      {empty && zone ? (
        <AutomationEditor key={template?.id ?? "empty"} target={{ kind: "new" }} start={template?.start ?? empty} accountZone={zone} revealProblems={Boolean(template)} />
      ) : (
        <span aria-hidden className="h-[320px] animate-pulse rounded-xl bg-surface-2" />
      )}

      <section aria-labelledby="ask-tex-instead" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 id="ask-tex-instead" className="text-[14.5px] font-semibold">
              Rather say it in words?
            </h3>
            <p className="text-[13px] text-muted">Tell Tex what to do and when. Tex shows it back as a draft to check and save.</p>
          </div>
          <ButtonLink href="/">Ask Tex in chat</ButtonLink>
        </div>
        <ul aria-label="Requests to start from" className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2">
          {AUTOMATION_KINDS.map((guide) => (
            <li key={guide.kind}>
              <Link
                href={chatDraftHref(guide.example)}
                className="flex h-full gap-3 rounded-xl bg-surface-2 p-3 transition-colors hover:bg-line"
                aria-label={`Try it in chat: ${guide.example}`}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", KIND_TINT[guide.kind])}>
                  <KindIcon kind={guide.kind} size={16} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{guide.name}</span>
                  <span className="text-[12.5px] text-fg-2">
                    “{guide.example}” <span className="font-medium whitespace-nowrap text-accent">Try it →</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageBody>
  );
}
