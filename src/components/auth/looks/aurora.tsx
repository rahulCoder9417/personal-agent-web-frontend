import type { CSSProperties, ReactNode } from "react";
import { Brand } from "@/components/shell/brand";
import { AgentFigure, type AgentId } from "@/components/tex";
import { cn } from "@/lib/format";
import { CREW_COLOUR, Face, Headline, PITCH, tint } from "../frame-parts";

/** The night sky the page is drawn on: Tex's deep blue, nearly black. */
export const NIGHT = "color-mix(in srgb, var(--accent-dark) 20%, var(--screen))";

/**
 * The lights: a band of the crew's colours sweeping up across the sky, from Scout's teal at the
 * bottom left, through Tex's blue under the example job, to Byte's violet behind the form and a
 * touch of Patch's amber at the top right. Each light is a long soft cloud, turned along the band
 * and drifting slowly. Placed in percent of the box they light, so the same sky fits the whole
 * page and the phone's header band.
 */
const LIGHTS: readonly { id: AgentId; strength: number; box: CSSProperties; drift: string }[] = [
  { id: "scout", strength: 100, box: { left: "-16%", top: "60%", width: "56%", height: "52%", rotate: "-18deg" }, drift: "aurora-drift-c" },
  { id: "tex", strength: 100, box: { left: "-4%", top: "30%", width: "76%", height: "52%", rotate: "-24deg" }, drift: "aurora-drift-a" },
  { id: "byte", strength: 100, box: { left: "44%", top: "-12%", width: "70%", height: "78%", rotate: "-30deg" }, drift: "aurora-drift-b" },
  { id: "patch", strength: 100, box: { left: "76%", top: "-18%", width: "32%", height: "40%", rotate: "-20deg" }, drift: "aurora-drift-c" },
]

/** The same lights for a phone's header band: wide and short, so they lie flatter and closer. */
const BAND_LIGHTS: typeof LIGHTS = [
  { id: "scout", strength: 100, box: { left: "-24%", top: "35%", width: "60%", height: "110%", rotate: "-10deg" }, drift: "aurora-drift-c" },
  { id: "tex", strength: 100, box: { left: "8%", top: "28%", width: "68%", height: "120%", rotate: "-14deg" }, drift: "aurora-drift-a" },
  { id: "byte", strength: 100, box: { left: "52%", top: "-30%", width: "66%", height: "120%", rotate: "-14deg" }, drift: "aurora-drift-b" },
  { id: "patch", strength: 100, box: { left: "84%", top: "-50%", width: "36%", height: "90%", rotate: "-10deg" }, drift: "aurora-drift-c" },
];

/** The sky, its lights and a fine grain over them. Decoration only. */
export function AuroraSky({ band = false, className }: { band?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn("overflow-hidden", className)} style={{ background: NIGHT }}>
      {(band ? BAND_LIGHTS : LIGHTS).map((light) => (
        <div
          key={light.id}
          className={cn("absolute rounded-full mix-blend-screen blur-[40px]", light.drift)}
          style={{
            ...light.box,
            background: `radial-gradient(closest-side, ${tint(light.id, light.strength, "transparent")} 10%, ${tint(light.id, Math.round(light.strength * 0.55), "transparent")} 50%, transparent)`,
          }}
        />
      ))}
      {/* A faint dot grid in the dark above the band, as on textcrew.in. */}
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.14)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(70%_60%_at_0%_0%,black,transparent)]" />
      <div className="auth-grain absolute inset-0 opacity-[0.18] mix-blend-soft-light" />
    </div>
  );
}

/** The crew looking over the top edge of the form's card. Placed by the card, which hides their bodies. */
const PEEKERS: readonly { id: AgentId; scale: number }[] = [
  { id: "scout", scale: 0.84 },
  { id: "byte", scale: 0.9 },
  { id: "tex", scale: 1 },
  { id: "patch", scale: 0.86 },
];

/**
 * The crew's heads over the edge, or (`hands`) their hands holding on to it, which are drawn on top
 * of the card. Both rows are laid out alike, so each pair of hands sits under its own head.
 */
function Peekers({ size, hands = false, className }: { size: number; hands?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none flex justify-center", hands ? "items-start" : "items-end", className)}>
      {PEEKERS.map((member) => {
        const height = Math.round(size * member.scale);
        // The heads stand close, as if they were looking over a wall together.
        const place: CSSProperties = { width: height, marginInline: -height * 0.17 };
        if (hands) {
          const hand: CSSProperties = { width: height * 0.08, height: height * 0.07, background: `color-mix(in srgb, ${CREW_COLOUR[member.id]} 78%, var(--screen))` };
          return (
            <div key={member.id} className="relative shrink-0" style={place}>
              <span className="absolute left-[29%] -translate-y-1/2 rounded-[35%]" style={hand} />
              <span className="absolute right-[29%] -translate-y-1/2 rounded-[35%]" style={hand} />
            </div>
          );
        }
        // The edge crosses the face under the eyes (the drawing's head is 11% to 50% down).
        return (
          <div key={member.id} className="shrink-0" style={{ ...place, marginBottom: -height * 0.56 }}>
            <AgentFigure who={member.id} mood={member.id === "tex" ? "ready" : "auto"} size={height} label="" />
          </div>
        );
      })}
    </div>
  );
}

