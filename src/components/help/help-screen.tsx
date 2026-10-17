"use client";

import { useDeferredValue, useId, useMemo, useState, type ReactNode } from "react";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { countAnswers, PLACES, placeName, searchHelp, type HelpIconName, type HelpSection, type HelpTopic } from "@/lib/help";
import { useAutoTopUp } from "@/lib/api/hooks";
import { CREW_SECTION_ID, HELP_ASK_TEX, HELP_CONTACT, HELP_POPULAR, HELP_START_STEPS, helpSectionsFor } from "@/lib/help-content";
import { AppIcon } from "../brand-icon";
import { ApprovalsIcon, AppsIcon, AutomationsIcon, ChevronRightIcon, CloseIcon, CrewIcon, KeyIcon, LinkIcon, LockIcon, SearchIcon, WarningIcon } from "../icons";
import { Columns, COLUMN_ITEM, Page, PageBody, PageHeader, READING } from "../page";
import { AgentFigure } from "../tex";
import { toast, toastError } from "../toast";
import { Button, ButtonLink, EmptyState, IconButton, IconTile, inputClass } from "../ui";
import { CrewLineup } from "./crew-lineup";
import { HELP_LINK, HelpBlocks, HelpLink } from "./help-text";

// The Help page: how Textcrew works, in short answers. A search at the top, the topics as cards,
// then each topic's answers as cards across the full width. Each answer has an address of its own
// (`/help#telegram-commands`), which its link button copies, so an answer can be sent to someone.

const CONTENTS_ID = "help-contents";

/** A topic's mark: the app's own line icons, Tex for the basics, Telegram's own logo. */
function SectionIcon({ icon, size = 40 }: { icon: HelpIconName; size?: number }) {
  if (icon === "telegram") return <AppIcon name="telegram" size={size} />;
  const glyph = Math.round(size * 0.48);
  const inner: Record<Exclude<HelpIconName, "telegram">, ReactNode> = {
    start: <AgentFigure who="tex" glyph size={Math.round(size * 0.78)} label="" />,
    crew: <CrewIcon size={glyph} />,
    ai: <KeyIcon size={glyph} />,
    apps: <AppsIcon size={glyph} />,
    approvals: <ApprovalsIcon size={glyph} />,
    automations: <AutomationsIcon size={glyph} />,
    credits: <span className="text-[15px] font-semibold">¢</span>,
    privacy: <LockIcon size={glyph} />,
    faq: <WarningIcon size={glyph} />,
  };
  return (
    <IconTile size={size} className={cn("text-nav", icon === "start" && "bg-accent-soft")}>
      {inner[icon]}
    </IconTile>
  );
}

/** The search: every word typed must be in an answer. Escape or × empties it. */
function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div role="search" className="relative w-full sm:ml-auto sm:w-[340px]">
      <label htmlFor={id} className="sr-only">
        Search help
      </label>
      <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onChange("");
        }}
        placeholder="Search help, e.g. connect Gmail or credits"
        autoComplete="off"
        spellCheck={false}
        className={cn(inputClass, "pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden")}
      />
      {value && (
        <IconButton label="Clear the search" onClick={() => onChange("")} className="absolute top-1/2 right-1 size-7 -translate-y-1/2">
          <CloseIcon size={14} />
        </IconButton>
      )}
    </div>
  );
}

