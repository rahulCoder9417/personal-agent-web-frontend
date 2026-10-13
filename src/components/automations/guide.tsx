import Link from "next/link";
import { AUTOMATION_KINDS } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { READING } from "../page";
import { ButtonLink } from "../ui";
import { KIND_TINT, KindIcon } from "./kind-icon";

/**
 * What an automation is, for someone who has never made one: one sentence, then the three kinds,
 * each with a request that makes it and a link that opens the chat with that request typed in.
 */
export function AutomationGuide() {
  return (
    <section aria-labelledby="automations-guide" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="automations-guide" className="text-[19px] leading-tight font-semibold tracking-[-0.015em]">
            Things Tex does on its own
          </h2>
          <p className={cn("text-[14px] text-muted", READING)}>
            An automation is a standing request. You ask Tex once, in plain words, and it does the job at the time or the moment you named, then posts
            the result in your Automations chat. There is no form to fill in: you make one by asking.
          </p>
        </div>
        <ButtonLink href="/" variant="primary">
          Ask Tex in chat
        </ButtonLink>
      </div>

      <ol aria-label="The three kinds of automation" className="grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-3.5">
        {AUTOMATION_KINDS.map((guide, index) => (
          <li key={guide.kind} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[11px]", KIND_TINT[guide.kind])}>
                <KindIcon kind={guide.kind} size={18} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-[11.5px] text-muted">Kind {index + 1} of 3</span>
                <h3 className="text-[14.5px] leading-snug font-semibold">{guide.name}</h3>
              </div>
            </div>
            <p className="text-[13px] text-muted">{guide.when}</p>
            <div className="mt-auto flex flex-col gap-1.5 rounded-xl bg-surface-2 px-3.5 py-3">
              <span className="text-[11.5px] text-muted">You’d say</span>
              <p className="text-[13.5px] text-fg">“{guide.example}”</p>
              <Link
                href={chatDraftHref(guide.example)}
                aria-label={`Try it in chat: ${guide.example}`}
                className="self-start text-[12.5px] font-medium text-accent hover:text-accent-dark"
              >
                Try it in chat →
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
