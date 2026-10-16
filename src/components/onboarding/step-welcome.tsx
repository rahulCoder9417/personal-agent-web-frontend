"use client";

import type { CrewMember } from "@/lib/api/client";
import { useCrew } from "@/lib/api/hooks";
import { crewWash } from "@/lib/crew";
import { cn } from "@/lib/format";
import type { StepId } from "@/lib/onboarding";
import { ApprovalsIcon, AppsIcon, ChatIcon } from "../icons";
import { AgentFigure } from "../tex";
import { Button, Pill } from "../ui";

/** Who is on the crew, in the backend's words, until the backend has said (and if it can't). */
const CREW_FALLBACK: Pick<CrewMember, "id" | "name" | "role" | "description" | "available" | "kind">[] = [
  { id: "tex", name: "Tex", kind: "lead", role: "Lead", available: true, description: "The one you text. Plans the job, hands parts to the crew and answers you." },
  { id: "byte", name: "Byte", kind: "specialist", role: "Coding", available: true, description: "Writes and changes code, and opens pull requests." },
  { id: "patch", name: "Patch", kind: "specialist", role: "Code review", available: true, description: "Reviews code: bugs, security and tests." },
  { id: "scout", name: "Scout", kind: "specialist", role: "Research", available: true, description: "Searches the web and reads pages." },
];

/** Three things Textcrew does, one line each. */
const HOW = [
  { icon: <ChatIcon size={17} />, title: "You text, in plain words", body: "Here in the web app, or from Telegram on your phone." },
  { icon: <AppsIcon size={17} />, title: "Tex works in your apps", body: "Email, calendar, notes, code: the ones you connect." },
  { icon: <ApprovalsIcon size={17} />, title: "Nothing risky without you", body: "Tex asks before it sends, deletes or spends anything." },
];

/** What comes next in the flow, so the person knows how long it is. */
const AHEAD: Partial<Record<StepId, string>> = { ai: "Connect your AI", chat: "Link Telegram", apps: "Connect an app" };

/**
 * The first step: what Textcrew is, in one screen. The crew, three lines on how it works, and what
 * the next few steps are. The crew comes from the backend (who works here yet); the words around it
 * are the app's.
 */
export function StepWelcome({ steps, chatLabel, aiNeeded, onDone }: { steps: readonly StepId[]; chatLabel: string; aiNeeded: boolean; onDone: () => void }) {
  const crew = useCrew();
  const members = crew.data ?? CREW_FALLBACK;
  const lead = members.find((member) => member.kind === "lead") ?? CREW_FALLBACK[0];
  const specialists = members.filter((member) => member.kind === "specialist");
  const ahead = steps.filter((step) => AHEAD[step]);

  return (
    <div className="grid grid-cols-1 items-start gap-8 min-[940px]:grid-cols-[minmax(0,1fr)_minmax(0,440px)] min-[940px]:gap-10">
      {/* The line-up: the lead in front, the specialists beside it. Asleep means not switched on here yet. */}
      <div aria-hidden className="flex items-end justify-center overflow-hidden rounded-3xl bg-accent-soft px-4 pt-6 min-[940px]:order-2 min-[940px]:min-h-[420px] min-[940px]:items-center min-[940px]:pt-4">
        <div className="flex w-full max-w-[420px] items-end justify-center">
          <AgentFigure who="tex" mood="ready" size={220} label="" className="relative z-10 -mr-[9%] -ml-[4%] h-auto w-[46%]" />
          {specialists.map((member) => (
            <AgentFigure
              key={member.id}
              who={member.id}
              mood={member.available ? "ready" : "asleep"}
              size={150}
              label=""
              className={cn("-mx-[5.5%] h-auto w-[32%]", !member.available && "opacity-60")}
            />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[28px] leading-[1.12] font-semibold tracking-[-0.025em] md:text-[32px]">
            An assistant you text.
            <br /> A crew behind it.
          </h1>
          <p className="max-w-[56ch] text-[15px] leading-relaxed text-fg-2">
            Ask {lead.name} for anything you’d hand to a person: move a meeting, chase an invoice, fix a bug. {lead.name} plans the job, hands each part to whoever is best at it, and comes back with one answer.
          </p>
        </div>

        <ul aria-label="Your crew" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[11px]" style={crewWash(member.id, 16)}>
                <AgentFigure who={member.id} mood={member.available ? "ready" : "asleep"} glyph size={30} label="" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
                  <span className="font-semibold">{member.name}</span>
                  <span className="text-muted">{member.role}</span>
                  {!member.available && <Pill className="h-[18px] px-1.5 text-[11px]">Coming soon</Pill>}
                </span>
                <span className="text-[12.5px] leading-snug text-muted">{member.description}</span>
              </span>
            </li>
          ))}
        </ul>

        <ul aria-label="How it works" className="flex flex-col gap-3">
          {HOW.map((line) => (
            <li key={line.title} className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-nav">{line.icon}</span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13.5px] font-semibold">{line.title}</span>
                <span className="text-[13px] text-muted">{line.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3.5 border-t border-line pt-5">
          <p className="text-[13px] text-muted">
            Next, {ahead.length} quick {ahead.length === 1 ? "step" : "steps"}, about two minutes:{" "}
            {ahead.map((step, index) => (
              <span key={step}>
                {index > 0 && " · "}
                <span className="font-medium text-fg-2">{step === "chat" ? `Link ${chatLabel}` : AHEAD[step]}</span>
                {step === "ai" && aiNeeded && <span className="text-accent-dark"> (needed)</span>}
              </span>
            ))}
            . Each one can be skipped.
          </p>
        </div>

        {/* On a phone the button stays in reach at the foot of the screen while the rest is read. */}
        <div className="-mt-2.5 max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:-mb-7 max-sm:border-t max-sm:border-line max-sm:bg-bg max-sm:px-4 max-sm:py-3">
          <Button variant="primary" size="lg" className="max-sm:w-full" onClick={onDone}>
            Let’s set you up
          </Button>
        </div>
      </div>
    </div>
  );
}
