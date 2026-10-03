"use client";

import Link from "next/link";
import { Brand } from "@/components/shell/brand";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SectionLabel } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/format";
import { StepApps } from "./step-apps";
import { StepHi } from "./step-hi";
import { StepKey } from "./step-key";
import { StepLink } from "./step-link";

const STEPS = ["Link a chat app", "Connect your apps", "Add your AI key", "Say hi"] as const;

function StepIndicator({ current, onPick }: { current: number; onPick: (step: number) => void }) {
  return (
    <ol aria-label="Setup steps" className="flex items-center gap-2.5">
      {STEPS.map((label, index) => {
        const on = index === current;
        const done = index < current;
        return (
          <li key={label} className="flex items-center gap-2.5">
            {index > 0 && <span aria-hidden className="h-px w-5 bg-line-strong max-sm:w-2" />}
            <button
              type="button"
              aria-current={on ? "step" : undefined}
              onClick={() => onPick(index)}
              className={cn("flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-[13px] transition-colors", on ? "font-semibold text-fg" : "text-muted hover:text-fg")}
            >
              <span
                className={cn(
                  "grid size-[22px] place-items-center rounded-full text-[12px] font-semibold",
                  on ? "bg-fg text-white" : done ? "bg-success-soft text-success" : "bg-surface-2 text-muted",
                )}
              >
                {done ? <CheckIcon size={12} /> : index + 1}
              </span>
              <span className="whitespace-nowrap max-[1080px]:hidden">{label}</span>
              {/* Narrow windows keep only the current step's name. */}
              {on && <span className="hidden whitespace-nowrap max-[1080px]:inline max-sm:!hidden">{label}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** First-run setup: link a chat, connect apps, add an AI key, send the first message. Every step can be skipped. */
export function OnboardingFlow() {
  const params = useSearchParams();
  const channelParam = params.get("channel");
  const stepParam = Number(params.get("step"));
  const [step, setStep] = useState(() => (Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= STEPS.length ? stepParam - 1 : 0));
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-line px-4 md:px-7">
        <Brand />
        <StepIndicator current={step} onPick={setStep} />
        <Link href="/" className="text-[13px] font-medium whitespace-nowrap text-accent hover:text-accent-dark">
          Skip for now
        </Link>
      </header>

      <div className="scroll-pane min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-4 py-7 md:px-7 md:py-9">
          <SectionLabel as="p">
            Step {step + 1} of {STEPS.length}
          </SectionLabel>
          {step === 0 && <StepLink preferred={channelParam} onDone={next} />}
          {step === 1 && <StepApps onDone={next} />}
          {step === 2 && <StepKey onDone={next} />}
          {step === 3 && <StepHi />}
        </div>
      </div>
    </div>
  );
}
