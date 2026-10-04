"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CrewMember } from "@/lib/api/client";
import { useCrew, useMe, usePlans, usePrReviews } from "@/lib/api/hooks";
import { crewHeadline, describeBrowser, splitCrew, type CrewBrowser } from "@/lib/crew";
import { titleCase } from "@/lib/format";
import { Page, PageBody, PageHeader } from "../page";
import { AgentFigure } from "../tex";
import { ButtonLink, Card, ErrorState, SkeletonRows } from "../ui";

// The colour behind each specialist's figure. Who they are and what they do comes from the API.
const TINT: Record<CrewMember["id"], string> = { tex: "#EEF1FF", byte: "#F1ECFF", patch: "#FEF4E3", scout: "#E6F5F4" };

/** Scout's browser: which plan it needs, whether this plan has it, and whether it is built yet. */
function BrowserNote({ browser }: { browser: CrewBrowser }) {
  const me = useMe();
  const plans = usePlans();
  const needed = plans.data?.plans.find((plan) => plan.id === browser.requiresPlan);
  const mine = plans.data?.plans.find((plan) => plan.id === me.data?.plan);
  // The plan's own limit decides; until the plans have loaded, the plan's id is the next best thing.
  const included = mine ? mine.limits.browser : me.data?.plan === browser.requiresPlan;
  const note = describeBrowser(browser, needed?.name ?? titleCase(browser.requiresPlan), included);

  return (
    <p className="text-[12.5px] text-nav">
      {note.text}
      {note.upgrade && (
        <>
          {" "}
          <Link href="/settings/plans" className="font-medium text-accent hover:text-accent-dark">
            See plans
          </Link>
        </>
      )}
    </p>
  );
}

/** Patch's job that needs setting up: pull-request review, which lives with the automations. */
function ReviewLink() {
  const reviews = usePrReviews();
  const on = reviews.data?.filter((review) => review.enabled).length ?? 0;
  return (
    <Link href="/automations/reviews" className="self-start text-[12.5px] font-medium text-accent hover:text-accent-dark">
      {on > 0 ? `Reviewing pull requests in ${on} ${on === 1 ? "repo" : "repos"}` : "Turn on pull-request review"}
    </Link>
  );
}

function Specialist({ member }: { member: CrewMember }) {
  return (
    <li className="flex gap-3.5">
      <span className="grid h-[104px] w-[88px] shrink-0 place-items-center rounded-xl" style={{ background: TINT[member.id] }}>
        <AgentFigure who={member.id} mood={member.available ? "ready" : "asleep"} size={92} />
      </span>
      <div className="flex min-w-0 flex-col gap-1 py-1">
        <h3 className="text-[15px] font-semibold">
          {member.name} <span className="font-normal text-muted">· {member.role}</span>
        </h3>
        <p className="text-[13.5px] text-muted">{member.description}</p>
        {member.browser && <BrowserNote browser={member.browser} />}
        {member.id === "patch" && <ReviewLink />}
      </div>
    </li>
  );
}

function Group({ title, note, members }: { title: string; note: ReactNode; members: CrewMember[] }) {
  if (members.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <p className="text-[13px] text-muted">{note}</p>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-x-6 gap-y-5">
        {members.map((member) => (
          <Specialist key={member.id} member={member} />
        ))}
      </ul>
    </section>
  );
}

/** The crew, as the backend lists it: the lead, the specialists that work today and the ones still to come. */
export function CrewScreen() {
  const crew = useCrew();
  const { lead, working, coming } = splitCrew(crew.data ?? []);

  return (
    <Page>
      <PageHeader title="Crew">{crew.data && <span className="text-[13.5px] text-muted">{crewHeadline(crew.data)}</span>}</PageHeader>
      <PageBody>
        {crew.isPending ? (
          <Card>
            <SkeletonRows rows={4} />
          </Card>
        ) : crew.isError ? (
          <ErrorState error={crew.error} onRetry={() => void crew.refetch()} />
        ) : (
          <>
            {lead && (
              <section aria-label={lead.name} className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl bg-accent-soft px-6 py-3">
                <AgentFigure who={lead.id} mood="ready" size={176} />
                <div className="flex min-w-[260px] flex-1 flex-col items-start gap-2.5 py-3">
                  <p className="text-[12.5px] font-semibold text-accent-dark">{lead.role} · on your crew now</p>
                  <h2 className="text-[26px] leading-none font-semibold tracking-[-0.02em]">{lead.name}</h2>
                  <p className="max-w-[520px] text-[15px] leading-relaxed text-fg-2">{lead.description}</p>
                  <ButtonLink href="/" variant="primary">
                    Message {lead.name}
                  </ButtonLink>
                </div>
              </section>
            )}

            <Group
              title="On your crew now"
              note={`${lead?.name ?? "Tex"} hands each one the part of a job it’s best at. Anything risky still waits for your OK.`}
              members={working}
            />
            <Group title="Coming soon" note="Not switched on here yet." members={coming} />
          </>
        )}
      </PageBody>
    </Page>
  );
}
