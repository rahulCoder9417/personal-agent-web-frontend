"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApps, useMe } from "@/lib/api/hooks";
import { appChoices, EDITOR_TEMPLATES, emptyEditor, type EditorParts } from "@/lib/automation-editor";
import { AUTOMATION_KINDS } from "@/lib/automations";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { ChatIcon } from "../icons";
import { PageBody, READING } from "../page";
import { ButtonLink, SectionLabel } from "../ui";
import { AutomationEditor } from "./automation-editor";
import { BackToAutomations } from "./automation-screen";
import { KindBadge } from "./kind-icon";
import { EditorTemplateCards } from "./templates";

/** The five boxes, in a line each, for someone who has never built one. */
const HOW = [
  { title: "When it runs", body: "Once, on a schedule, or when something happens in an app." },
  { title: "What Tex does", body: "In your own words, as you would ask in chat." },
  { title: "Apps Tex may use", body: "Any connected app, or only the ones you pick." },
  { title: "Asks you first", body: "Sending, deleting or paying always waits for your OK." },
  { title: "Results", body: "Every run answers in your Automations chat." },
];

/**
 * `/automations/new` without a draft: an empty canvas to build one by hand, box by box, with a few
 * templates that fill it (`?template=` opens with one filled in, from the list's empty state), and
 * the other way in, asking Tex in chat.
 */
export function NewAutomation({ templateId = null }: { templateId?: string | null }) {
  const me = useMe();
  const apps = useApps();
  const zone = me.data?.timezone;
  const empty = useMemo(() => (zone ? emptyEditor(zone) : null), [zone]);
  const asked = EDITOR_TEMPLATES.find((item) => item.id === templateId) ?? null;
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const chosenId = picked === undefined ? (asked?.id ?? null) : picked;
  const template = useMemo<{ id: string; start: EditorParts } | null>(() => {
    const item = EDITOR_TEMPLATES.find((entry) => entry.id === chosenId);
    return item && empty ? { id: item.id, start: item.fill(empty) } : null;
  }, [chosenId, empty]);
  const usable = new Set(appChoices(apps.data).usable.map((app) => app.slug));

  return (
    <PageBody className="gap-6">
      <BackToAutomations />
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-[20px] leading-tight font-semibold tracking-[-0.015em]">A new automation</h2>
          <p className={cn("text-[14px] text-muted", READING)}>
            Build it box by box: when it runs, what Tex does, the apps it may use, when it asks you first, and where the results go. Each box is checked as you
            fill it in. Nothing runs until you save; Save paused lets you try it first with Run once now.
          </p>
        </div>
        <ol aria-label="The five boxes" className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-2 border-t border-line pt-4">
          {HOW.map((item, index) => (
            <li key={item.title} className="flex min-w-0 gap-2.5">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[11.5px] font-semibold text-nav tabular-nums ring-1 ring-line ring-inset">
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-semibold">{item.title}</span>
                <span className="text-[12px] text-muted">{item.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <section aria-labelledby="editor-templates" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionLabel className="text-[15px]">
            <span id="editor-templates">Start from a template</span>
          </SectionLabel>
          <p className="text-[12.5px] text-muted">
            A template fills the boxes; change anything after.{" "}
            {template && (
              <button type="button" className="font-medium text-accent hover:text-accent-dark" onClick={() => setPicked(null)}>
                Start empty instead
              </button>
            )}
            {apps.isSuccess && usable.size === 0 && (
              <>
                {" "}
                <Link href={INTEGRATIONS_APPS_PATH} className="font-medium text-accent hover:text-accent-dark">
                  Connect an app
                </Link>{" "}
                to use app events.
              </>
            )}
          </p>
        </div>
        <EditorTemplateCards selected={template?.id ?? null} onPick={(item) => setPicked(item.id)} />
      </section>

      {empty && zone ? (
        <AutomationEditor key={template?.id ?? "empty"} target={{ kind: "new" }} start={template?.start ?? empty} accountZone={zone} revealProblems={Boolean(template)} />
      ) : (
        <span aria-hidden className="h-[320px] animate-pulse rounded-2xl bg-surface-2" />
      )}

      <section aria-labelledby="ask-tex-instead" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 id="ask-tex-instead" className="text-[14.5px] font-semibold">
              Rather say it in words?
            </h3>
            <p className="text-[13px] text-muted">Tell Tex what to do and when. Tex shows it back as a draft to check and save.</p>
          </div>
          <ButtonLink href="/">
            <ChatIcon size={15} />
            Ask Tex in chat
          </ButtonLink>
        </div>
        <ul aria-label="Requests to start from" className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2">
          {AUTOMATION_KINDS.map((guide) => (
            <li key={guide.kind}>
              <Link
                href={chatDraftHref(guide.example)}
                className="flex h-full gap-3 rounded-xl border border-line bg-surface-2/50 p-3 transition-colors hover:border-line-strong hover:bg-surface-2"
                aria-label={`Try it in chat: ${guide.example}`}
              >
                <KindBadge kind={guide.kind} size={32} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{guide.name}</span>
                  <span className="text-[12.5px] text-fg-2">
                    “{guide.example}” <span className="font-medium whitespace-nowrap text-accent">Try it →</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageBody>
  );
}
