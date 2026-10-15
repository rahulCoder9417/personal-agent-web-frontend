"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BrowserTimezone } from "@/components/browser-timezone";
import { Brand } from "@/components/shell/brand";
import { CheckIcon } from "@/components/icons";
import { toastError } from "@/components/toast";
import { Pill } from "@/components/ui";
import { useAgentSettings, useApps, useChannelList, useMe, useUpdateOnboarding } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import {
  aiConnected,
  appOffer,
  chatAppName,
  chatOffer,
  nextStep,
  offeredStep,
  readFlowParams,
  stepLabel,
  type StepId,
  welcomeLeft,
  welcomeSteps,
} from "@/lib/onboarding";
import { StepApps } from "./step-apps";
import { StepHi } from "./step-hi";
import { StepKey } from "./step-key";
import { StepLink } from "./step-link";
import { StepWelcome } from "./step-welcome";

function StepIndicator({
  steps,
  current,
  done,
  label,
  onPick,
}: {
  steps: readonly StepId[];
  current: StepId;
  done: (step: StepId) => boolean;
  label: (step: StepId) => string;
  onPick: (step: StepId) => void;
}) {
  return (
    <ol aria-label="Setup steps" className="flex items-center gap-2.5 max-sm:gap-0.5">
      {steps.map((step, index) => {
        const on = step === current;
        const ticked = !on && done(step);
        return (
          <li key={step} className="flex items-center gap-2.5">
            {/* A phone has room for the numbers, not for the lines between them. */}
            {index > 0 && <span aria-hidden className="h-px w-4 bg-line-strong max-sm:hidden" />}
            <button
              type="button"
              aria-current={on ? "step" : undefined}
              aria-label={`${label(step)}${ticked ? ", done" : ""}`}
              onClick={() => onPick(step)}
              className={cn("flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-[13px] transition-colors max-sm:pr-1", on ? "font-semibold text-fg" : "text-muted hover:text-fg")}
            >
              <span
                className={cn(
                  "grid size-[22px] place-items-center rounded-full text-[12px] font-semibold",
                  on ? "bg-fg text-white" : ticked ? "bg-success-soft text-success" : "bg-surface-2 text-muted",
                )}
              >
                {ticked ? <CheckIcon size={12} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className="whitespace-nowrap max-[1180px]:hidden">{label(step)}</span>
              {/* Narrow windows keep only the current step's name. */}
              {on && <span className="hidden whitespace-nowrap max-[1180px]:inline max-sm:!hidden">{label(step)}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The welcome flow, shown after the first sign-in (and whenever the account says it hasn't been
 * finished or skipped): meet the crew, connect the AI, link a chat app, connect an app, say hi.
 * Each step can be skipped, and the whole flow too. Whether a step is done comes from the API.
 *
 * Finishing or skipping it is saved on the account (`onboardingCompleted`), shown at once; a failed
 * save is a toast and never keeps the person here. Opened for one step (`?step=ai`, from the
 * "Getting started" checklist or Settings), its button leads back to where they came from instead
 * of on, and leaving doesn't count as finishing the flow.
 */
export function OnboardingFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const [flow] = useState(() => readFlowParams(params));
  const me = useMe();
  const channels = useChannelList();
  const apps = useApps();
  const settings = useAgentSettings();
  const update = useUpdateOnboarding();

  const steps = welcomeSteps({ channels: channels.data, apps: apps.data });
  const [picked, setPicked] = useState<StepId>(flow.step);
  const step = offeredStep(steps, picked);
  const index = steps.indexOf(step);
  const linkable = channels.data ? chatOffer(channels.data).linkable : [];
  const label = (id: StepId) => stepLabel(id, linkable);

  const done = (id: StepId): boolean => {
    if (id === "welcome") return steps.indexOf(id) < index;
    if (id === "ai") return settings.data !== undefined && aiConnected(settings.data);
    if (id === "chat") return channels.data !== undefined && chatOffer(channels.data).linked.length > 0;
    if (id === "apps") return apps.data !== undefined && appOffer(apps.data).connected.length > 0;
    return false;
  };

  /** Leaves the flow. From the whole flow (not one step) that finishes it, saved on the account. */
  const leave = (path: string) => {
    if (!flow.focused) {
      welcomeLeft.mark();
      if (me.data?.onboardingCompletedAt === null) {
        update.mutate({ onboardingCompleted: true }, { onError: (error) => toastError("Couldn’t save that you’ve seen the welcome", error) });
      }
    }
    router.push(path);
  };

  const next = () => {
    if (flow.focused) return router.push(flow.returnTo);
    const after = nextStep(steps, step);
    if (after) {
      setPicked(after);
      document.querySelector(".scroll-pane")?.scrollTo({ top: 0 });
    } else leave("/");
  };
  const continueLabel = flow.focused ? "Done" : "Continue";
  const optional = step === "chat" || step === "apps";
  const needed = step === "ai" && settings.data !== undefined && !aiConnected(settings.data);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Before the first Telegram message: "every Monday at 9" must mean 9 where they are. */}
      <BrowserTimezone />
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-line px-4 md:px-7">
        <Brand />
        <StepIndicator steps={steps} current={step} done={done} label={label} onPick={setPicked} />
        {flow.focused ? (
          <Link href={flow.returnTo} className="text-[13px] font-medium whitespace-nowrap text-accent hover:text-accent-dark">
            Back<span className="max-sm:hidden"> to the app</span>
          </Link>
        ) : (
          <button type="button" onClick={() => leave(flow.returnTo)} className="text-[13px] font-medium whitespace-nowrap text-accent hover:text-accent-dark">
            Skip<span className="max-sm:hidden"> for now</span>
          </button>
        )}
      </header>

      <div className="scroll-pane min-h-0 flex-1 overflow-y-auto">
        {/* Two columns for the crew and for linking a chat app (its preview beside it); one, in the middle, for the rest. */}
        <div className={cn("mx-auto flex flex-col gap-5 px-4 py-7 md:px-7 md:py-9", step === "welcome" || step === "chat" ? "max-w-[1120px]" : "max-w-[760px]")}>
          {step === "welcome" ? (
            <p className="text-[13px] font-semibold text-accent-dark">Welcome to Textcrew</p>
          ) : (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
              Step {index + 1} of {steps.length}
              {needed && <Pill tone="waiting">Needed</Pill>}
              {optional && <Pill>Optional</Pill>}
            </p>
          )}
          {step === "welcome" && (
            <StepWelcome
              steps={steps}
              chatLabel={chatAppName(linkable)}
              aiNeeded={settings.data !== undefined && !aiConnected(settings.data)}
              onDone={next}
            />
          )}
          {step === "ai" && <StepKey onDone={next} continueLabel={continueLabel} />}
          {step === "chat" && <StepLink preferred={flow.channel} onDone={next} continueLabel={continueLabel} />}
          {step === "apps" && <StepApps onDone={next} continueLabel={continueLabel} />}
          {step === "hi" && (
            <StepHi me={me.data} settings={settings.data} channels={channels.data} apps={apps.data} onStep={setPicked} onLeave={leave} />
          )}
        </div>
      </div>
    </div>
  );
}
