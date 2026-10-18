"use client";

import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { countAnswers, PLACES, placeName, searchHelp, type HelpIconName, type HelpSection, type HelpTopic } from "@/lib/help";
import { useAutoTopUp } from "@/lib/api/hooks";
import { CREW_SECTION_ID, HELP_ASK_TEX, HELP_POPULAR, HELP_START_STEPS, helpSectionsFor } from "@/lib/help-content";
import { AppIcon } from "../brand-icon";
import { ApprovalsIcon, AppsIcon, AutomationsIcon, ChevronRightIcon, CloseIcon, CrewIcon, KeyIcon, LinkIcon, LockIcon, SearchIcon, WarningIcon } from "../icons";
import { Page, PageBody, PageHeader, READING } from "../page";
import { AgentFigure } from "../tex";
import { toast, toastError } from "../toast";
import { Button, ButtonLink, EmptyState, IconButton, IconTile, inputClass } from "../ui";
import { ContactSupport } from "./contact-support";
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
    <div role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Search help
      </label>
      <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
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
        className={cn(inputClass, "h-12 rounded-2xl pr-10 pl-11 text-[15px] [&::-webkit-search-cancel-button]:hidden")}
      />
      {value && (
        <IconButton label="Clear the search" onClick={() => onChange("")} className="absolute top-1/2 right-2 size-8 -translate-y-1/2">
          <CloseIcon size={14} />
        </IconButton>
      )}
    </div>
  );
}

