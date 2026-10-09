"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Toaster as SonnerToaster, toast as sonner } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/format";
import { CheckIcon, CloseIcon, WarningIcon } from "./icons";

// Short notices in a corner of the page: something finished elsewhere (a payment landing), or
// something the person asked for didn't work. sonner draws them; only this file knows that.

/**
 * A button on a toast, for the way out of a refusal ("See plans"): a page of this app to open
 * (`href`), or something to do (`onClick`).
 */
export type ToastAction = { label: string } & ({ href: string } | { onClick: () => void });

/** How long a toast stays. A failure stays longer: it has to be read. */
export const TOAST_MS = 8000;
export const TOAST_ERROR_MS = 10_000;

// How a toast's link opens a page. The Toaster swaps in the app's router once it is mounted, so
// the page changes without a reload; before that (and in tests) the browser does it.
type Navigate = (href: string) => void;
const leave: Navigate = (href) => window.location.assign(href);
let navigate: Navigate = leave;

/** A toast button as sonner takes it. */
export function toastButton(action: ToastAction | undefined): { label: string; onClick: () => void } | undefined {
  if (!action) return undefined;
  return { label: action.label, onClick: "href" in action ? () => navigate(action.href) : action.onClick };
}

/** Shows a confirmation in the corner of the page for a few seconds. */
export function toast(message: { title: string; body?: string; action?: ToastAction }) {
  sonner.success(message.title, { description: message.body, duration: TOAST_MS, action: toastButton(message.action) });
}

/** Why something failed, as a toast's second line: a sentence as given, an error's own message, or nothing. */
export function errorDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null || detail === "") return undefined;
  return typeof detail === "string" ? detail : errorMessage(detail);
}

/**
 * Says that something the person asked for didn't work. `title` is what failed ("Couldn’t connect
 * Gmail"); `detail` is why: the error as caught (the API's own message is shown) or a sentence
 * written for the case. The same failure twice in a row shows one toast, not a pile of them.
 */
export function toastError(title: string, detail?: unknown, action?: ToastAction) {
  sonner.error(title, { id: `error:${title}`, description: errorDetail(detail), duration: TOAST_ERROR_MS, action: toastButton(action) });
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("grid size-5 place-items-center rounded-full", className)}>{children}</span>;
}

/**
 * Where the toasts are drawn. Mounted once, for every page (`Providers`). The look is the app's own:
 * sonner's styles are switched off and each part is dressed in the design tokens, so it follows
 * whatever the tokens say. `--toast-bottom` (globals.css) keeps it above the phone's tab bar.
 */
export function Toaster() {
  const router = useRouter();
  useEffect(() => {
    navigate = (href) => router.push(href);
    return () => {
      navigate = leave;
    };
  }, [router]);

  return (
    <SonnerToaster
      position="bottom-right"
      expand
      visibleToasts={4}
      gap={8}
      closeButton
      offset={{ right: 20, bottom: "var(--toast-bottom)" }}
      mobileOffset={{ left: 16, right: 16, bottom: "var(--toast-bottom)" }}
      containerAriaLabel="Notices"
      icons={{
        success: (
          <Badge className="bg-success-soft text-success">
            <CheckIcon size={12} />
          </Badge>
        ),
        error: (
          <Badge className="bg-danger-soft text-danger">
            <WarningIcon size={12} />
          </Badge>
        ),
        close: <CloseIcon size={13} />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Dismiss",
        classNames: {
          toast:
            "flex w-[var(--width)] items-start gap-3 rounded-2xl border border-line-strong bg-surface px-4 py-3 font-sans text-fg shadow-[var(--shadow-pop)]",
          icon: "mt-0.5 shrink-0",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-[13.5px] leading-snug font-semibold",
          description: "text-[13px] leading-snug text-muted",
          actionButton:
            "inline-flex h-7 shrink-0 items-center self-center rounded-lg bg-fg px-2.5 text-[12.5px] font-medium whitespace-nowrap text-white transition-colors hover:bg-black",
          closeButton:
            "order-last -mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg",
        },
      }}
    />
  );
}
