"use client";

// How an automation stands, drawn the same way on its card and on its own page: a pill (On, Paused,
// Paused after failures, Out of credits, Done), and a notice with the way out when it needs the
// person (it was paused by the system, or an app it is connected to stopped working: Reconnect).

import { useMemo, type ReactNode } from "react";
import type { Automation } from "@/lib/api/client";
import { useApps } from "@/lib/api/hooks";
import { automationApps, brokenApps, brokenAppsLine, type AppHealth, type AppLink } from "@/lib/automation-apps";
import { cn, titleCase } from "@/lib/format";
import { connectedReturnPath, INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { PRICING_PATH } from "@/lib/pricing";
import { isConnectable } from "../apps/apps-logic";
import { useConnectDialog } from "../apps/connect-dialog";
import { BrandIcon } from "../brand-icon";
import { PauseIcon, RefreshIcon, WarningIcon } from "../icons";
import { Button, ButtonLink } from "../ui";

export type AutomationState = { label: string; tone: "on" | "paused" | "danger" | "done" };

/** A one-time reminder that has run: it is finished, and can't be changed or run again. */
export function isFinished(automation: Pick<Automation, "kind" | "lastRunAt" | "nextRunAt">): boolean {
  return automation.kind === "once" && Boolean(automation.lastRunAt) && !automation.nextRunAt;
}

/** On, paused (by the person, after failures, out of credits), or done (a reminder that ran). */
export function automationState(automation: Pick<Automation, "enabled" | "pausedReason" | "kind" | "lastRunAt" | "nextRunAt">): AutomationState {
  if (isFinished(automation)) return { label: "Done", tone: "done" };
  if (automation.enabled) return { label: "On", tone: "on" };
  if (automation.pausedReason === "out_of_credits") return { label: "Paused: out of credits", tone: "danger" };
  if (automation.pausedReason === "failures") return { label: "Paused after failures", tone: "danger" };
  return { label: "Paused", tone: "paused" };
}

const PILL: Record<AutomationState["tone"], string> = {
  on: "bg-success-soft text-success",
  paused: "bg-surface-2 text-nav ring-1 ring-line ring-inset",
  danger: "bg-danger-soft text-danger",
  done: "bg-surface-2 text-muted",
};

/** The state as a pill, with a dot for On and two bars for Paused. */
export function StatusPill({ state, className }: { state: AutomationState; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap", PILL[state.tone], className)}>
      {state.tone === "on" ? (
        <span aria-hidden className="size-1.5 rounded-full bg-online" />
      ) : state.tone === "danger" ? (
        <WarningIcon size={12} />
      ) : state.tone === "paused" ? (
        <PauseIcon size={11} />
      ) : null}
      {state.label}
    </span>
  );
}

/** The apps an automation is connected to, how each stands, and the ones that need the person. */
export function useAutomationApps(automation: Pick<Automation, "trigger" | "apps" | "preset" | "steps">) {
  const apps = useApps();
  return useMemo(() => {
    const links = automationApps(automation, apps.data);
    const health = new Map<string, AppHealth>(links.map((link) => [link.slug, link.health]));
    return { links, health, broken: brokenApps(links) };
  }, [automation, apps.data]);
}

/** A notice in the card or on the page: an icon, what is wrong in a sentence, and the ways out. */
export function Notice({ tone = "danger", icon, children, actions, className }: { tone?: "danger" | "quiet"; icon?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug",
        tone === "danger" ? "bg-danger-soft text-fg" : "bg-surface-2 text-fg-2",
        className,
      )}
    >
      <span aria-hidden className={cn("mt-px shrink-0", tone === "danger" ? "text-danger" : "text-muted")}>
        {icon ?? <WarningIcon size={15} />}
      </span>
      <p className="min-w-0 flex-1 basis-[180px]">{children}</p>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** Why the system paused it, with the way out. Nothing for one the person paused, or one that is on. */
export function PausedNotice({ automation, className }: { automation: Automation; className?: string }) {
  if (automation.enabled) return null;
  if (automation.pausedReason === "failures") {
    const app = automation.preset === "pr_review" ? "github" : automation.trigger?.app;
    return (
      <Notice
        className={className}
        actions={
          <ButtonLink href={INTEGRATIONS_APPS_PATH} size="sm">
            {app ? `Check ${titleCase(app)}` : "Check your apps"}
          </ButtonLink>
        }
      >
        <span className="font-medium">It failed a few times in a row, so it was paused.</span> Fix the cause, then turn it back on with the switch.
      </Notice>
    );
  }
  if (automation.pausedReason === "out_of_credits") {
    return (
      <Notice
        className={className}
        actions={
          <ButtonLink href="/settings/credits" size="sm">
            Add credits
          </ButtonLink>
        }
      >
        <span className="font-medium">You ran out of credits, so it was paused.</span> It comes back on by itself when credits are added.
      </Notice>
    );
  }
  return null;
}

function AppButton({ link, onOpen }: { link: AppLink; onOpen: (link: AppLink) => void }) {
  if (link.health === "plan")
    return (
      <ButtonLink href={PRICING_PATH} size="sm" aria-label={`${link.name} isn’t on your plan: see plans`}>
        See plans
      </ButtonLink>
    );
  if (!link.app || !isConnectable(link.app))
    return (
      <ButtonLink href={INTEGRATIONS_APPS_PATH} size="sm">
        <BrandIcon name={link.slug} size={13} />
        {link.name}
      </ButtonLink>
    );
  return (
    <Button size="sm" variant="primary" onClick={() => onOpen(link)} aria-label={`${link.health === "reconnect" ? "Reconnect" : "Connect"} ${link.name}`}>
      {link.health === "reconnect" ? <RefreshIcon size={13} /> : <BrandIcon name={link.slug} size={13} />}
      {link.health === "reconnect" ? `Reconnect ${link.name}` : `Connect ${link.name}`}
    </Button>
  );
}

/**
 * An app the automation is connected to stopped working (its sign-in expired), was disconnected,
 * or left the plan: say so, and offer Reconnect (the same connect screen as Integrations → Apps).
 */
export function AppsNotice({ broken, className }: { broken: readonly AppLink[]; className?: string }) {
  const flow = useConnectDialog({ returnPath: (app) => connectedReturnPath(app.slug) });
  const line = brokenAppsLine(broken);
  if (!line) return null;
  return (
    <>
      <Notice
        className={className}
        actions={broken.slice(0, 2).map((link) => (
          <AppButton key={link.slug} link={link} onOpen={(target) => target.app && flow.open(target.app, target.health === "reconnect" ? "reconnect" : "connect")} />
        ))}
      >
        {line}
      </Notice>
      {flow.dialog}
    </>
  );
}
