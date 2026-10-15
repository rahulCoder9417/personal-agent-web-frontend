import type { CSSProperties, ReactNode } from "react";
import { BrandIcon } from "@/components/brand-icon";
import { Brand } from "@/components/shell/brand";
import { AgentFigure, type AgentId } from "@/components/tex";
import { cn } from "@/lib/format";
import { CREW, Face } from "../frame-parts";

/** textcrew.in's page colour: the app's warm paper, lightened halfway to white. */
const PAGE = "color-mix(in srgb, var(--bg) 40%, var(--surface))";

/** The faint dot grid behind textcrew.in's hero, fading out downwards. */
const DOT_GRID = "absolute inset-x-0 top-0 bg-[radial-gradient(rgb(21_21_21/0.09)_1px,transparent_1px)] bg-[size:18px_18px] [mask-image:linear-gradient(to_bottom,black_20%,transparent_85%)]";

/**
 * The apps floating around textcrew.in's hero, on white tiles, bobbing gently. Placed in the
 * page's side gutters and the gap between the columns, where nothing else is; the ones in the
 * gutters only once the page is wider than its content (from 1280px), so none is cut off.
 */
const FLOATING: readonly { app: string; place: string; float: string }[] = [
  { app: "gmail", place: "-left-1 top-[19%] max-xl:hidden", float: "auth-float-a" },
  { app: "calendar", place: "left-[2%] top-[87%]", float: "auth-float-b" },
  { app: "notion", place: "left-[45%] top-[10%]", float: "auth-float-c" },
  { app: "github", place: "-right-1 top-[12%] max-xl:hidden", float: "auth-float-b" },
  { app: "telegram", place: "-right-3 top-[58%] max-xl:hidden", float: "auth-float-c" },
  { app: "slack", place: "left-[38%] top-[89%]", float: "auth-float-a" },
];

function AppTile({ app, className }: { app: string; className?: string }) {
  return (
    <span className={cn("absolute grid size-[46px] place-items-center rounded-[28%] border border-line bg-surface shadow-soft", className)}>
      <BrandIcon name={app} size={22} />
    </span>
  );
}

/** textcrew.in's badge: a pill with a pulsing blue dot. */
function BetaBadge() {
  return (
    <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-muted shadow-soft">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      Private beta
    </span>
  );
}

/** The headline as textcrew.in sets it: heavy, tight, with the blinking cursor after "crew". */
function LandingHeadline({ className }: { className?: string }) {
  return (
    <h2 className={cn("font-bold tracking-[-0.045em] text-fg", className)}>
      Got a lot of work?
      <br />
      {/* The cursor stays on the line it follows. */}
      <span className="whitespace-nowrap">
        Just text your crew
        <span aria-hidden className="brand-caret ml-[0.08em] inline-block h-[0.78em] w-[0.09em] translate-y-[0.06em] bg-accent" />
      </span>
    </h2>
  );
}

/** The four faces overlapping, as under textcrew.in's hero. */
function FaceStack({ size }: { size: number }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex">
        {CREW.map((member, index) => (
          <Face
            key={member.id}
            id={member.id}
            size={size}
            className="bg-surface ring-2 ring-[var(--page)]"
            style={{ background: "var(--surface)", marginLeft: index ? -size * 0.28 : 0, zIndex: CREW.length - index }}
          />
        ))}
      </span>
      <span className="text-[13px] leading-tight text-muted">
        <span className="font-medium text-fg">Tex</span> + 3 specialists
        <br />
        ready when you are
      </span>
    </span>
  );
}

/** The crew standing on the card's top edge, Tex in the middle and taller, as at the end of textcrew.in. */
const PERCHED: readonly { id: AgentId; scale: number }[] = [
  { id: "scout", scale: 0.68 },
  { id: "byte", scale: 0.74 },
  { id: "tex", scale: 1 },
  { id: "patch", scale: 0.74 },
];

function PerchedCrew({ size, className }: { size: string; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-full flex items-end justify-center", className)}>
      {PERCHED.map((member) => (
        // The feet are 93% of the way down the drawing: that much below the edge, they stand on it.
        <div
          key={member.id}
          className={cn("shrink-0", member.id === "tex" && "relative z-10")}
          style={{ height: `calc(${size} * ${member.scale})`, marginBottom: `calc(${size} * ${member.scale} * -0.07)`, marginInline: `calc(${size} * -0.1)` }}
        >
          <AgentFigure who={member.id} mood="ready" label="" className="h-full w-auto" />
        </div>
      ))}
    </div>
  );
}

