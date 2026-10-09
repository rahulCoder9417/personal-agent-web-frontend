"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { CrewMember } from "@/lib/api/client";
import { useCrew, useMe, usePlans, usePrReviews } from "@/lib/api/hooks";
import { chatDraftHref } from "@/lib/chat-link";
import { CREW_GUIDE, CREW_STEPS, crewHeadline, describeAvailability, describeBrowser, type CrewBrowser } from "@/lib/crew";
import { cn, titleCase } from "@/lib/format";
import { CheckIcon, ComputerIcon } from "../icons";
import { Page, PageBody, PageHeader } from "../page";
import { AgentFigure } from "../tex";
import { ButtonLink, Card, ErrorState, Pill, SkeletonRows } from "../ui";

// Each member's own colour, from the design tokens. Who they are and what they do comes from the API.
const COLOUR: Record<CrewMember["id"], string> = { tex: "var(--accent)", byte: "var(--byte)", patch: "var(--patch)", scout: "var(--scout)" };

/** A member's colour as a quiet wash over the card's surface, whatever the surface's own colour is. */
const wash = (id: CrewMember["id"], strength = 12): CSSProperties => ({
  background: `color-mix(in srgb, ${COLOUR[id]} ${strength}%, var(--surface))`,
});

/** A fact about a member that needs a line of its own: Scout's browser, Patch's pull-request review. */
function Extra({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 border-t border-line pt-3.5 text-[13px] text-fg-2">
      <span className="mt-[2px] shrink-0 text-nav">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

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
    <Extra icon={<ComputerIcon size={16} />}>
      {note.text}
      {note.upgrade && (
        <>
          {" "}
          <Link href="/settings/plans" className="font-medium text-accent hover:text-accent-dark">
            See plans
          </Link>
        </>
      )}
    </Extra>
  );
}

/** Patch's job that needs setting up: pull-request review, which lives with the automations. */
function ReviewNote() {
  const reviews = usePrReviews();
  const on = reviews.data?.filter((review) => review.enabled).length ?? 0;
  return (
    <Extra icon={<CheckIcon size={16} />}>
      {on > 0 ? `Reviewing every pull request in ${on} ${on === 1 ? "repo" : "repos"}.` : "Can review every pull request in a repo on its own."}{" "}
      <Link href="/automations/reviews" className="font-medium text-accent hover:text-accent-dark">
        {on > 0 ? "Manage pull-request review" : "Turn on pull-request review"}
      </Link>
    </Extra>
  );
}

/**
 * One member of the crew: its face, name and role on its own colour, whether it works here yet,
 * what it does in three lines, and a request to try that opens the chat with it typed in.
 */
