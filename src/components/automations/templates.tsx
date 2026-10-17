"use client";

// "Start from a template": ready-made automations that open on the canvas filled in (pull-request
// review opens its own canvas, to pick the repo). Each card shows the logos of what it uses, in
// order, and says when an app it needs isn't connected yet.

import Link from "next/link";
import { useApps } from "@/lib/api/hooks";
import { PR_REVIEW_NEW_PATH } from "@/lib/automation-address";
import { appChoices, EDITOR_TEMPLATES, emptyEditor, previewSource } from "@/lib/automation-editor";
import { rowApps } from "@/lib/automation-list";
import { cn, titleCase } from "@/lib/format";
import { PRICING_PATH } from "@/lib/pricing";
import { ChevronRightIcon } from "../icons";
import { Chip, LogoStack, T2, T3, type PlanAutomations } from "./parts";

export type TemplateCard = {
  id: string;
  title: string;
  blurb: string;
  /** What it uses, in order, for its logos. */
  marks: string[];
  href: string;
  /** The app it needs connected. */
  app?: string;
};

export const PR_REVIEW_TEMPLATE: TemplateCard = {
  id: "pr-review",
  title: "Review pull requests",
  blurb: "Patch reviews each new pull request on a repo and comments on it. It never merges.",
  marks: ["github", "patch"],
  href: PR_REVIEW_NEW_PATH,
  app: "github",
};

/** Where a canvas template opens: the new automation's canvas, filled in from it. */
export function editorTemplateHref(id: string): string {
  return `/automations/new?template=${encodeURIComponent(id)}`;
}

/** Every template, pull-request review first, then the canvas's own. */
export function allTemplates(): TemplateCard[] {
  return [
    PR_REVIEW_TEMPLATE,
    ...EDITOR_TEMPLATES.map((template) => ({
      id: template.id,
      title: template.name,
      blurb: template.blurb,
      marks: rowApps(previewSource(template.fill(emptyEditor("UTC")))),
      href: editorTemplateHref(template.id),
      ...(template.app ? { app: template.app } : {}),
    })),
  ];
}

/** The four on the Automations list. */
export const LIST_TEMPLATES = ["pr-review", "morning-email", "meeting-prep", "weekly-reminder"] as const;

/**
 * How the cards sit, by the width the list has (a container query, so the sidebar counts). The
 * four on the Automations list: one row of four from 1140px (each card about 270px or more), two
 * by two from 600px, one under another below that, so never three and one left over. Every
 * template, on New automation: as many columns as fit, none narrower than 280px.
 */
export const TEMPLATE_GRID = {
  pick: "grid-cols-1 @min-[600px]:grid-cols-2 @min-[1140px]:grid-cols-4",
  all: "grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]",
} as const;

/** One template card, the same on both pages. */
export const TEMPLATE_CARD =
  "relative flex min-w-0 flex-col gap-4 rounded-2xl bg-surface p-6 shadow-[0_0_0_1px_var(--line)] transition-shadow hover:shadow-[0_0_0_1px_var(--line-strong),0_8px_24px_-12px_rgb(21_21_21/0.18)]";

/**
 * The template cards, each opening its canvas. `ids` picks some, in that order (the four on the
 * Automations list); without it, every template.
 */
export function TemplateCards({ ids }: { ids?: readonly string[] }) {
  const apps = useApps();
  const usable = new Set(appChoices(apps.data).usable.map((app) => app.slug));
  const all = allTemplates();
  const cards = ids ? ids.map((id) => all.find((card) => card.id === id)).filter((card): card is TemplateCard => Boolean(card)) : all;
  return (
    <div className="@container">
      <ul className={cn("grid gap-4", ids ? TEMPLATE_GRID.pick : TEMPLATE_GRID.all)}>
        {cards.map((card) => {
          const needs = card.app && apps.isSuccess && !usable.has(card.app) ? titleCase(card.app) : null;
          return (
            <li key={card.id} className={TEMPLATE_CARD}>
              {/* The logos, and what to connect first: it goes under the logos when the card is too narrow for both. */}
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <LogoStack marks={card.marks} size={32} />
                {needs && (
                  <Chip tone="warn" wrap>
                    Connect {needs}
                  </Chip>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className={cn(T2, "font-semibold break-words")}>{card.title}</span>
                <span className={cn(T2, "break-words text-fg-2")}>{card.blurb}</span>
              </span>
              {/* The link is stretched over the card, so a click anywhere on it opens the template. */}
              <Link
                href={card.href}
                aria-label={`Use the template “${card.title}”`}
                className={cn(T2, "mt-auto inline-flex w-fit items-center gap-1 font-medium text-fg transition-colors after:absolute after:inset-0 after:rounded-2xl hover:text-accent-dark")}
              >
                Use template
                <ChevronRightIcon size={14} strokeWidth={2.4} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The plan has no room for another: said before anyone tries. */
export function PlanFullNote({ full }: { full: PlanAutomations }) {
  return (
    <p role="status" className={`${T3} rounded-xl bg-surface-2 px-4 py-3 text-fg-2`}>
      Your {full.planName} plan’s {full.limit} {full.limit === 1 ? "automation is" : "automations are all"} in use. Delete one
      {full.canUpgrade ? " or upgrade" : ""} before you add another.
      {full.canUpgrade && (
        <>
          {" "}
          <Link href={PRICING_PATH} className="font-medium text-accent-dark hover:text-fg">
            See plans
          </Link>
        </>
      )}
    </p>
  );
}
