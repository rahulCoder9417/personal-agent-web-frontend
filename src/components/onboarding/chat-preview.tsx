import { BrandIcon } from "@/components/brand-icon";
import { AgentFigure } from "@/components/tex";
import { CHANNEL_LABEL, cn } from "@/lib/format";
import type { LinkableChannel } from "./step-link";

/** What linking looks like from inside the chat app: the code goes out, Tex answers. A picture, not a control. */
export function ChatPreview({ channel, code, linked }: { channel: LinkableChannel; code: string | null; linked: boolean }) {
  const name = CHANNEL_LABEL[channel];
  return (
    <figure className="flex flex-col gap-2.5">
      <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-soft">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft">
            <AgentFigure who="tex" mood={linked ? "done" : "ready"} glyph size={26} label="" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[14px] font-semibold">Tex</span>
            <span className="text-[12px] text-muted">Textcrew on {name}</span>
          </div>
          <BrandIcon name={channel} size={18} className="ml-auto" />
        </div>

        <div className="flex min-h-[236px] flex-col gap-2.5 bg-chrome px-4 py-4">
          <div className={cn("ml-auto rounded-[18px_18px_6px_18px] bg-fg px-3.5 py-2.5 text-[13px] text-white", !code && !linked && "opacity-40")}>
            {code ?? "LINK-····-··"}
          </div>
          <div className={cn("max-w-[86%] rounded-[18px_18px_18px_6px] border border-line bg-surface px-3.5 py-2.5 text-[13.5px] leading-snug", !linked && "opacity-55")}>
            Linked. I’m Tex. Text me anything you’d hand to an assistant.
          </div>
          <div className={cn("max-w-[86%] rounded-[18px_18px_18px_6px] border border-line bg-surface px-3.5 py-2.5 text-[13.5px] leading-snug text-fg-2", !linked && "opacity-55")}>
            Try: “Move my 3pm with Maya to tomorrow and let her know.”
          </div>
        </div>

        <div aria-hidden className="mx-4 my-3 rounded-full border border-line px-4 py-2.5 text-[13px] text-muted">
          Message Tex…
        </div>
      </div>
      <figcaption className="text-center text-[12px] text-muted">
        {linked ? `linked · this is your agent on ${name} now` : `what you’ll see in ${name}`}
      </figcaption>
    </figure>
  );
}
