"use client";

// The small parts the automation screens are built from, in their one look: three text sizes (24,
// 14 and 12), spacing in steps of 4, 8, 12, 16, 24, 32 and 48, and amber for what needs the person
// (red only for a run that failed). Every app shows its own logo (`AppIcon`), Tex and Patch their
// faces, a schedule its clock; never a letter.

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMe, usePlans } from "@/lib/api/hooks";
import { logoStack, markName, stackLabel, type RunTone } from "@/lib/automation-list";
import { cn } from "@/lib/format";
import { AppIcon, hasBrandIcon } from "../brand-icon";
import { CalendarIcon, ChatIcon, ChevronRightIcon, ClockIcon, MoreIcon } from "../icons";
import { AgentFigure } from "../tex";
import { Spinner } from "../ui";

// ---------------------------------------------------------------- type and buttons

/** The three sizes, with their line heights. */
export const T1 = "text-[24px] leading-8 font-semibold tracking-[-0.015em]";
export const T2 = "text-[14px] leading-5";
export const T3 = "text-[12px] leading-4";

type Variant = "primary" | "secondary" | "ghost" | "remove";

const VARIANT: Record<Variant, string> = {
  primary: "bg-fg text-white hover:bg-[#333]",
  secondary: "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-bg",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  // Grey, with a bin: red only under the pointer.
  remove: "text-fg-2 hover:bg-danger-soft hover:text-danger",
};

export function btn(variant: Variant = "secondary", size: "md" | "sm" = "md", className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "h-9 rounded-[10px] px-4 text-[14px]" : "h-8 rounded-[10px] px-3 text-[12px]",
    VARIANT[variant],
    className,
  );
}

export function Btn({
  variant,
  size,
  pending,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "sm"; pending?: boolean }) {
  return (
    <button type="button" {...rest} disabled={disabled || pending} aria-busy={pending || undefined} className={btn(variant, size, className)}>
      {pending && <Spinner size={12} />}
      {children}
    </button>
  );
}

export function BtnLink({ variant, size, className, ...rest }: React.ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "sm" }) {
  return <Link {...rest} className={btn(variant, size, className)} />;
}

/** A square button with an icon only (32px). `label` is what a screen reader says. */
export function IconBtn({ label, className, children, ...rest }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

/** "Use template ›": a link that goes somewhere, with a chevron rather than a typed arrow. */
export function ChevronLink({ href, children, className, ...rest }: React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} {...rest} className={cn("inline-flex w-fit items-center gap-1 text-[12px] leading-4 font-medium text-fg transition-colors hover:text-accent-dark", className)}>
      {children}
      <ChevronRightIcon size={12} strokeWidth={2.4} />
    </Link>
  );
}

// ---------------------------------------------------------------- chips and dots

export type ChipTone = "neutral" | "ok" | "warn" | "danger" | "blue";

const CHIP: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-fg-2",
  ok: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn shadow-[inset_0_0_0_1px_var(--warn-line)]",
  danger: "bg-danger-soft text-danger",
  blue: "bg-accent-soft text-accent-dark",
};

export function Chip({ tone = "neutral", mono, className, children }: { tone?: ChipTone; mono?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-md px-2 text-[12px] leading-4 font-medium whitespace-nowrap", CHIP[tone], mono && "font-mono", className)}>
      {children}
    </span>
  );
}

const DOT: Record<RunTone, string> = {
  ok: "bg-online",
  warn: "bg-warn-dot",
  danger: "bg-danger",
  muted: "bg-faint",
  running: "bg-accent",
};

export function Dot({ tone, size = 8, className }: { tone: RunTone; size?: number; className?: string }) {
  return <span aria-hidden className={cn("shrink-0 rounded-full", DOT[tone], tone === "running" && "animate-pulse", className)} style={{ width: size, height: size }} />;
}

// ---------------------------------------------------------------- logos