/** "your crew." lit in the crew's colours, lightened to read on the night sky. */
const CREW_TEXT =
  "bg-clip-text text-transparent [background-image:linear-gradient(95deg,color-mix(in_srgb,var(--accent)_45%,var(--surface)),color-mix(in_srgb,var(--byte)_45%,var(--surface))_55%,color-mix(in_srgb,var(--scout)_40%,var(--surface)))]";

/** A job as the chat shows it, on frosted glass: you ask, the crew works, Tex waits for your OK. */
function GlassJob() {
  return (
    <div className="flex w-full max-w-[470px] flex-col gap-3 rounded-[20px] border border-white/12 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_30px_60px_-30px_rgb(0_0_0/0.6)] backdrop-blur-xl">
      <p className="max-w-[88%] self-end rounded-[14px] rounded-br-[5px] bg-surface px-3.5 py-2 text-[13.5px] text-fg">
        Fix the flaky login test, and have Patch check it.
      </p>
      <ul className="flex flex-col gap-1.5 text-[12.5px] text-white/65">
        <li className="flex items-center gap-2">
          <Face id="byte" size={20} />
          <span>
            <span className="font-medium text-white/90">Byte</span> · fixed it in PR #142: the test waited on a timer
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Face id="patch" size={20} />
          <span>
            <span className="font-medium text-white/90">Patch</span> · reviewed: looks good, one small note
          </span>
        </li>
      </ul>
      <div className="flex items-start gap-2.5">
        <Face id="tex" size={26} />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p className="text-[13.5px] text-white/90">All green. Merge it into main?</p>
          <span className="inline-flex h-[22px] items-center gap-1.5 rounded-md bg-white/12 px-2 text-[12px] font-medium text-white">
            <span className="size-1.5 rounded-full" style={{ background: tint("patch", 100) }} />
            Waiting for your OK
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Aurora: the whole page is one night sky with the crew's colours glowing in it. On a wide screen
 * the line from textcrew.in and a job on frosted glass sit on the left, the form in a white card on
 * the right with the crew looking over its top edge. On a phone the sky is a band at the top and
 * the form is on a white sheet below it, the crew looking over the sheet's edge.
 */
export function AuroraFrame({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-pane relative isolate h-dvh overflow-y-auto bg-surface lg:bg-transparent">
      <AuroraSky className="fixed inset-0 -z-10 hidden lg:block" />

      <div className="flex min-h-full flex-col lg:relative lg:mx-auto lg:max-w-[1320px] lg:px-12 xl:px-16">
        {/* A phone: the sky as a band, with the lockup and the line. */}
        <div className="relative isolate overflow-hidden px-5 pt-5 pb-[72px] md:px-8 lg:hidden">
          <AuroraSky band className="absolute inset-0 -z-10" />
          <Brand onColour />
          <Headline className="mt-5 text-[25px] leading-[1.08] font-semibold tracking-[-0.03em] text-white" crewClassName={CREW_TEXT} />
        </div>

        {/* Above the content rather than in its way, so the form is centred in the whole height. */}
        <header className="absolute top-0 hidden h-24 items-center lg:flex">
          <Brand onColour />
        </header>

        {/* Room at the top for the crew looking over the card. */}
        <div className="relative z-0 flex flex-1 flex-col lg:flex-row lg:items-center lg:gap-14 lg:pt-[clamp(72px,11vh,104px)] lg:pb-6 xl:gap-20">
          <section className="hidden min-w-0 flex-1 flex-col gap-[clamp(24px,4.5vh,44px)] text-white lg:flex">
            <div className="flex flex-col gap-4">
              <Headline
                className="text-[clamp(40px,min(4.3vw,7vh),66px)] leading-[1.02] font-semibold tracking-[-0.04em]"
                crewClassName={CREW_TEXT}
              />
              <p className="max-w-[44ch] text-[16px] leading-relaxed text-white/70">{PITCH}</p>
            </div>
            <div aria-hidden className="[@media(max-height:700px)]:hidden">
              <GlassJob />
            </div>
          </section>

          {/* The form: on a white card on a wide screen, on a white sheet on a phone. */}
          <div className="relative -mt-6 flex flex-1 flex-col rounded-t-[28px] bg-surface lg:mt-0 lg:w-[440px] lg:flex-none lg:rounded-[24px] lg:shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_40px_90px_-30px_rgb(0_0_0/0.7)] xl:w-[460px]">
            <Peekers size={100} className="absolute inset-x-0 bottom-full lg:hidden" />
            <Peekers size={100} hands className="absolute inset-x-0 top-0 z-20 lg:hidden" />
            <Peekers size={150} className="absolute inset-x-0 bottom-full hidden lg:flex [@media(max-height:640px)]:lg:hidden" />
            <Peekers size={150} hands className="absolute inset-x-0 top-0 z-20 hidden lg:flex [@media(max-height:640px)]:lg:hidden" />
            {/* Above the crew's bodies, which hang behind the card. */}
            <main className="relative z-10 flex flex-1 flex-col rounded-[inherit] bg-surface px-5 pt-9 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8 lg:px-10 lg:py-10">
              <div className="mx-auto w-full max-w-[400px]">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