/**
 * Landing: the sign-in pages in textcrew.in's own clothes, so they feel like the same site. Its
 * light page, the dot grid fading out, the apps floating on white tiles, its headline with the
 * blinking cursor, and the form on a white card with the crew standing on top, as at the end of
 * textcrew.in. On a phone, the hero is a band at the top and the form is on a white sheet under
 * it, the crew standing on its edge.
 */
export function LandingFrame({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-pane relative isolate h-dvh overflow-y-auto" style={{ background: PAGE, ["--page" as string]: PAGE } as CSSProperties}>
      <div aria-hidden className={cn(DOT_GRID, "-z-10 h-[75%] min-h-[420px]")} />

      <div className="relative flex min-h-full flex-col lg:mx-auto lg:max-w-[1160px] lg:flex-row lg:items-center lg:gap-16 lg:px-12 lg:pt-[clamp(96px,calc(17vh+10px),176px)] lg:pb-4 xl:gap-20">
        {/* A wide screen: the lockup as in textcrew.in's top bar, and the apps floating around. */}
        <header className="absolute top-0 left-12 hidden h-24 items-center gap-2.5 lg:flex">
          <Brand />
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.08em] text-muted">BETA</span>
        </header>
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block [@media(max-height:620px)]:lg:hidden">
          {FLOATING.map((tile) => (
            <AppTile key={tile.app} app={tile.app} className={cn(tile.place, tile.float)} />
          ))}
        </div>

        {/* A phone: the hero as a band at the top. */}
        <div className="relative px-5 pt-5 pb-[84px] md:px-8 lg:hidden">
          <Brand />
          <LandingHeadline className="mt-6 text-[30px] leading-[1.04]" />
          <div aria-hidden>
            <AppTile app="telegram" className="auth-float-b top-5 right-5 md:right-8" />
            <AppTile app="gmail" className="auth-float-c bottom-7 left-5 max-[359px]:hidden md:left-8" />
            <AppTile app="calendar" className="auth-float-a right-5 bottom-9 max-[359px]:hidden md:right-8" />
          </div>
        </div>

        {/* A wide screen: textcrew.in's hero. */}
        <section className="hidden min-w-0 flex-1 flex-col gap-6 pb-[clamp(0px,6vh,56px)] lg:flex">
          <BetaBadge />
          <LandingHeadline className="text-[clamp(40px,min(4.1vw,7.6vh),60px)] leading-[1.02]" />
          <p className="max-w-[46ch] text-[18px] leading-relaxed text-muted">
            Send one message on Telegram or in the web app. Tex, your AI captain, splits the job, gets it done in your apps and checks with you
            before anything risky.
          </p>
          <div aria-hidden className="mt-2 flex items-center gap-6 [@media(max-height:700px)]:hidden">
            <span className="flex items-center gap-3 text-[14px] text-muted">
              Text it from
              <BrandIcon name="telegram" size={20} />
              <BrandIcon name="web" size={20} />
            </span>
            <span className="h-8 w-px bg-line" />
            <FaceStack size={34} />
          </div>
        </section>

        {/* The form: on a white sheet on a phone, on textcrew.in's white card on a wide screen. */}
        <div className="relative flex flex-1 flex-col rounded-t-[28px] border-t border-line bg-surface shadow-[0_-12px_32px_-20px_rgb(21_21_21/0.25)] lg:w-[440px] lg:flex-none lg:rounded-[28px] lg:border lg:shadow-[0_1px_2px_rgb(21_21_21/0.05),0_30px_60px_-30px_rgb(21_21_21/0.25)] xl:w-[460px]">
          <PerchedCrew size="76px" className="lg:hidden" />
          <PerchedCrew size="clamp(96px,17vh,168px)" className="hidden lg:flex [@media(max-height:600px)]:lg:hidden" />
          <main className="relative z-10 flex flex-1 flex-col px-5 pt-9 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8 lg:px-10 lg:py-10 [@media(max-height:780px)]:lg:py-8">
            <div className="mx-auto w-full max-w-[400px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