function MemberCard({ member }: { member: CrewMember }) {
  const guide = CREW_GUIDE[member.id];
  const availability = describeAvailability(member);
  const here = member.available;

  return (
    <li id={`crew-${member.id}`} className="flex scroll-mt-4 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-end justify-between gap-2 pt-4 pr-2 pl-5" style={wash(member.id)}>
        <div className="flex min-w-0 flex-col items-start gap-2 pb-4">
          <Pill tone={availability.tone} className={availability.tone === "muted" ? "bg-surface" : undefined}>
            {availability.label}
          </Pill>
          <div className="flex flex-col">
            <h3 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{member.name}</h3>
            <p className="text-[13.5px] font-medium text-fg-2">{member.role}</p>
          </div>
        </div>
        <AgentFigure who={member.id} mood={here ? "ready" : "asleep"} size={124} className={cn("-mb-1 shrink-0", !here && "opacity-70")} />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="text-[13.5px] text-muted">{member.description}</p>

        <ul aria-label={`What ${member.name} does`} className="flex flex-col gap-2 text-[13.5px]">
          {guide.does.map((line) => (
            <li key={line} className="flex gap-2.5">
              <CheckIcon size={15} className="mt-[3px] shrink-0" style={{ color: COLOUR[member.id] }} />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {member.browser && <BrowserNote browser={member.browser} />}
        {member.id === "patch" && <ReviewNote />}

        <div className="mt-auto flex flex-col gap-1.5 rounded-xl bg-surface-2 px-3.5 py-3">
          <span className="text-[11.5px] text-muted">{here ? "Try asking Tex" : "Once it’s here, you could ask Tex"}</span>
          <p className="text-[13.5px]">“{guide.example}”</p>
          {here ? (
            <Link
              href={chatDraftHref(guide.example)}
              aria-label={`Try it in chat: ${guide.example}`}
              className="self-start text-[12.5px] font-medium text-accent hover:text-accent-dark"
            >
              Try it →
            </Link>
          ) : (
            <span className="text-[12.5px] text-muted">Not switched on here yet.</span>
          )}
        </div>
      </div>
    </li>
  );
}

/** What the crew is, in one look: the four faces, one sentence, and who does what. */
function Hero({ crew }: { crew: readonly CrewMember[] }) {
  const lead = crew.find((member) => member.kind === "lead");
  const specialists = crew.filter((member) => member.kind === "specialist");
  const tex = lead?.name ?? "Tex";

  return (
    <section aria-labelledby="crew-hero" className="@container overflow-hidden rounded-3xl bg-accent-soft">
      <div className="flex flex-col gap-2 px-6 pt-7 @[820px]:flex-row @[820px]:items-center @[820px]:gap-8 @[820px]:px-9 @[820px]:py-8">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-3.5">
          <p className="text-[12.5px] font-semibold text-accent-dark">Your crew</p>
          <h2 id="crew-hero" className="text-[26px] leading-[1.1] font-semibold tracking-[-0.025em] @[820px]:text-[31px]">
            One agent to text. A crew behind it.
          </h2>
          <p className="max-w-[58ch] text-[15px] leading-relaxed text-fg-2">
            {crewHeadline(crew)} You only ever text {tex}: it plans the job, gives each part to whoever is best at it, and comes back with one answer.
          </p>

          <ul aria-label="Who does what" className="flex flex-wrap gap-2">
            {crew.map((member) => (
              <li key={member.id}>
                <a
                  href={`#crew-${member.id}`}
                  className="inline-flex h-8 items-center gap-2 rounded-full bg-surface pr-3 pl-1.5 text-[13px] shadow-[var(--shadow-raised)] transition-colors hover:bg-surface-2"
                >
                  <span className="grid size-[22px] place-items-center rounded-full" style={wash(member.id, 16)}>
                    <AgentFigure who={member.id} glyph size={16} label="" />
                  </span>
                  <span className="font-semibold">{member.name}</span>
                  <span className="text-muted">{member.role}</span>
                </a>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <ButtonLink href="/" variant="primary" size="lg">
              Message {tex}
            </ButtonLink>
            <a href="#how-the-crew-works" className="text-[13.5px] font-medium text-accent-dark underline-offset-4 hover:underline">
              How the crew works
            </a>
          </div>
        </div>

        {/* The line-up: the lead in front, the specialists beside it. Asleep means not switched on here yet. */}
        <div aria-hidden className="flex w-full max-w-[440px] shrink-0 items-end justify-center self-center @[820px]:w-[40%]">
          {lead && <AgentFigure who={lead.id} mood="ready" size={220} label="" className="relative z-10 -mr-[9%] -ml-[4%] h-auto w-[46%]" />}
          {specialists.map((member) => (
            <AgentFigure
              key={member.id}
              who={member.id}
              mood={member.available ? "ready" : "asleep"}
              size={150}
              label=""
              className={cn("-mx-[5.5%] h-auto w-[32%]", !member.available && "opacity-60")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** How a job moves through the crew, in four steps. */
function HowItWorks() {
  return (
    <section
      id="how-the-crew-works"
      aria-labelledby="crew-how"
      className="@container flex scroll-mt-4 flex-col gap-4 rounded-2xl border border-line bg-chrome px-5 py-5 sm:px-6"
    >
      <h2 id="crew-how" className="text-[15px] font-semibold">
        How the crew works
      </h2>
      {/* Four in a row, two by two, or one under the other: never three and a straggler. */}
      <ol className="grid grid-cols-1 gap-x-7 gap-y-4 @[520px]:grid-cols-2 @[960px]:grid-cols-4">
        {CREW_STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-fg text-[12px] font-semibold text-white">
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13.5px] font-semibold">{step.title}</span>
              <span className="text-[13px] text-fg-2">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The crew, as the backend lists it: what it is, one card per member, and how they work together. */
export function CrewScreen() {
  const crew = useCrew();

  return (
    <Page>
      <PageHeader title="Crew" />
      <PageBody className="gap-6">
        {crew.isPending ? (
          <Card>
            <SkeletonRows rows={4} />
          </Card>
        ) : crew.isError ? (
          <ErrorState error={crew.error} onRetry={() => void crew.refetch()} />
        ) : (
          <>
            <Hero crew={crew.data} />

            {/* One column on a phone, two beside the sidebar, four when there is room for them. */}
            <div className="@container">
              <ul aria-label="The crew" className="grid grid-cols-1 gap-4 @[620px]:grid-cols-2 @[1240px]:grid-cols-4">
                {crew.data.map((member) => (
                  <MemberCard key={member.id} member={member} />
                ))}
              </ul>
            </div>

            <HowItWorks />
          </>
        )}
      </PageBody>
    </Page>
  );
}
