import type { Metadata } from "next";
import { Page, PageBody, PageHeader } from "@/components/page";
import { AgentFigure, type AgentId } from "@/components/tex";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Crew" };

// Names, roles and descriptions as on textcrew.in. Only Tex works today; there is no API for the rest yet.
const CREW: { id: AgentId; name: string; role: string; body: string; tint: string }[] = [
  { id: "byte", name: "Byte", role: "Coder", tint: "#F1ECFF", body: "Writes and fixes code, and can hand work to your own Claude Code." },
  { id: "patch", name: "Patch", role: "Code review", tint: "#FEF4E3", body: "Runs several reviewers on a pull request, leaves comments on GitHub and flags risky changes." },
  {
    id: "scout", name: "Scout", role: "Research", tint: "#E6F5F4",
    body: "Searches the web and reads pages. On the Max plan it drives a real browser for sites that need a login, clicks or forms, or that have no API.",
  },
];

export default function CrewPage() {
  return (
    <Page>
      <PageHeader title="Crew">
        <span className="text-[13.5px] text-muted">Tex is on the job today. Three specialists are on their way.</span>
      </PageHeader>
      <PageBody>
        <section aria-label="Tex" className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl bg-accent-soft px-6 py-3">
          <AgentFigure who="tex" mood="ready" size={176} />
          <div className="flex min-w-[260px] flex-1 flex-col items-start gap-2.5 py-3">
            <p className="text-[12.5px] font-semibold text-accent-dark">Captain · on your crew now</p>
            <h2 className="text-[26px] leading-none font-semibold tracking-[-0.02em]">Tex</h2>
            <p className="max-w-[520px] text-[15px] leading-relaxed text-fg-2">
              The one you text. Tex handles the job itself or, as the crew arrives, hands each piece to the right specialist and puts the results together.
            </p>
            <ButtonLink href="/" variant="primary">
              Message Tex
            </ButtonLink>
          </div>
        </section>

        <section aria-label="Coming soon" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[13px] font-semibold">Coming soon</h2>
            <p className="text-[13px] text-muted">Their drafts will land in your approvals before anything ships.</p>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-x-6 gap-y-5">
            {CREW.map((member) => (
              <li key={member.id} className="flex gap-3.5">
                <span className="grid h-[104px] w-[88px] shrink-0 place-items-center rounded-xl" style={{ background: member.tint }}>
                  <AgentFigure who={member.id} mood="ready" size={92} />
                </span>
                <div className="flex min-w-0 flex-col gap-1 py-1">
                  <h3 className="text-[15px] font-semibold">
                    {member.name} <span className="font-normal text-muted">· {member.role}</span>
                  </h3>
                  <p className="text-[13.5px] text-muted">{member.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </Page>
  );
}
