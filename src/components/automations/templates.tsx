"use client";

import Link from "next/link";
import { isConnectable } from "@/components/apps/apps-logic";
import { useApps } from "@/lib/api/hooks";
import { appChoices, EDITOR_TEMPLATES, emptyEditor, kindOf, type EditorTemplate } from "@/lib/automation-editor";
import { AUTOMATION_TEMPLATES, templateHref, templatesToOffer, type AutomationTemplate } from "@/lib/automations";
import { AUTOMATION_KIND_LABEL, cn, titleCase } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { PRICING_PATH } from "@/lib/pricing";
import { CheckIcon } from "../icons";
import { SectionLabel } from "../ui";
import { KindBadge } from "./kind-icon";
import type { PlanAutomations } from "./plan-meter";

/** One ready-made request. The whole card opens it; an app that still needs connecting gets its own link. */
function TemplateCard({ template, needsApp }: { template: AutomationTemplate; needsApp: boolean }) {
  const app = template.app ? titleCase(template.app) : null;
  return (
    <li className="relative flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5 transition-colors focus-within:border-fg/40 hover:border-fg/40">
      <div className="flex items-center gap-2.5">
        <KindBadge kind={template.kind} app={template.app} size={30} />
        <h3 className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold">{template.title}</h3>
      </div>
      <p className="text-[13px] text-fg-2">“{template.ask}”</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2">
        {/* The link is stretched over the card, so a click anywhere on it follows the link. */}
        <Link
          href={templateHref(template)}
          aria-label={`${template.href ? "Set up" : "Ask Tex"}: ${template.ask}`}
          className="text-[12.5px] font-medium text-accent after:absolute after:inset-0 after:rounded-2xl hover:text-accent-dark"
        >
          {template.href ? "Set it up →" : "Use this →"}
        </Link>
        {needsApp && app ? (
          <Link href={INTEGRATIONS_APPS_PATH} className="relative z-10 text-[12px] text-nav underline underline-offset-2 hover:text-fg">
            Connect {app} first
          </Link>
        ) : (
          <span className="text-[12px] text-muted">{AUTOMATION_KIND_LABEL[template.kind]}</span>
        )}
      </div>
    </li>
  );
}

/**
 * Requests people often want, ready to send: a click opens the chat with the request typed in
 * (pull-request review opens its own tab instead). `full` is set when the plan has no room for
 * another automation, so that is said before anyone tries.
 */
export function AutomationTemplates({ full, first = false }: { full: PlanAutomations | null; first?: boolean }) {
  const apps = useApps();
  // Apps that are connected, or that can be: a template for any other app would lead nowhere.
  const usable = apps.data ? new Set(apps.data.filter((app) => app.connections.length > 0 || isConnectable(app)).map((app) => app.slug)) : undefined;
  const working = new Set((apps.data ?? []).filter((app) => app.connections.some((c) => c.status === "active")).map((app) => app.slug));
  const templates = templatesToOffer(AUTOMATION_TEMPLATES, usable);

  return (
    <section aria-labelledby="automation-templates" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SectionLabel className="text-[15px]">
          <span id="automation-templates">{first ? "Or ask Tex with one of these" : "Add another from a template"}</span>
        </SectionLabel>
        <p className="text-[12.5px] text-muted">Pick one and the chat opens with the request typed in. Change the words to fit, then send.</p>
      </div>

      {full && (
        <p role="status" className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-nav">
          Your {full.planName} plan’s {full.limit} {full.limit === 1 ? "automation is" : "automations are all"} in use. Delete one
          {full.canUpgrade ? " or upgrade" : ""} before you add another.
          {full.canUpgrade && (
            <>
              {" "}
              <Link href={PRICING_PATH} className="font-medium text-accent hover:text-accent-dark">
                See plans
              </Link>
            </>
          )}
        </p>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-2.5">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} needsApp={Boolean(template.app) && apps.isSuccess && !working.has(template.app as string)} />
        ))}
      </ul>
    </section>
  );
}

/** Where an editor template opens: the new-automation canvas, filled from it. */
export function editorTemplateHref(template: Pick<EditorTemplate, "id">): string {
  return `/automations/new?template=${encodeURIComponent(template.id)}`;
}

/**
 * The templates that fill the canvas of a new automation (a daily briefing at 8, pull
 * requests on Monday at 9, an email from someone, a check every 4 hours, urgent mail in steps). On the new-automation
 * page a click fills the canvas (`onPick`, the chosen one ticked); elsewhere each card opens that
 * page with the template filled in. One whose app isn't connected says so.
 */
export function EditorTemplateCards({ selected, onPick, className }: { selected?: string | null; onPick?: (template: EditorTemplate) => void; className?: string }) {
  const apps = useApps();
  const usable = new Set(appChoices(apps.data).usable.map((app) => app.slug));
  return (
    <ul className={cn("grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5", className)}>
      {EDITOR_TEMPLATES.map((item) => {
        const on = selected === item.id;
        const needs = item.app && apps.isSuccess && !usable.has(item.app) ? titleCase(item.app) : null;
        const kind = kindOf(item.fill(emptyEditor("UTC"))) ?? "repeat";
        const body = (
          <>
            <span className="flex items-center gap-2.5">
              <KindBadge kind={kind} app={item.app} size={30} />
              <span className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold">{item.name}</span>
              {on && (
                <span aria-hidden className="grid size-5 place-items-center rounded-full bg-accent text-white">
                  <CheckIcon size={12} />
                </span>
              )}
            </span>
            <span className="text-[12.5px] text-fg-2">{item.blurb}</span>
            <span className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2 text-[12px]">
              <span className="font-medium text-accent">{onPick ? (on ? "Filled in below" : "Fill the boxes →") : "Build from this →"}</span>
              {needs ? <span className="text-muted">Needs {needs} connected</span> : <span className="text-muted">{AUTOMATION_KIND_LABEL[kind]}</span>}
            </span>
          </>
        );
        const look = cn(
          "flex h-full w-full flex-col gap-2 rounded-2xl border bg-surface p-3.5 text-left transition-colors",
          on ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-line hover:border-fg/40",
        );
        return (
          <li key={item.id}>
            {onPick ? (
              <button type="button" aria-pressed={on} onClick={() => onPick(item)} className={look}>
                {body}
              </button>
            ) : (
              <Link href={editorTemplateHref(item)} className={look} aria-label={`Build from the template “${item.name}”: ${item.blurb}`}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