/** A plain tile with a line glyph: a schedule's clock, a moment's calendar, or an app with no mark. */
function GlyphTile({ size, children }: { size: number; children: ReactNode }) {
  return (
    <span className="grid shrink-0 place-items-center bg-surface-2 text-fg" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>
      {children}
    </span>
  );
}

/**
 * The mark of one part of an automation, at `size` (28 in lists, 32 on cards, 36 on the canvas, 40
 * in the settings): an app's own logo on a tile of its colour; Tex's and Patch's faces; a
 * schedule's clock; the Automations chat. Decorative: what it is, is said in words beside it.
 */
export function AppLogo({ slug, size = 28, iconUrl, className }: { slug: string; size?: number; iconUrl?: string | null; className?: string }) {
  const glyph = Math.round(size * 0.5);
  let mark: ReactNode;
  if (slug === "tex" || slug === "patch") mark = <AgentFigure who={slug} mood="ready" glyph size={size} label="" />;
  else if (slug === "schedule")
    mark = (
      <GlyphTile size={size}>
        <ClockIcon size={glyph} strokeWidth={2} />
      </GlyphTile>
    );
  else if (slug === "once")
    mark = (
      <GlyphTile size={size}>
        <CalendarIcon size={glyph} strokeWidth={2} />
      </GlyphTile>
    );
  else if (slug === "chat")
    mark = (
      <span className="grid shrink-0 place-items-center rounded-full bg-fg text-white" style={{ width: size, height: size }}>
        <ChatIcon size={glyph} strokeWidth={2} />
      </span>
    );
  else if (hasBrandIcon(slug) || iconUrl) mark = <AppIcon name={slug} size={size} iconUrl={iconUrl} />;
  else
    mark = (
      <GlyphTile size={size}>
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
        </svg>
      </GlyphTile>
    );
  return (
    <span aria-hidden className={cn("inline-grid shrink-0", className)}>
      {mark}
    </span>
  );
}

/**
 * A row's marks, overlapping: each once, in order; with more than three, the first two and "+N".
 * The tooltip and the screen reader get every name.
 */
export function LogoStack({
  marks,
  size = 28,
  names,
  icons,
  dim,
  className,
}: {
  marks: readonly string[];
  size?: number;
  names?: ReadonlyMap<string, string>;
  icons?: ReadonlyMap<string, string | null>;
  dim?: boolean;
  className?: string;
}) {
  const stack = logoStack(marks);
  const { label, title } = stackLabel(stack, names);
  return (
    <span role="img" aria-label={label} title={title} className={cn("flex items-center", dim && "opacity-50", className)}>
      {stack.shown.map((slug, index) => (
        <span key={slug} className={cn("grid rounded-[10px] bg-surface shadow-[0_0_0_2px_var(--surface)]", index > 0 && "-ml-1")}>
          <AppLogo slug={slug} size={size} iconUrl={icons?.get(slug)} />
        </span>
      ))}
      {stack.more > 0 && (
        <span className="-ml-1 grid rounded-[10px] bg-surface shadow-[0_0_0_2px_var(--surface)]">
          <span className="grid place-items-center rounded-lg bg-surface-2 text-[12px] leading-4 font-semibold text-fg-2" style={{ width: size, height: size }}>
            +{stack.more}
          </span>
        </span>
      )}
    </span>
  );
}

/** A mark's name, from the catalog when it has it. */
export { markName };

// ---------------------------------------------------------------- breadcrumbs

/** "Automations › New automation": the way back, and where this is. The last part is the page. */
export function Crumbs({ parts, current, className }: { parts: { href: string; label: string }[]; current: ReactNode; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-2 text-muted", className)}>
      {parts.map((part) => (
        <span key={part.href} className="flex shrink-0 items-center gap-2">
          <Link href={part.href} className="font-medium text-muted transition-colors hover:text-fg">
            {part.label}
          </Link>
          <ChevronRightIcon size={12} strokeWidth={2.4} className="shrink-0 text-faint" />
        </span>
      ))}
      <span aria-current="page" className="min-w-0 truncate font-semibold text-fg">
        {current}
      </span>
    </nav>
  );
}

