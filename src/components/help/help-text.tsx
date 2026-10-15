import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { chatDraftHref } from "@/lib/chat-link";
import { cn } from "@/lib/format";
import { groupAsks, isExternal, parseInline, type HelpBlock } from "@/lib/help";

// How a piece of help is drawn: its sentences (with their links, bold words and code), and its
// blocks (paragraphs, steps, lists, tables, things to try, notes). The words are in
// src/lib/help-content.ts.

export const HELP_LINK = "font-medium text-accent underline-offset-2 hover:text-accent-dark hover:underline";

/** A link in a sentence: another page of the app, a part of this page (`#ai`), or a site outside (new tab). */
export function HelpLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cn(HELP_LINK, className)}>
        {children}
      </a>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a href={href} className={cn(HELP_LINK, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cn(HELP_LINK, className)}>
      {children}
    </Link>
  );
}

/** One sentence of help, with its markup drawn. */
export function HelpInline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((piece, index) => {
        switch (piece.type) {
          case "bold":
            return (
              <strong key={index} className="font-semibold text-fg">
                {piece.text}
              </strong>
            );
          case "code":
            return (
              <code key={index} className="rounded-[5px] bg-surface-2 px-1 py-px font-mono text-[0.9em] text-fg">
                {piece.text}
              </code>
            );
          case "link":
            return (
              <HelpLink key={index} href={piece.href}>
                {piece.text}
              </HelpLink>
            );
          default:
            return <Fragment key={index}>{piece.text}</Fragment>;
        }
      })}
    </>
  );
}

const TEXT = "text-[13.5px] leading-[1.55] text-fg-2";

/** Messages to send Tex, each with a link that opens the chat with it typed in (nothing is sent). */
function Asks({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-2 px-3.5 py-3">
      <span className="text-[11.5px] text-muted">Try asking Tex</span>
      {items.map((text) => (
        <div key={text} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="min-w-0 text-[13.5px]">“{text}”</p>
          <Link href={chatDraftHref(text)} aria-label={`Try it in chat: ${text}`} className="shrink-0 text-[12.5px] font-medium text-accent hover:text-accent-dark">
            Try it →
          </Link>
        </div>
      ))}
    </div>
  );
}

/** The blocks of one answer, one under another. Examples that follow each other share a box. */
export function HelpBlocks({ blocks }: { blocks: readonly HelpBlock[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groupAsks(blocks).map((block, index) => {
        switch (block.kind) {
          case "p":
            return (
              <p key={index} className={TEXT}>
                <HelpInline text={block.text} />
              </p>
            );
          case "steps":
            return (
              <ol key={index} className="flex flex-col gap-2">
                {block.items.map((item, step) => (
                  <li key={step} className={cn("flex gap-2.5", TEXT)}>
                    <span
                      aria-hidden
                      className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent-dark tabular-nums"
                    >
                      {step + 1}
                    </span>
                    <span className="min-w-0">
                      <HelpInline text={item} />
                    </span>
                  </li>
                ))}
              </ol>
            );
          case "list":
            return (
              <ul key={index} className="flex flex-col gap-1.5">
                {block.items.map((item, line) => (
                  <li key={line} className={cn("flex gap-2.5", TEXT)}>
                    <span aria-hidden className="mt-[9px] size-[5px] shrink-0 rounded-full bg-muted/60" />
                    <span className="min-w-0">
                      <HelpInline text={item} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={index} className="overflow-hidden rounded-lg border border-line">
                <table className="w-full border-collapse text-left text-[13px] leading-[1.5]">
                  <thead className="bg-surface-2/70 text-[12px] text-muted">
                    <tr>
                      <th scope="col" className="w-[36%] px-3 py-2 font-medium">
                        {block.head[0]}
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {block.head[1]}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map(([thing, meaning], row) => (
                      <tr key={row} className="border-t border-line align-top">
                        <td className="px-3 py-2.5 text-fg [overflow-wrap:anywhere]">
                          <HelpInline text={thing} />
                        </td>
                        <td className="px-3 py-2.5 text-fg-2 [overflow-wrap:anywhere]">
                          <HelpInline text={meaning} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "asks":
            return <Asks key={index} items={block.items} />;
          case "note":
            return (
              <p key={index} className="border-l-2 border-line-strong pl-3 text-[12.5px] leading-[1.5] text-muted">
                <HelpInline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
