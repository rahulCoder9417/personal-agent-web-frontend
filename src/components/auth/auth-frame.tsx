import type { CSSProperties, ReactNode } from "react";
import { Brand } from "@/components/shell/brand";
import { AgentFigure, type AgentId } from "@/components/tex";
import { ButtonLink, EmptyState } from "@/components/ui";

// Each member's own colour, from the design tokens, as on the crew page.
const COLOUR: Record<AgentId, string> = { tex: "var(--accent)", byte: "var(--byte)", patch: "var(--patch)", scout: "var(--scout)" };
const wash = (id: AgentId, strength = 16): CSSProperties => ({ background: `color-mix(in srgb, ${COLOUR[id]} ${strength}%, var(--surface))` });

const CREW: readonly { id: AgentId; name: string; role: string }[] = [
  { id: "tex", name: "Tex", role: "captain" },
  { id: "byte", name: "Byte", role: "code" },
  { id: "patch", name: "Patch", role: "code review" },
  { id: "scout", name: "Scout", role: "research" },
];

/** A face in a round tile of its own colour. */
function Face({ id, size = 22 }: { id: AgentId; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ ...wash(id), width: size, height: size }}>
      <AgentFigure who={id} glyph size={Math.round(size * 0.72)} label="" />
    </span>
  );
}

/**
 * What Textcrew is, beside the form on a wide screen: the line from textcrew.in, a job as it looks
 * in the chat (you ask, the crew works, Tex waits for your OK), and the crew itself.
 */
function BrandPanel() {
  return (
    <aside className="relative m-2 mr-0 hidden w-[46%] max-w-[620px] shrink-0 flex-col overflow-hidden rounded-[18px] bg-accent-soft lg:flex">
      <div className="flex h-14 shrink-0 items-center px-7">
        <Brand />
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-7 px-10 py-6 xl:px-14">
        <div className="flex flex-col gap-3.5">
          <p className="text-[12.5px] font-semibold text-accent-dark">Your crew</p>
          <h2 className="text-[clamp(28px,2.6vw,36px)] leading-[1.06] font-semibold tracking-[-0.03em]">
            Got a lot of work?
            <br />
            Just text your crew.
          </h2>
          <p className="max-w-[46ch] text-[15px] leading-relaxed text-fg-2">
            Send one message from the web app or Telegram. Tex, your captain, splits the job, hands each part to the right specialist and checks
            with you before anything risky.
          </p>
        </div>

        {/* A job, the way the chat shows it. Decoration: the sentence above says it in words. */}
        <div aria-hidden className="flex max-w-[400px] flex-col gap-2.5 rounded-2xl bg-surface p-4 shadow-soft">
          <p className="max-w-[85%] self-end rounded-[14px] rounded-br-[5px] bg-surface-2 px-3.5 py-2 text-[13.5px]">
            Chase the Acme invoice and book a follow-up on Friday.
          </p>
          <div className="flex items-start gap-2.5">
            <Face id="tex" size={26} />
            <div className="flex min-w-0 flex-col items-start gap-2">
              <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <span className="size-1.5 rounded-full bg-online" />
                Tex · read 3 emails, checked your calendar
              </p>
              <p className="text-[13.5px]">Found it, unpaid since the 2nd. The reminder is ready and Friday at 10 is free. Send it?</p>
              <span className="inline-flex h-[22px] items-center rounded-md bg-accent-soft px-2 text-[12px] font-medium text-accent-dark">
                Waiting for your OK
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* The line-up, as on the crew page: the lead in front, the specialists beside it. */}
      <div aria-hidden className="flex items-end gap-6 px-10 xl:px-14">
        <ul className="mb-7 flex shrink-0 flex-col gap-1.5 text-[12.5px] whitespace-nowrap">
          {CREW.map((member) => (
            <li key={member.id} className="flex items-center gap-2">
              <span className="size-2 rounded-[2px]" style={{ background: COLOUR[member.id] }} />
              <span className="font-semibold">{member.name}</span>
              <span className="text-muted">{member.role}</span>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex w-[min(100%,330px)] items-end justify-center">
          <AgentFigure who="tex" mood="ready" size={150} label="" className="relative z-10 -mr-[9%] h-auto w-[44%]" />
          {CREW.slice(1).map((member) => (
            <AgentFigure key={member.id} who={member.id} mood="ready" size={110} label="" className="-mx-[5%] h-auto w-[30%]" />
          ))}
        </div>
      </div>
    </aside>
  );
}

/**
 * The page around a sign-in form. On a wide screen, what Textcrew is on the left and the form on
 * the right; on a phone, the lockup and the form in one column. The column is centred when there
 * is room and starts from the top (and scrolls) when the keyboard takes it.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh bg-surface">
      <BrandPanel />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-5 lg:hidden">
          <Brand />
          <span aria-hidden className="flex -space-x-1.5">
            {CREW.map((member) => (
              <span key={member.id} className="rounded-full ring-2 ring-surface">
                <Face id={member.id} size={24} />
              </span>
            ))}
          </span>
        </header>
        <main className="scroll-pane flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8">
          <div className="mx-auto my-auto w-full max-w-[380px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * The sign-in pages of a build without sign-in (demo mode, the development token). The proxy leads
 * to the home screen before this is shown; it is only seen when the server has the Clerk keys and
 * the build didn't, and it says so instead of sending the browser round in circles.
 */
export function NoSignIn() {
  return (
    <AuthFrame>
      <EmptyState
        mood="paused"
        title="Sign-in isn’t part of this build"
        action={
          <ButtonLink href="/" variant="primary" size="lg">
            Open Textcrew
          </ButtonLink>
        }
      >
        The app was built without the Clerk keys. Build it again with them set to turn sign-in on.
      </EmptyState>
    </AuthFrame>
  );
}
