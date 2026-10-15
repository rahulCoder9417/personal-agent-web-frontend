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

/**
 * The panel's colour: Tex's blue, lit from the top and deepening towards the bottom, where the
 * crew stands (Tex is drawn in that blue, so the floor under the line-up is darker than he is).
 */
const PANEL: CSSProperties = {
  backgroundColor: "var(--accent-dark)",
  backgroundImage: [
    "radial-gradient(55% 32% at 50% 86%, color-mix(in srgb, var(--accent) 55%, transparent) 0%, transparent 100%)",
    "radial-gradient(60% 40% at 0% 0%, color-mix(in srgb, var(--accent) 80%, var(--surface)) 0%, transparent 100%)",
    "linear-gradient(180deg, var(--accent) 0%, var(--accent-dark) 52%, color-mix(in srgb, var(--accent-dark) 42%, var(--screen)) 100%)",
  ].join(", "),
};

/** A face in a round tile of its own colour. */
function Face({ id, size = 22 }: { id: AgentId; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ ...wash(id), width: size, height: size }}>
      <AgentFigure who={id} glyph size={Math.round(size * 0.72)} label="" />
    </span>
  );
}

/** A job, the way the chat shows it: you ask, Tex works, and waits for your OK before acting. */
function ExampleJob() {
  return (
    <div className="flex w-full flex-col gap-2.5 rounded-2xl bg-surface p-4 text-fg shadow-[0_24px_48px_-20px_rgb(21_21_21/0.55)] [@media(max-height:820px)]:gap-2 [@media(max-height:820px)]:p-3.5">
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
  );
}

/**
 * The crew standing in a row on one line, each with its name and what it does underneath. The
 * figures are as tall as the row, which the panel sets from the window's height.
 */
function CrewLineup() {
  return (
    <ul className="flex h-full">
      {CREW.map((member) => (
        <li key={member.id} className="flex min-w-0 flex-1 flex-col">
          {/* The line they stand on: each column draws its stretch of it. The figure is moved down by
              the room under its feet in the drawing, so the feet touch the line. */}
          <div className="flex min-h-0 flex-1 items-end justify-center border-b border-white/25">
            <AgentFigure
              who={member.id}
              mood="ready"
              label=""
              className={member.id === "tex" ? "h-full w-auto shrink-0 translate-y-[7.3%]" : "h-[80%] w-auto shrink-0 translate-y-[7.3%]"}
            />
          </div>
          <p className="mt-3 flex shrink-0 flex-col items-center text-center text-[12.5px] leading-tight">
            <span className="font-semibold text-white">{member.name}</span>
            <span className="text-white/65">{member.role}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * What Textcrew is, on the left half of a wide screen: the lockup, the line from textcrew.in, a job
 * as the chat shows it, and the crew standing along the bottom. Decoration: the words say it all,
 * so only the headline and the line under it are read out. Short windows lose the example job.
 */
function BrandPanel() {
  return (
    <aside className="relative isolate hidden w-1/2 shrink-0 flex-col overflow-hidden text-white lg:flex" style={PANEL}>
      {/* A fine dot grid, fading out downwards, as on textcrew.in. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.16)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-[size:22px_22px]"
      />

      <div className="mx-auto flex h-full w-full max-w-[640px] flex-col px-12 py-9 xl:px-14 [@media(max-height:820px)]:py-7">
        <div className="shrink-0">
          <Brand onColour />
        </div>

        {/* Centred in the room the lockup and the crew leave. */}
        <div className="my-auto flex shrink-0 flex-col gap-[clamp(20px,4.5vh,44px)] py-[clamp(20px,4vh,40px)]">
          <div className="flex flex-col gap-3.5">
            <h2 className="text-[clamp(30px,min(3.2vw,5.4vh),48px)] leading-[1.06] font-semibold tracking-[-0.03em]">
              Got a lot of work?
              <br />
              Just text your crew.
            </h2>
            <p className="max-w-[44ch] text-[15.5px] leading-relaxed text-white/80">
              Send one message. Tex, your captain, hands each part to the right specialist and checks with you before anything risky.
            </p>
          </div>
          <div aria-hidden className="[@media(max-height:620px)]:hidden [@media(max-width:1279px)_and_(max-height:660px)]:hidden">
            <ExampleJob />
          </div>
        </div>

        {/* The figures grow with the window's height and, where the room runs out, give way first. */}
        <div aria-hidden className="h-[calc(clamp(96px,19vh,196px)+44px)] min-h-[140px] [@media(max-height:480px)]:hidden">
          <CrewLineup />
        </div>
      </div>
    </aside>
  );
}

/**
 * The page around a sign-in form. On a wide screen it is split in half: what Textcrew is on the
 * left, the form centred in the right half. On a phone, the lockup with the crew's faces and the
 * form in one column. The form is centred when there is room and starts from the top (and
 * scrolls) when the keyboard takes it.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh bg-surface">
      <BrandPanel />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 md:px-8 lg:hidden">
          <Brand />
          <span aria-hidden className="flex -space-x-1.5">
            {CREW.map((member) => (
              <span key={member.id} className="rounded-full ring-2 ring-surface">
                <Face id={member.id} size={24} />
              </span>
            ))}
          </span>
        </header>
        <main className="scroll-pane flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8 lg:p-12">
          <div className="m-auto w-full max-w-[400px]">{children}</div>
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
