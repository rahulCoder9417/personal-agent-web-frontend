import Link from "next/link";
import type { ReactNode } from "react";
import { AgentFigure } from "@/components/tex";
import { Card, Meta, Pill, SectionLabel } from "@/components/ui";
import type { AiChoiceState } from "./agent-summary";

/** "Recommended" and "Beta" sit next to a choice's name wherever the three are listed. */
export const CHOICE_TAG = {
  own_key: <Pill tone="waiting">Recommended</Pill>,
  claude_plan: <Pill>Beta</Pill>,
  textcrew: null,
} as const;

/** Says where a choice stands, when that is worth a pill: it is what runs now, or it can't be used. */
export function ChoiceStatePill({ state }: { state: AiChoiceState }) {
  if (state === "in_use") return <Pill tone="done">In use</Pill>;
  if (state === "unavailable") return <Pill>Not available</Pill>;
  return null;
}

/** The heading over one of the three ways to get AI: its name, its tag, where it stands and a line about it. */
export function ChoiceHeading({ title, tag, state, children }: { title: string; tag?: ReactNode; state: AiChoiceState; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel>{title}</SectionLabel>
        {tag}
        <ChoiceStatePill state={state} />
      </div>
      <p className="text-[12.5px] text-muted">{children}</p>
    </div>
  );
}

export function AiChoicesIntro() {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Three ways to give Tex its AI</h2>
      <p className="text-[13px] text-muted">
        Bring your own and your provider or plan pays for the AI. Bring nothing and Tex uses Textcrew AI, paid in credits.
      </p>
    </div>
  );
}

const TEXTCREW_AI: Record<Extract<AiChoiceState, "in_use" | "standby" | "unavailable">, { title: string; meta: string; body: string }> = {
  in_use: {
    title: "Tex is running on Textcrew AI",
    meta: "nothing to set up",
    body: "The AI Tex uses is taken from your credits, on top of running time and app actions. Add your own key or Claude plan and the AI part is no longer charged.",
  },
  standby: {
    title: "Not in use",
    meta: "your own AI is doing the work",
    body: "Tex is on your own AI, so the AI isn’t charged in credits. Textcrew AI is what Tex uses when no key or plan is connected.",
  },
  unavailable: {
    title: "Not available on this account",
    meta: "your own AI is required",
    body: "Textcrew AI can’t be used right now, so Tex needs your own API key or your Claude plan to work.",
  },
};

/** The third way: our AI, paid in credits. There is nothing to set up, so this only says where it stands. */
export function TextcrewAiSection({ state }: { state: AiChoiceState }) {
  const text = TEXTCREW_AI[state === "in_use" || state === "unavailable" ? state : "standby"];
  return (
    <section className="flex flex-col gap-3">
      <ChoiceHeading title="Textcrew AI" state={state}>
        Nothing to set up, paid in credits. It’s what Tex uses when you haven’t connected your own AI.
      </ChoiceHeading>
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-accent-soft">
            <AgentFigure who="tex" mood={state === "unavailable" ? "paused" : "ready"} glyph size={28} label="" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14.5px] font-semibold">{text.title}</span>
            <Meta>{text.meta}</Meta>
          </div>
        </div>
        <p className="text-[13px] text-muted">{text.body}</p>
        {state === "in_use" && (
          <Link href="/settings/credits" className="self-start text-[13px] font-medium text-accent hover:text-accent-dark">
            See what your credits were spent on
          </Link>
        )}
      </Card>
    </section>
  );
}
