import type { CSSProperties, ReactNode } from "react";
import { Brand } from "@/components/shell/brand";
import { AgentFigure, type AgentId } from "@/components/tex";
import { cn } from "@/lib/format";
import { CREW, Face, Headline, PITCH, tint } from "../frame-parts";

/** The panel's colour: Tex's deep blue, nearly black. */
const INK = "color-mix(in srgb, var(--accent-dark) 18%, var(--screen))";

/** What people text the crew, and what the crew says back. */
type Line = { from: "you"; text: string } | { from: AgentId; text: string };

const COLUMNS: readonly (readonly Line[])[] = [
  [
    { from: "you", text: "Summarise my unread email" },
    { from: "tex", text: "12 new. Two need you today." },
    { from: "you", text: "Every Monday at 9, send me my week" },
    { from: "you", text: "Draft a reply to Priya" },
    { from: "tex", text: "Drafted. Send it?" },
    { from: "you", text: "What’s on my calendar today?" },
  ],
  [
    { from: "you", text: "Review PR #142" },
    { from: "patch", text: "Approved, one small note." },
    { from: "you", text: "Tell me when my boss emails" },
    { from: "you", text: "Open a PR for the login bug" },
    { from: "byte", text: "PR #143 is open." },
    { from: "you", text: "Book a table for 4 on Friday" },
  ],
  [
    { from: "you", text: "Find flights to Goa under ₹8k" },
    { from: "scout", text: "Found 4. The cheapest is ₹6,940." },
    { from: "you", text: "Move my 3pm with Maya to tomorrow" },
    { from: "tex", text: "Moved. Maya’s note is ready." },
    { from: "you", text: "Chase the Acme invoice" },
    { from: "you", text: "Remind me to call Mum at 7" },
  ],
  [
    { from: "you", text: "Research what other tools charge" },
    { from: "scout", text: "Compared 6. Table below." },
    { from: "you", text: "Fix the typo on the pricing page" },
    { from: "byte", text: "Fixed on a branch." },
    { from: "you", text: "Turn this voice note into notes" },
    { from: "tex", text: "Filed in Notion." },
  ],
];

function Bubble({ line }: { line: Line }) {
  if (line.from === "you") {
    return <p className="self-end rounded-[16px] rounded-br-[5px] border border-white/[0.06] bg-white/[0.06] px-3.5 py-2 whitespace-nowrap text-white/45">{line.text}</p>;
  }
  return (
    <p
      className="flex items-center gap-2 self-start rounded-[16px] rounded-bl-[5px] py-1.5 pr-3.5 pl-1.5 whitespace-nowrap text-white/55"
      style={{ background: tint(line.from, 18, "transparent"), boxShadow: `inset 0 0 0 1px ${tint(line.from, 24, "transparent")}` }}
    >
      <Face id={line.from} size={22} />
      {line.text}
    </p>
  );
}

/**
 * A wall of the things people text the crew, turned slightly and drifting up. Each column is drawn
 * `copies` times and drifts up by one copy before starting over, so the drift never jumps.
 * Decoration only.
 */
