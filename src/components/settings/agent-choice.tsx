"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AgentFigure } from "@/components/tex";
import { Button, Card, Meta, Pill, SectionLabel } from "@/components/ui";
import { ApiError, errorMessage, type AgentSettings } from "@/lib/api/client";
import { useUpdateAgentSettings } from "@/lib/api/hooks";
import { textcrewAiOffer, type AiChoiceState } from "./agent-summary";

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
        Bring your own and your provider or plan pays for the AI. Bring nothing, or choose Textcrew AI, and the AI is paid in credits.
      </p>
    </div>
  );
}

type TextcrewAiText = { title: string; meta: string; body: string };

const TEXTCREW_AI: Record<"in_use" | "chosen" | "ready" | "unavailable", TextcrewAiText> = {
  in_use: {
    title: "Tex is running on Textcrew AI",
    meta: "nothing to set up",
    body: "The AI Tex uses is taken from your credits, on top of running time and app actions. Add your own key or Claude plan and the AI part is no longer charged.",
  },
  chosen: {
    title: "Tex is running on Textcrew AI",
    meta: "you chose it over your own AI",
    body: "The AI Tex uses is taken from your credits, on top of running time and app actions. What you set up stays saved, so you can go back whenever you like.",
  },
  ready: {
    title: "Not in use",
    meta: "your own AI is doing the work",
    body: "Tex is on your own AI, so the AI isn’t charged in credits. Choose Textcrew AI and the AI is paid in credits instead. What you set up stays saved, so you can go back.",
  },
  unavailable: {
    title: "Not available on this account",
    meta: "your own AI is required",
    body: "Textcrew AI can’t be used right now, so Tex needs your own API key or your Claude plan to work.",
  },
};

/** Textcrew AI went off offer between loading the page and pressing the button. */
function switchError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "Textcrew AI isn’t available right now, so Tex stays on your own AI.";
  return errorMessage(error);
}

/**
 * The third way: our AI, paid in credits. There is nothing to set up. Someone with their own key or
 * Claude plan can choose it anyway, and go back.
 */
export function TextcrewAiSection({ settings, state }: { settings: AgentSettings; state: AiChoiceState }) {
  const update = useUpdateAgentSettings();
  const offer = textcrewAiOffer(settings);
  const text = TEXTCREW_AI[state === "unavailable" ? "unavailable" : state === "in_use" ? (offer?.action === "go_back" ? "chosen" : "in_use") : "ready"];

  return (
    <section className="flex flex-col gap-3">
      <ChoiceHeading title="Textcrew AI" state={state}>
        {state === "unavailable"
          ? "Nothing to set up, paid in credits. It isn’t on offer on this account right now."
          : "Nothing to set up, paid in credits. It’s what Tex uses when you haven’t connected your own AI, and you can choose it when you have."}
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
        {offer && (
          <Button
            variant={offer.action === "choose" ? "primary" : "secondary"}
            className="self-start"
            pending={update.isPending}
            onClick={() => update.mutate(offer.patch)}
          >
            {offer.action === "choose" ? "Use Textcrew AI" : `Go back to ${offer.to}`}
          </Button>
        )}
        {update.isError && (
          <p role="alert" className="text-[12.5px] text-danger">
            {switchError(update.error)}
          </p>
        )}
        {state === "in_use" && (
          <Link href="/settings/credits" className="self-start text-[13px] font-medium text-accent hover:text-accent-dark">
            See what your credits were spent on
          </Link>
        )}
      </Card>
    </section>
  );
}