/** "Get started in 3 steps": each step is a card that opens the screen where it is done, with a link to its answer. */
function StartSteps() {
  return (
    <section aria-labelledby="help-start" className="flex flex-col gap-3">
      <h2 id="help-start" className="text-[17px] font-semibold tracking-[-0.01em]">
        Get started in 3 steps
      </h2>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {HELP_START_STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
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

/** The ids of the answers a link such as `/help#apps-gmail` points at, or none when it points at a section or nowhere. */
export function topicIdFromHash(hash: string, sections: readonly HelpSection[]): string | null {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    // Keep it as typed.
  }
  return sections.some((section) => section.topics.some((topic) => topic.id === id)) ? id : null;
}

/** The set of open answers after one is pressed. */
export function toggled(open: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(open);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** The sections as small cards, to jump to one, with how many questions each holds: "Apps · 4". */
export function TopicGrid({ sections }: { sections: readonly HelpSection[] }) {
  return (
    <nav id={CONTENTS_ID} aria-label="Help topics" className="scroll-mt-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 max-sm:gap-2">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="flex h-full flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-fg/25 hover:bg-surface-2/50 max-sm:p-3"
            >
              <SectionIcon icon={section.icon} size={36} />
              <span className="text-[14px] leading-snug font-semibold">
                {section.title} <span className="font-normal text-muted">· {section.topics.length}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Phones: the sections as chips in a row that scrolls sideways, under the search. */
export function SectionChips({ sections }: { sections: readonly HelpSection[] }) {
  return (
    <nav aria-label="Help sections" className="-mx-4 lg:hidden">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <a href={`#${section.id}`} className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium whitespace-nowrap text-nav hover:bg-surface-2">
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Desktop: a slim list of the sections that stays in view down the left side. */
export function SectionRail({ sections }: { sections: readonly HelpSection[] }) {
  return (
    <nav aria-label="Sections" className="sticky top-2 hidden w-48 shrink-0 self-start max-lg:hidden lg:block">
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[13.5px] text-nav hover:bg-surface-2 hover:text-fg">
              <span className="truncate">{section.title}</span>
              <span className="text-[12px] text-muted">{section.topics.length}</span>
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
    <IconButton label={`Copy a link to “${topic.title}”`} onClick={() => void copy()} className="size-7 text-muted">
      <LinkIcon size={14} />
    </IconButton>
  );
}

/**
 * One question as an accordion row: the question and a chevron, and the short answer that opens
 * under it. The answer is always on the page (so `#id` links and the search find it) and is
 * hidden from the keyboard and screen readers while closed.
 */
export function TopicItem({ topic, open, onToggle }: { topic: HelpTopic; open: boolean; onToggle: () => void }) {
  return (
    <article id={topic.id} aria-labelledby={`${topic.id}-title`} className="scroll-mt-4 rounded-xl border border-line bg-surface target:border-accent target:shadow-[0_0_0_3px_var(--accent-soft)]">
      <h3 id={`${topic.id}-title`} className="text-[15px] leading-snug font-semibold tracking-[-0.01em]">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${topic.id}-panel`}
          onClick={onToggle}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-2/50 sm:px-5"
        >
          <span className="flex-1">{topic.title}</span>
          <ChevronRightIcon size={16} className={cn("shrink-0 text-muted transition-transform duration-200", open && "rotate-90")} />
        </button>
      </h3>
      <div
        id={`${topic.id}-panel`}
        role="region"
        aria-labelledby={`${topic.id}-title`}
        className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className={cn(READING, "flex flex-col gap-3 px-4 pb-4 sm:px-5")}>
            <HelpBlocks blocks={topic.blocks} />
            <div className="-ml-1.5">
              <CopyLink topic={topic} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** A section: its heading, the screens it is about, and its questions. */
function Section({ section, searching, open, onToggle }: { section: HelpSection; searching: boolean; open: ReadonlySet<string>; onToggle: (id: string) => void }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
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
        </div>
      </div>
      {section.id === CREW_SECTION_ID && !searching && <CrewLineup />}
      <div className="flex flex-col gap-2">
        {section.topics.map((topic) => (
          <TopicItem key={topic.id} topic={topic} open={searching || open.has(topic.id)} onToggle={() => onToggle(topic.id)} />
        ))}
      </div>
    </section>
  );
}

export function HelpScreen() {
  const [query, setQuery] = useState("");
  const typed = useDeferredValue(query);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // Auto top-up has an answer only while the server allows it.
  const autoTopUp = useAutoTopUp().data?.available === true;
  const sections = useMemo(() => helpSectionsFor({ autoTopUp }), [autoTopUp]);
  const found = useMemo(() => searchHelp(sections, typed), [sections, typed]);
  const searching = typed.trim() !== "";

  // A link to an answer (`/help#apps-gmail`, here or from another screen) opens it and scrolls to it.
  useEffect(() => {
    const show = () => {
      const id = topicIdFromHash(window.location.hash, sections);
      if (!id) return;
      setOpen((now) => (now.has(id) ? now : new Set(now).add(id)));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, [sections]);

  return (
    <Page>
      <PageHeader title="Help" />
      <PageBody className="gap-8">
        <div className="flex flex-col gap-4">
          <p className={cn(READING, "text-[15px] leading-snug text-fg-2")}>Short answers on how Textcrew works. Search, or pick a topic.</p>
          <SearchField value={query} onChange={setQuery} />
          {!searching && (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-[13px]">
              <span className="text-muted">Most asked:</span>
              {HELP_POPULAR.map((item) => (
                <a key={item.topic} href={`#${item.topic}`} className={HELP_LINK}>
                  {item.label}
                </a>
              ))}
            </div>
          )}
          <SectionChips sections={searching ? found : sections} />
        </div>
        {searching ? (
          <p role="status" className="text-[13.5px] text-muted">
            {found.length > 0 ? `${countAnswers(found)} for “${typed.trim()}”` : `No answers for “${typed.trim()}”`}
          </p>
        ) : (
          <>
            <StartSteps />
            <ContactSupport variant="compact" />
            <TopicGrid sections={sections} />
          </>
        )}
        <div className="flex items-start gap-10">
          {!searching && <SectionRail sections={sections} />}
          <div className="flex min-w-0 flex-1 flex-col gap-10">
            {found.map((section) => (
              <Section key={section.id} section={section} searching={searching} open={open} onToggle={(id) => setOpen((now) => toggled(now, id))} />
            ))}
            {searching && found.length === 0 && (
              <EmptyState
                mood="asking"
                title="No answer found"
                action={
                  <Button size="sm" onClick={() => setQuery("")}>
                    Clear the search
                  </Button>
                }
              >
                Try other words, such as Telegram, credits or approve. Or ask us:
                <ContactSupport variant="compact" className="mt-3 text-left" />
              </EmptyState>
            )}
          </div>
        </div>
        <ContactSupport />
        <p className="text-[12.5px] text-muted">
          Ask Tex about your own setup <HelpLink href={chatDraftHref(HELP_ASK_TEX)}>in the chat</HelpLink>. Our privacy policy is at{" "}
          <HelpLink href={PLACES.privacy.href}>{PLACES.privacy.label}</HelpLink>.
        </p>
      </PageBody>
    </Page>
  );
}