function ChatWall({ copies, className }: { copies: number; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute flex gap-4 text-[14px]", className)} style={{ rotate: "-12deg", ["--wall-copies" as string]: copies }}>
      {COLUMNS.map((column, index) => (
        <div key={index} className={cn("flex w-[300px] shrink-0 flex-col", index % 2 ? "chat-wall-drift-slow" : "chat-wall-drift")} style={{ marginTop: index * -96 }}>
          {Array.from({ length: copies }, (_, copy) => (
            <div key={copy} className="flex flex-col gap-3 pb-3">
              {column.map((line, at) => (
                <Bubble key={at} line={line} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The crew in front of the wall, each lit by a glow of its own colour, on a pool of light. */
function GlowingCrew({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative", className)}>
      <span className="absolute inset-x-[-8%] bottom-[2%] h-[38%] rounded-[50%] blur-2xl" style={{ background: `radial-gradient(closest-side, ${tint("tex", 55, "transparent")}, transparent)` }} />
      <ul className="relative flex h-full items-end justify-center">
        {CREW.map((member) => (
          <li key={member.id} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="absolute inset-x-[-14%] bottom-[14%] h-[80%] rounded-full blur-2xl" style={{ background: `radial-gradient(closest-side, ${tint(member.id, 90, "transparent")}, ${tint(member.id, 30, "transparent")} 60%, transparent)` }} />
            <span
              className={cn("relative flex shrink-0", member.id === "tex" ? "h-[calc(100%-36px)]" : "h-[calc(82%-36px)]")}
              style={{ filter: `drop-shadow(0 0 18px ${tint(member.id, 70, "transparent")})` }}
            >
              <AgentFigure who={member.id} mood="ready" label="" className="h-full w-auto" />
            </span>
            <span className="relative mt-1.5 flex h-[30px] flex-col items-center text-[12.5px] leading-tight">
              <span className="font-semibold text-white">{member.name}</span>
              <span className="text-white/60">{member.role}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The right half's paper: the warm off-white of the app's desk, with a faint dot grid. */
const PAPER: CSSProperties = {
  backgroundColor: "var(--surface-2)",
  backgroundImage: "radial-gradient(color-mix(in srgb, var(--fg) 9%, transparent) 1px, transparent 1px)",
  backgroundSize: "20px 20px",
};

/**
 * Chat wall: on a wide screen the left half is Tex's deep blue with a wall of things people text
 * the crew, turned slightly and dimmed, the line from textcrew.in over it and the crew standing in
 * front, each glowing in its colour. The form is on warm paper on the right. On a phone the wall
 * is a band at the top with the lockup and the crew's faces, and the form is on the paper below.
 */
export function ChatWallFrame({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-pane flex h-dvh flex-col overflow-y-auto lg:flex-row lg:overflow-hidden" style={PAPER}>
      {/* A phone: the wall as a band, with the lockup and the crew's faces. */}
      <div className="relative isolate h-[132px] shrink-0 overflow-hidden px-5 pt-5 md:px-8 lg:hidden" style={{ background: INK }}>
        <ChatWall copies={2} className="-top-16 left-[-40px] -z-20 opacity-60" />
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: `radial-gradient(75% 70% at 22% 72%, ${INK} 40%, transparent)` }} />
        <div className="flex items-center justify-between">
          <Brand onColour />
          <span aria-hidden className="flex -space-x-1.5">
            {CREW.map((member) => (
              <Face key={member.id} id={member.id} size={26} className="ring-2" style={{ boxShadow: `0 0 16px ${tint(member.id, 70, "transparent")}`, ["--tw-ring-color" as string]: INK }} />
            ))}
          </span>
        </div>
        <Headline className="mt-4 text-[22px] leading-[1.1] font-semibold tracking-[-0.03em] text-white" />
      </div>

      <aside className="relative isolate hidden w-1/2 shrink-0 flex-col overflow-hidden text-white lg:flex" style={{ background: INK }}>
        <ChatWall copies={6} className="top-[-24%] left-[-14%] -z-20 opacity-55 [mask-image:linear-gradient(to_bottom,transparent_6%,black_32%,black_56%,rgb(0_0_0/0.4)_80%)]" />
        {/* Darker where the words are, so they read over the wall, and under the crew, so they stand out. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background: [
              `radial-gradient(100% 46% at 16% 27%, ${INK} 45%, transparent)`,
              `linear-gradient(to top, ${INK} 6%, transparent 40%)`,
              `radial-gradient(70% 45% at 100% 0%, ${tint("tex", 30, "transparent")}, transparent)`,
            ].join(", "),
          }}
        />
        <div aria-hidden className="auth-grain absolute inset-0 -z-10 opacity-[0.14] mix-blend-soft-light" />

        <div className="mx-auto flex h-full w-full max-w-[640px] flex-col px-12 py-9 xl:px-14 [@media(max-height:820px)]:py-7">
          <div className="shrink-0">
            <Brand onColour />
          </div>
          <div className="mt-[clamp(28px,9vh,104px)] flex shrink-0 flex-col gap-4">
            <Headline className="text-[clamp(36px,min(3.6vw,6.2vh),56px)] leading-[1.04] font-semibold tracking-[-0.035em]" />
            <p className="max-w-[44ch] text-[15.5px] leading-relaxed text-white/75">{PITCH}</p>
          </div>
          {/* The crew stands at the bottom; the figures grow with the window's height. */}
          <GlowingCrew className="mt-auto h-[calc(clamp(110px,22vh,220px)+36px)] min-h-[150px] [@media(max-height:560px)]:hidden" />
        </div>
      </aside>

      {/* The form on a white sheet on the desk, as the app's screens are; on a phone, on the desk itself. */}
      <main className="flex min-w-0 flex-1 flex-col px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8 lg:overflow-y-auto lg:p-12">
        <div className="mx-auto w-full max-w-[400px] lg:my-auto lg:max-w-[480px] lg:rounded-[24px] lg:border lg:border-line lg:bg-surface lg:px-10 lg:py-10 lg:shadow-[0_1px_2px_rgb(21_21_21/0.04),0_30px_60px_-30px_rgb(21_21_21/0.22)]">
          <div className="mx-auto w-full max-w-[400px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
