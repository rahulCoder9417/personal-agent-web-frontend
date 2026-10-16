"use client";

import Link from "next/link";
import { AUTOMATION_KINDS } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { PageBody, READING } from "../page";
import { AgentFigure } from "../tex";
import { ButtonLink } from "../ui";
import { BackToAutomations } from "./automation-screen";
import { KIND_TINT, KindIcon } from "./kind-icon";

/**
 * `/automations/new` without a draft. There is no form to build one by hand yet (that comes in a
 * later phase): an automation starts as a request to Tex, who shows it back as a draft to save.
 */
export function NewAutomation() {
  return (
    <PageBody className="gap-6">
      <BackToAutomations />
      <section aria-labelledby="new-automation" className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 id="new-automation" className="text-[19px] leading-tight font-semibold tracking-[-0.015em]">
              A new automation starts in the chat
            </h2>
            <p className={cn("text-[14px] text-muted", READING)}>
              Building one here, box by box, comes later. For now, tell Tex what to do and when. Tex shows it back as a draft: a small diagram in the chat with
              Save, and the same draft here on the canvas to check first. Nothing runs until you save it.
            </p>
          </div>
          <AgentFigure who="tex" mood="ready" size={96} label="" className="shrink-0 max-sm:hidden" />
        </div>
        <ButtonLink href="/" variant="primary" size="lg" className="w-fit">
          Ask Tex in chat
        </ButtonLink>
        <ul aria-label="Requests to start from" className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2.5">
          {AUTOMATION_KINDS.map((guide) => (
            <li key={guide.kind}>
              <Link
                href={chatDraftHref(guide.example)}
                className="flex h-full gap-3 rounded-xl bg-surface-2 p-3 transition-colors hover:bg-line"
                aria-label={`Try it in chat: ${guide.example}`}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", KIND_TINT[guide.kind])}>
                  <KindIcon kind={guide.kind} size={16} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{guide.name}</span>
                  <span className="text-[12.5px] text-fg-2">
                    “{guide.example}” <span className="font-medium whitespace-nowrap text-accent">Try it →</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageBody>
  );
}
