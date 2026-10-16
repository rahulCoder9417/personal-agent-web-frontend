"use client";

import Link from "next/link";
import { isConnectable } from "@/components/apps/apps-logic";
import { useApps } from "@/lib/api/hooks";
import { AUTOMATION_TEMPLATES, templateHref, templatesToOffer, type AutomationTemplate } from "@/lib/automations";
import { AUTOMATION_KIND_LABEL, titleCase } from "@/lib/format";
import { BrandIcon } from "../brand-icon";
import { IconTile, SectionLabel } from "../ui";
import { KindIcon } from "./kind-icon";
import type { PlanAutomations } from "./plan-meter";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { PRICING_PATH } from "@/lib/pricing";

/** One ready-made request. The whole card opens it; an app that still needs connecting gets its own link. */
function TemplateCard({ template, needsApp }: { template: AutomationTemplate; needsApp: boolean }) {
  const app = template.app ? titleCase(template.app) : null;
  return (
    <li className="relative flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 transition-colors focus-within:border-fg/40 hover:border-fg/40">
      <div className="flex items-center gap-2.5">
        <IconTile size={30}>
          {template.app ? <BrandIcon name={template.app} size={15} /> : <KindIcon kind={template.kind} size={15} className="text-nav" />}
        </IconTile>
        <h3 className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold">{template.title}</h3>
      </div>
      <p className="text-[13px] text-fg-2">“{template.ask}”</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
        {/* The link is stretched over the card, so a click anywhere on it follows the link. */}
        <Link
          href={templateHref(template)}
          aria-label={`${template.href ? "Set up" : "Ask Tex"}: ${template.ask}`}
          className="text-[12.5px] font-medium text-accent after:absolute after:inset-0 after:rounded-xl hover:text-accent-dark"
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
        <SectionLabel>
          <span id="automation-templates">{first ? "Start with one of these" : "Add another from a template"}</span>
        </SectionLabel>
        <p className="text-[12.5px] text-muted">Pick one and the chat opens with the request typed in. Change the words to fit, then send.</p>
      </div>

      {full && (
        <p role="status" className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[13px] text-nav">
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
          <TemplateCard
            key={template.id}
            template={template}
            needsApp={Boolean(template.app) && apps.isSuccess && !working.has(template.app as string)}
          />
        ))}
      </ul>
    </section>
  );
}
