import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { AgentFigure } from "@/components/tex";
import { ButtonLink } from "@/components/ui";

const ASKS = [
  "Move my 3pm with Maya to tomorrow and let her know.",
  "Every Monday at 9am, send me my week.",
  "Remind me Friday to chase the invoice.",
  "Tell me when my boss emails.",
];

/** Step 4: a first message. Each example opens the chat with that text ready to send. */
export function StepHi() {
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <div className="flex items-center gap-5">
        <AgentFigure who="tex" mood="done" size={132} label="Tex, ready" className="shrink-0" />
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Say hi to Tex</h1>
          <p className="text-[15px] text-muted">Ask the way you’d ask a person. Tex does the work and checks with you before anything that sends, deletes or spends.</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {ASKS.map((ask) => (
          <li key={ask}>
            <Link
              href={`/?draft=${encodeURIComponent(ask)}`}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[14px] transition-colors hover:border-fg/40"
            >
              <span className="flex-1">“{ask}”</span>
              <ChevronRightIcon size={16} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href="/" variant="primary" size="lg">
          Open chat
        </ButtonLink>
        <span className="text-[12px] text-muted">or text Tex from the chat you linked</span>
      </div>
    </div>
  );
}
