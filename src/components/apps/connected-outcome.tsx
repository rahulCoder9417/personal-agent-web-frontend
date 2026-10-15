"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/brand-icon";
import { AgentFigure, type Mood } from "@/components/tex";
import { ButtonLink } from "@/components/ui";
import { useApps } from "@/lib/api/hooks";
import { titleCase } from "@/lib/format";
import { connectOutcome } from "./apps-logic";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";

function Outcome({ mood, label, badge, title, children }: { mood: Mood; label: string; badge?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <div className="relative">
        <AgentFigure who="tex" mood={mood} size={160} label={label} />
        {badge && <span className="absolute right-1 bottom-2 rounded-[14px] bg-surface p-1 shadow-[var(--shadow-raised)]">{badge}</span>}
      </div>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
      {children}
    </div>
  );
}

/**
 * What /connected says. After an app's sign-in (onboarding opens it in a new tab) the address
 * names the app (`app`) and Composio adds `status`: connected, or didn't connect. Anything else
 * that lands here (a checkout in the demo) gets the plain "All set".
 */
export function ConnectedOutcome() {
  const outcome = connectOutcome(useSearchParams());
  // The name to show, and a fresh list for this tab; the tab that opened this one looks again
  // when it gets focus back.
  const apps = useApps();

  if (!outcome) {
    return (
      <Outcome mood="done" label="Tex, pleased" title="All set">
        <p className="text-[15px] text-muted">That’s done. You can close this tab and go back to Textcrew.</p>
      </Outcome>
    );
  }

  const app = apps.data?.find((item) => item.slug === outcome.slug);
  const name = app?.name ?? titleCase(outcome.slug);
  const badge = <AppIcon name={outcome.slug} iconUrl={app?.iconUrl} size={40} />;

  if (outcome.ok) {
    return (
      <Outcome mood="done" label="Tex, pleased" badge={badge} title={`${name} is connected`}>
        <p className="text-[15px] text-muted">Tex can use it from now on. You can close this tab and go back to Textcrew.</p>
      </Outcome>
    );
  }
  return (
    <Outcome mood="asking" label="Tex, puzzled" badge={badge} title={`${name} didn’t connect`}>
      <p className="text-[15px] text-muted">
        The sign-in was stopped or didn’t go through, so nothing was changed. Close this tab and press Connect again in Textcrew to try once more.
      </p>
      <ButtonLink href={INTEGRATIONS_APPS_PATH} variant="secondary" className="mt-1">
        Open Integrations
      </ButtonLink>
    </Outcome>
  );
}
