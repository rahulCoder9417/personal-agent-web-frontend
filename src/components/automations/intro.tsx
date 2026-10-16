"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AUTOMATION_KINDS } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { READING } from "../page";
import { AgentFigure } from "../tex";
import { Button, inputClass } from "../ui";
import { KindBadge } from "./kind-icon";

/**
 * The top of the Automations screen, for someone who has never made one: what an automation is,
 * how one is made (by asking Tex: the box opens the chat with the request typed in, nothing is
 * sent until Send; or by hand, with New automation), and the three kinds, each with a request that
 * makes it. `compact` (someone who has automations already) leaves the kinds out on a phone, so
 * their list comes sooner.
 */
export function AutomationsIntro({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    router.push(ask.trim() ? chatDraftHref(ask) : "/");
  }

  return (
    <section aria-labelledby="automations-intro" className="relative overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-start gap-6 p-5 sm:p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="automations-intro" className="text-[19px] leading-tight font-semibold tracking-[-0.015em]">
              Things Tex does on its own
            </h2>
            <p className={cn("text-[14px] text-muted", READING)}>
              An automation is a job you hand Tex once, in plain words. Tex then does it at the time you named, on a schedule, or the moment
              something happens in one of your apps, and posts each result in your Automations chat. Ask Tex and it shows you a draft to save, or build one
              yourself, box by box, with New automation. Nothing runs before you save it.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex max-w-[760px] gap-2 max-sm:flex-col">
            <label htmlFor="automation-ask" className="sr-only">
              What should Tex do, and when?
            </label>
            <input
              id="automation-ask"
              value={ask}
              onChange={(event) => setAsk(event.target.value)}
              placeholder="What should Tex do, and when?"
              className={cn(inputClass, "h-10 text-[14px]")}
              autoComplete="off"
            />
            <Button type="submit" variant="primary" size="lg">
              Ask Tex in chat
            </Button>
          </form>
          <p className="-mt-2 text-[12.5px] text-muted">
            The chat opens with your words typed in. Nothing is sent until you press Send. Or{" "}
            <Link href="/automations/new" className="font-medium text-accent hover:text-accent-dark">
              build one yourself, box by box
            </Link>
            .
          </p>

          <ul
            aria-label="The three kinds of automation"
            className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2.5", compact && "max-md:hidden")}
          >
            {AUTOMATION_KINDS.map((guide) => (
              <li
                key={guide.kind}
                className="relative flex gap-3 rounded-xl border border-line bg-surface-2/50 p-3 transition-colors focus-within:border-line-strong hover:border-line-strong hover:bg-surface-2"
              >
                <KindBadge kind={guide.kind} size={32} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{guide.name}</span>
                  <span className="text-[12.5px] text-muted">{guide.when}</span>
                  {/* The link is stretched over the tile, so a click anywhere on it tries the example. */}
                  <Link
                    href={chatDraftHref(guide.example)}
                    aria-label={`Try it in chat: ${guide.example}`}
                    className="mt-1 text-[12.5px] text-fg-2 after:absolute after:inset-0 after:rounded-xl"
                  >
                    “{guide.example}” <span className="font-medium whitespace-nowrap text-accent">Try it →</span>
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <AgentFigure who="tex" mood="ready" size={132} label="" className="shrink-0 self-center max-lg:hidden" />
      </div>
    </section>
  );
}