/** What Textcrew is in two sentences, and the answers people look for first. */
function Intro() {
  return (
    <section aria-labelledby="help-intro" className="@container overflow-hidden rounded-3xl bg-accent-soft">
      <div className="flex items-center gap-6 px-5 py-6 @[720px]:px-8 @[720px]:py-7">
        <AgentFigure who="tex" mood="ready" size={104} label="" className="shrink-0 max-sm:hidden" />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id="help-intro" className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">
            How Textcrew works
          </h2>
          <p className={cn(READING, "text-[14px] leading-[1.55] text-fg-2")}>
            Tex is your AI agent. You text it here or on Telegram. It works in your apps, asks before anything risky, and runs jobs for you on a
            schedule. Every answer below is short: search at the top, or pick a topic.
          </p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 pt-1 text-[13px]">
            <span className="text-muted">Most asked:</span>
            {HELP_POPULAR.map((item) => (
              <a key={item.topic} href={`#${item.topic}`} className={HELP_LINK}>
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Get started in 3 steps": each step is a card that opens the screen where it is done, with a link to its answer. */
function StartSteps() {
  return (
    <section aria-labelledby="help-start" className="flex flex-col gap-3">
      <h2 id="help-start" className="text-[17px] font-semibold tracking-[-0.01em]">
        Get started in 3 steps
      </h2>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3">
        {HELP_START_STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-nav">{index + 1}</span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-[14.5px] font-semibold">{step.title}</p>
                <p className="text-[13px] leading-snug text-muted">{step.body}</p>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
              <ButtonLink href={PLACES[step.place].href} size="sm">
                Open {placeName(step.place)}
                <ChevronRightIcon size={13} className="-mr-1 text-muted" />
              </ButtonLink>
              <a href={`#${step.topic}`} className={cn(HELP_LINK, "text-[13px]")}>
                How?
              </a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The topics as cards, each leading to its part of the page. */
function Contents({ sections }: { sections: readonly HelpSection[] }) {
  return (
    <nav id={CONTENTS_ID} aria-label="Help topics" className="scroll-mt-4">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-3 max-sm:gap-2">
        {sections.map((section) => (
          <li key={section.id}>
            {/* On a phone a row each, the name only, so the answers aren't far below. */}
            <a
              href={`#${section.id}`}
              className="flex h-full items-start gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-fg/25 hover:bg-surface-2/50 max-sm:items-center max-sm:px-3 max-sm:py-2.5"
            >
              <SectionIcon icon={section.icon} size={36} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-semibold">{section.title}</span>
                <span className="text-[12.5px] leading-snug text-muted max-sm:hidden">{section.summary}</span>
              </span>
              <ChevronRightIcon size={15} className="shrink-0 text-muted sm:hidden" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Copies the answer's own address, so it can be sent to someone; a toast says it worked. */
function CopyLink({ topic }: { topic: HelpTopic }) {
  const copy = async () => {
    const url = `${window.location.origin}/help#${topic.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", body: url });
    } catch {
      // Clipboard blocked: the address bar then holds the link instead.
      window.history.replaceState(null, "", `#${topic.id}`);
      toastError("Couldn’t copy the link", "Your browser didn’t allow it. The link to this answer is in the address bar now.");
    }
  };
  return (
    <IconButton label={`Copy a link to “${topic.title}”`} onClick={() => void copy()} className="-mt-1 -mr-1.5 size-7">
      <LinkIcon size={15} />
    </IconButton>
  );
}

/** One answer: its question, and what to do. Opened by its address, it is ringed. */
function TopicCard({ topic }: { topic: HelpTopic }) {
  return (
    <article
      id={topic.id}
      aria-labelledby={`${topic.id}-title`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-line bg-surface p-5 target:border-accent target:shadow-[0_0_0_3px_var(--accent-soft)]"
    >
      <div className="flex items-start gap-2">
        <h3 id={`${topic.id}-title`} className="flex-1 text-[15px] leading-snug font-semibold tracking-[-0.01em]">
          {topic.title}
        </h3>
        <CopyLink topic={topic} />
      </div>
      <HelpBlocks blocks={topic.blocks} />
    </article>
  );
}

/**
 * A topic: its heading, the screens it is about, and its answers in as many columns as fit. While
 * searching, the topics at the top aren't there, so there is no way back to them. The crew's topic
 * starts with who is on the crew here (not while searching: its links lead to answers a search may
 * have left out).
 */
function Section({ section, searching }: { section: HelpSection; searching: boolean }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <SectionIcon icon={section.icon} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={`${section.id}-title`} className="text-[19px] leading-tight font-semibold tracking-[-0.02em]">
              {section.title}
            </h2>
            <p className="text-[13.5px] text-muted">{section.summary}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {section.go.map((id) => (
            <ButtonLink key={id} href={PLACES[id].href} size="sm">
              {placeName(id)}
              <ChevronRightIcon size={13} className="-mr-1 text-muted" />
            </ButtonLink>
          ))}
          {!searching && (
            <a href={`#${CONTENTS_ID}`} className="px-1.5 text-[12.5px] font-medium text-muted hover:text-fg">
              All topics ↑
            </a>
          )}
        </div>
      </div>
      {section.id === CREW_SECTION_ID && !searching && <CrewLineup />}
      <Columns min={380}>
        {section.topics.map((topic) => (
          <div key={topic.id} className={COLUMN_ITEM}>
            <TopicCard topic={topic} />
          </div>
        ))}
      </Columns>
    </section>
  );
}

/** The foot of the page: Tex can look at the person's own setup, and the privacy policy. */
function StillStuck() {
  return (
    <section aria-label="Still stuck" className="flex flex-col gap-3 rounded-2xl bg-surface-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface max-sm:hidden">
        <AgentFigure who="tex" mood="asking" glyph size={30} label="" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[14.5px] font-semibold">Still stuck? Ask Tex, or write to us</p>
        <p className="text-[13px] text-muted">
          Tex can check your plan, which apps are connected or need reconnecting, and your automations. Or write to us at{" "}
          <HelpLink href={`mailto:${HELP_CONTACT}`}>{HELP_CONTACT}</HelpLink>. Our privacy policy is at{" "}
          <HelpLink href={PLACES.privacy.href}>{PLACES.privacy.label}</HelpLink>.
        </p>
      </div>
      <ButtonLink href={chatDraftHref(HELP_ASK_TEX)} variant="primary" size="sm" className="self-start sm:self-center">
        Ask Tex
      </ButtonLink>
    </section>
  );
}

export function HelpScreen() {
  const [query, setQuery] = useState("");
  const typed = useDeferredValue(query);
  // Auto top-up has an answer only while the server allows it.
  const autoTopUp = useAutoTopUp().data?.available === true;
  const sections = useMemo(() => helpSectionsFor({ autoTopUp }), [autoTopUp]);
  const found = useMemo(() => searchHelp(sections, typed), [sections, typed]);
  const searching = typed.trim() !== "";

  return (
    <Page>
      <PageHeader title="Help">
        <SearchField value={query} onChange={setQuery} />
      </PageHeader>
      <PageBody className="gap-8">
        {searching ? (
          <p role="status" className="text-[13.5px] text-muted">
            {found.length > 0 ? `${countAnswers(found)} for “${typed.trim()}”` : `No answers for “${typed.trim()}”`}
          </p>
        ) : (
          <>
            <Intro />
            <StartSteps />
            <Contents sections={sections} />
          </>
        )}
        {found.map((section) => (
          <Section key={section.id} section={section} searching={searching} />
        ))}
        {searching && found.length === 0 && (
          <EmptyState
            mood="asking"
            title="Try other words"
            action={
              <Button size="sm" onClick={() => setQuery("")}>
                Clear the search
              </Button>
            }
          >
            Such as Telegram, credits or approve. Or ask Tex in{" "}
            <HelpLink href={chatDraftHref(typed.trim())}>the chat</HelpLink>.
          </EmptyState>
        )}
        <StillStuck />
      </PageBody>
    </Page>
  );
}
