import { AUTOMATION_KIND_LABEL } from "@/lib/format";
import { AgentFigure } from "../tex";
import { ButtonLink } from "../ui";

const EXAMPLES = [
  { kind: AUTOMATION_KIND_LABEL.once, phrase: "Remind me Friday at 10am to call the bank." },
  { kind: AUTOMATION_KIND_LABEL.repeat, phrase: "Every weekday at 8am, send me today’s meetings." },
  { kind: AUTOMATION_KIND_LABEL.event, phrase: "When a new lead fills my form, add it to my CRM." },
];

/** Automations are made by asking, not by filling in a form: this card says so and shows how. */
export function AddAutomationHint() {
  return (
    <section aria-label="Add an automation" className="flex items-center gap-6 rounded-[18px] border border-dashed border-line-strong px-6 py-5">
      <AgentFigure who="tex" mood="ready" size={120} label="" className="hidden shrink-0 lg:block" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex max-w-[560px] flex-col gap-0.5">
            <h2 className="text-[15px] font-semibold">Add one by texting Tex</h2>
            <p className="text-[13.5px] text-muted">
              There’s no form to fill in. Say it the way you’d ask a person, in any linked chat or on the Chat page. You can pause
              or delete it here.
            </p>
          </div>
          <ButtonLink href="/" size="sm" variant="primary">
            Message Tex
          </ButtonLink>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-2.5">
          {EXAMPLES.map((example) => (
            <li key={example.kind} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-3">
              <span className="text-[11.5px] text-muted">{example.kind}</span>
              <span className="text-[13.5px]">“{example.phrase}”</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