// ---------------------------------------------------------------- notices

/** Something that needs the person, in amber: what is wrong in a sentence, and the way out. */
export function Notice({ logo, children, action, className }: { logo?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-warn-soft px-4 py-3 shadow-[inset_0_0_0_1px_var(--warn-line)]", T2, className)}>
      {logo}
      <p className="min-w-0 flex-[1_1_320px]">{children}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- the "…" menu

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  /** A page to open, or something to do. */
  href?: string;
  onSelect?: () => void;
  /** Removes something: asks once more in the menu, and is red under the pointer. */
  confirm?: { title: string; body: string; label: string };
  pending?: boolean;
};

/** A "…" button with a short menu under it. Escape closes it; the arrows move through it. */
export function MoreMenu({ label, items, className }: { label: string; items: readonly MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<MenuItem | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (menu.current?.contains(target) || toggle.current?.contains(target)) return;
      setOpen(false);
      setConfirming(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, confirming]);

  const close = (refocus: boolean) => {
    setOpen(false);
    setConfirming(null);
    if (refocus) toggle.current?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const all = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    all[(at + (event.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
  };
  const row = "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] leading-5 text-fg transition-colors hover:bg-surface-2";

  return (
    <div className={cn("relative", className)}>
      <IconBtn ref={toggle} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => (open ? close(false) : setOpen(true))}>
        <MoreIcon size={16} />
      </IconBtn>
      {open && (
        <div ref={menu} id={id} onKeyDown={onKeyDown} className="absolute top-full right-0 z-30 mt-1 w-[232px] rounded-xl bg-surface p-1 shadow-[var(--shadow-pop)] ring-1 ring-line-strong">
          {confirming?.confirm ? (
            <div role="alertdialog" aria-label={confirming.confirm.title} className="flex flex-col gap-2 p-2">
              <p className="text-[14px] leading-5 font-semibold">{confirming.confirm.title}</p>
              <p className="text-[12px] leading-4 text-muted">{confirming.confirm.body}</p>
              <div className="flex justify-end gap-2 pt-1">
                <Btn size="sm" variant="ghost" onClick={() => close(true)}>
                  Cancel
                </Btn>
                <Btn
                  size="sm"
                  variant="remove"
                  className="bg-surface-2"
                  pending={confirming.pending}
                  onClick={() => {
                    confirming.onSelect?.();
                    close(false);
                  }}
                >
                  {confirming.confirm.label}
                </Btn>
              </div>
            </div>
          ) : (
            <div role="menu" aria-label={label}>
              {items.map((item) =>
                item.href ? (
                  <Link key={item.label} role="menuitem" href={item.href} className={row} onClick={() => close(false)}>
                    <span className="text-muted">{item.icon}</span>
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.pending}
                    className={cn(row, item.confirm && "hover:bg-danger-soft hover:text-danger")}
                    onClick={() => {
                      if (item.confirm) setConfirming(item);
                      else {
                        item.onSelect?.();
                        close(false);
                      }
                    }}
                  >
                    <span className="text-muted">{item.icon}</span>
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the plan

export type PlanAutomations = {
  planName: string;
  /** How many automations the plan allows. A repo with pull-request review on counts as one. */
  limit: number;
  /** Whether another plan allows more. */
  canUpgrade: boolean;
};

/** What the person's plan allows in automations. Null until the account and the plans have loaded. */
export function usePlanAutomations(): PlanAutomations | null {
  const me = useMe();
  const plans = usePlans();
  const plan = plans.data?.plans.find((p) => p.id === me.data?.plan);
  if (!plan) return null;
  const limit = plan.limits.automations;
  return { planName: plan.name, limit, canUpgrade: plans.data?.plans.some((p) => p.limits.automations > limit) ?? false };
}
