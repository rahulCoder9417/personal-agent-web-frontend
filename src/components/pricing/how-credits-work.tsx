import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CREDITS_HELP_PATH } from "@/lib/pricing";

// The rules of credits in a few lines each, taken from what the backend does (backend-report.md,
// Part C) and said the same way as Help's "Credits and plans" (help-content.ts), which has the rest.

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[13.5px] font-semibold">{title}</dt>
      <dd className="text-[13px] text-fg-2">{children}</dd>
    </div>
  );
}

/**
 * Pricing → How credits work: what uses them, how long they last, zero, refunds, and the way to
 * Help. `autoTopUp`: the server allows auto top-up, so "nothing is charged at zero" holds only
 * while it is off.
 */
export function HowCreditsWork({ autoTopUp = false }: { autoTopUp?: boolean }) {
  return (
    <Card className="flex flex-col gap-5 bg-chrome p-5">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-x-8 gap-y-5">
        <Rule title="What uses credits">
          <ul className="flex flex-col gap-1.5">
            {CREDIT_COSTS.map((cost) => (
              <li key={cost.id} className="flex gap-2">
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
                <span>
                  <strong className="font-semibold text-fg">{cost.name}</strong>
                  {cost.id === "ai" ? ", " : ": "}
                  {cost.detail}
                </span>
              </li>
            ))}
          </ul>
        </Rule>
        <div className="flex flex-col gap-5">
          <Rule title="They last 90 days">
            From the day you get them, whether from your plan, a top-up or a code (a code may set its own length). The 100 sign-up credits last 14 days. The
            ones that expire soonest are used first, and monthly credits you don’t use carry over until their 90 days are up.
          </Rule>
          <Rule title="At zero, Tex pauses">
            {autoTopUp
              ? "Tex tells you in chat and your automations pause. They start again by themselves when credits are added. Your card is charged only if you switch on auto top-up."
              : "Tex tells you in chat and your automations pause. Nothing is charged to your card: they start again by themselves when credits are added."}
          </Rule>
          <Rule title="Failed tasks are refunded">
            If a task fails because of a problem on our side, Tex says so and the credits it used come back shortly after.
          </Rule>
        </div>
      </dl>
      <Link href={CREDITS_HELP_PATH} className="self-start text-[13px] font-medium text-accent hover:text-accent-dark">
        More about credits in Help
      </Link>
    </Card>
  );
}
