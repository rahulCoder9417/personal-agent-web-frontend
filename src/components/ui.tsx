import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, HTMLAttributes, ReactNode } from "react";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/format";
import { AgentFigure, type Mood } from "./tex";

// ---------------------------------------------------------------- buttons

/**
 * `danger` is a quiet red text button; `danger-outline` the button in a row that starts a removal
 * (Disconnect, Unlink), which then asks in a `ConfirmDialog`; `destructive` the solid red one there
 * that does it.
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-fg text-white shadow-[0_1px_2px_rgb(21_21_21/0.2)] hover:bg-black",
  secondary: "bg-surface text-fg shadow-[var(--shadow-raised)] hover:bg-surface-2",
  ghost: "text-nav hover:bg-surface-2 hover:text-fg",
  danger: "text-danger hover:bg-danger-soft",
  "danger-outline":
    "bg-surface text-danger shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--danger)_32%,transparent)] hover:bg-danger-soft hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--danger)_45%,transparent)]",
  destructive: "bg-danger text-white shadow-[0_1px_2px_rgb(21_21_21/0.2)] hover:bg-danger/90",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-[30px] rounded-lg px-3 text-[13px]",
  md: "h-[34px] rounded-[9px] px-3.5 text-[13.5px]",
  lg: "h-10 rounded-[10px] px-5 text-[14.5px]",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors",
    "disabled:opacity-50 disabled:pointer-events-none",
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks while a request is in flight. */
  pending?: boolean;
};

export function Button({ variant, size, pending, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}
    >
      {pending && <Spinner size={13} />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}

/** A square, icon-only button. `label` is what a screen reader says. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "grid size-[30px] shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- small pieces

export type PillTone = "done" | "waiting" | "muted" | "danger";

const PILL_TONE: Record<PillTone, string> = {
  done: "bg-success-soft text-success",
  waiting: "bg-accent-soft text-accent-dark",
  muted: "bg-surface-2 text-nav",
  danger: "bg-danger-soft text-danger",
};

export function Pill({ tone = "muted", className, children }: { tone?: PillTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-[12px] font-medium", PILL_TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Switch({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60",
        on ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-out",
          on ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("rounded-xl border border-line bg-surface", className)} />;
}

/** The heading above a section, in plain words. */
export function SectionLabel({ as: Tag = "h2", className, children }: { as?: "h2" | "h3" | "span" | "p"; className?: string; children: ReactNode }) {
  return (
    <Tag className={cn("text-[13px] font-semibold text-fg", className)}>{children}</Tag>
  );
}

/** A quiet line of detail: times, counts, credits. */
export function Meta({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("text-[12.5px] text-muted tabular-nums", className)}>{children}</span>;
}

export function IconTile({ size = 36, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center bg-surface-2", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden className={cn("spin shrink-0", className)}>
      <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M9 2a7 7 0 0 1 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- filters

export type FilterOption<T extends string> = { value: T; label: string; icon?: ReactNode; count?: number };

/** A row of pill toggles where exactly one is selected. */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex max-w-full overflow-x-auto rounded-[10px] bg-surface-2 p-[3px] [scrollbar-width:none]">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              on ? "bg-surface text-fg shadow-[var(--shadow-raised)]" : "text-nav hover:text-fg",
            )}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && <span className="text-[12px] text-muted tabular-nums">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- forms

export const inputClass =
  "h-9 w-full rounded-[9px] border border-line-strong bg-surface px-3 text-[13.5px] outline-none transition-shadow placeholder:text-muted/80 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:bg-surface-2 disabled:text-muted";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12.5px] text-muted">{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- states

export function EmptyState({
  mood = "ready",
  title,
  children,
  action,
  className,
}: {
  mood?: Mood;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-14 text-center", className)}>
      <AgentFigure who="tex" mood={mood} size={132} label="" />
      <p className="text-[16px] font-semibold tracking-[-0.01em]">{title}</p>
      {children && <div className="max-w-sm text-[13.5px] text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** What a failed load shows: the API's own message and a way to try again. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <AgentFigure who="tex" mood="paused" size={120} label="" />
      <p className="text-[16px] font-semibold tracking-[-0.01em]">That didn’t load</p>
      <p className="max-w-sm text-[13.5px] text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Placeholder rows while a list loads. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-b border-surface-2 px-5 py-4 last:border-b-0">
          <span className="size-9 shrink-0 animate-pulse rounded-[11px] bg-surface-2" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3 w-2/5 animate-pulse rounded bg-surface-2" />
            <span className="h-2.5 w-3/5 animate-pulse rounded bg-surface-2" />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * An error in a red line under a control. A failed action is a toast now (`toastError` in
 * toast.tsx), so only the chat still draws this; don't reach for it in new code.
 */
export function InlineError({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={cn("text-[12.5px] text-danger", className)}>
      {errorMessage(error)}
    </p>
  );
}
