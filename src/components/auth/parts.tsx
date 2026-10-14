"use client";

import type { SetActiveNavigate } from "@clerk/nextjs/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { BrandIcon } from "@/components/brand-icon";
import { Button, inputClass } from "@/components/ui";
import { afterAuthPath, sessionTaskMessage, SOCIAL_PROVIDERS, type AuthProblem, type SocialStrategy } from "@/lib/auth-flow";
import { cn } from "@/lib/format";

// The pieces the sign-in and sign-up forms share. They sit on Clerk's hooks, so like the forms
// they may only be rendered when ClerkProvider is in the tree (that is, never in demo mode).

/** Clerk's codes by email are six digits. */
export const CODE_LENGTH = 6;

// 16px on a phone: below that, iOS zooms the page in when a field is tapped.
const fieldClass = cn(inputClass, "max-sm:text-[16px]");

/** A Clerk call answers `{ error }` rather than throwing. This throws it, so a flow reads top to bottom. */
export async function ok(call: Promise<{ error: unknown }>): Promise<void> {
  const { error } = await call;
  if (error) throw error;
}

type Finalize = (params: { navigate: SetActiveNavigate }) => Promise<{ error: unknown }>;

/**
 * The last step of every flow: makes the new session the active one and goes to the app, to the
 * page the person was sent to sign in from when there is one. Answers what is in the way when
 * Clerk holds the session back, and null once the browser is on its way.
 */
export function useFinish(redirectUrl: string | null) {
  const router = useRouter();
  return useCallback(
    async (finalize: Finalize): Promise<string | null> => {
      let blocked: string | null = null;
      await ok(
        finalize({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              blocked = sessionTaskMessage(session.currentTask.key);
              return;
            }
            // Safari may need a stop at Clerk on the way, which makes the address a full one.
            const url = decorateUrl(afterAuthPath(redirectUrl, window.location.origin));
            if (url.startsWith("http")) window.location.href = url;
            else router.replace(url);
          },
        }),
      );
      return blocked;
    },
    [redirectUrl, router],
  );
}

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.025em]">{title}</h1>
      {children && <p className="text-[14.5px] text-muted">{children}</p>}
    </div>
  );
}

/** The form itself. It sits straight on the page's white sheet, so it needs no card of its own. */
export function AuthBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/** What went wrong when it isn't about one field, above the form. */
export function FormAlert({ problem, children }: { problem: AuthProblem | null; children?: ReactNode }) {
  if (!problem || problem.field) return null;
  return (
    <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
      {problem.message}
      {children}
    </p>
  );
}

/** Good news above the form: a new code is on its way. */
export function FormNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-[10px] bg-success-soft px-3 py-2.5 text-[13px] text-success">
      {children}
    </p>
  );
}

/** The message for one field, or null when the problem is somewhere else. */
export function fieldError(problem: AuthProblem | null, field: AuthProblem["field"]): string | null {
  return problem && problem.field === field ? problem.message : null;
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(fieldClass, className)} />;
}

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} spellCheck={false} autoCapitalize="none" className={cn(fieldClass, "pr-14")} />
      <button
        type="button"
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((value) => !value)}
        className="absolute inset-y-0 right-1 my-1 rounded-md px-2 text-[12px] font-medium text-nav hover:bg-surface-2 hover:text-fg"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/** The six-digit code from an email. Keeps digits only, so a pasted "123 456" works. */
export function CodeInput({ value, onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; onChange: (code: string) => void }) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={CODE_LENGTH + 1}
      placeholder={"0".repeat(CODE_LENGTH)}
      className={cn(inputClass, "h-11 text-center font-mono text-[18px] tracking-[0.35em] placeholder:text-line-strong")}
    />
  );
}

/** A button that reads as a link, for the smaller ways on: another code, another email. */
export function LinkButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn("rounded text-[13px] font-medium text-accent hover:text-accent-dark disabled:pointer-events-none disabled:opacity-50", className)}
    />
  );
}

export const linkClass = "font-medium text-accent hover:text-accent-dark";

/** One button per social provider, then the line that separates them from the form. */
export function SocialButtons({ busy, disabled, onPick }: { busy: boolean; disabled: boolean; onPick: (strategy: SocialStrategy) => void }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        {SOCIAL_PROVIDERS.map((provider) => (
          <Button key={provider.strategy} size="lg" className="w-full" pending={busy} disabled={disabled} onClick={() => onPick(provider.strategy)}>
            {!busy && <BrandIcon name={provider.icon} size={16} />}
            Continue with {provider.name}
          </Button>
        ))}
      </div>
      <div aria-hidden className="flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

/** The line under a form that leads to the other one. */
export function SwitchLine({ question, href, action }: { question: string; href: string; action: string }) {
  return (
    <p className="border-t border-line pt-5 text-[13.5px] text-muted">
      {question}{" "}
      <Link href={href} className={linkClass}>
        {action}
      </Link>
    </p>
  );
}

/**
 * Where Clerk draws its "are you a robot" check when it wants one. It has to be on the page
 * whenever an account may be created; most of the time it stays empty and takes no room.
 */
export function CaptchaSlot() {
  return <div id="clerk-captcha" data-cl-theme="light" data-cl-size="flexible" />;
}
