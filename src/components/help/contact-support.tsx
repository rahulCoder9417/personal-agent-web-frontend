"use client";

import { useMe } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import { HELP_CONTACT } from "@/lib/help-content";
import { toast, toastError } from "../toast";
import { Button, buttonClass } from "../ui";

// "Email support": a mailto link with the account's email and id already in the message, a button
// that copies the address, and a note on when to expect a reply. One component, used at the top of
// the Help page (compact), at its end and under an empty search (full), and by Settings.

export const SUPPORT_SUBJECT = "Textcrew help";

/** The `mailto:` link: subject, and a short message that names the account when it is known. */
export function supportMailto(account?: { email?: string; id?: string }): string {
  const lines = ["Hi Textcrew team,", ""];
  if (account?.email) lines.push(`Account email: ${account.email}`);
  if (account?.id) lines.push(`User id: ${account.id}`);
  lines.push("", "What happened:", "");
  return `mailto:${HELP_CONTACT}?subject=${encodeURIComponent(SUPPORT_SUBJECT)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

/** Copies the support address and says so in a toast. */
export async function copySupportAddress(): Promise<void> {
  try {
    await navigator.clipboard.writeText(HELP_CONTACT);
    toast({ title: "Address copied" });
  } catch {
    toastError("Couldn’t copy the address", `Your browser didn’t allow it. Write to ${HELP_CONTACT}.`);
  }
}

/** The two buttons: Email support (a mailto with the account filled in) and Copy address. */
export function SupportButtons({ size = "sm" }: { size?: "sm" | "md" }) {
  const me = useMe().data;
  const href = supportMailto(me ? { email: me.email, id: me.id } : undefined);
  return (
    <>
      <a href={href} className={buttonClass("primary", size)}>
        Email support
      </a>
      <Button size={size} onClick={() => void copySupportAddress()}>
        Copy address
      </Button>
    </>
  );
}

export function ContactSupport({ variant = "full", title, className }: { variant?: "compact" | "full"; title?: string; className?: string }) {
  const compact = variant === "compact";
  return (
    <section aria-label="Contact support" className={cn("flex flex-col gap-3 rounded-2xl bg-accent-soft", compact ? "p-4" : "p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-1">
        <h2 className={cn("font-semibold tracking-[-0.01em]", compact ? "text-[15px]" : "text-[18px]")}>{title ?? (compact ? "Still stuck? Email support" : "Still stuck? We’re here")}</h2>
        <p className="text-[13px] leading-snug text-fg-2">
          {compact ? "" : "Tell us what happened and we’ll sort it out. "}We usually reply within a day.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SupportButtons size={compact ? "sm" : "md"} />
        {!compact && <span className="text-[13px] text-muted">{HELP_CONTACT}</span>}
      </div>
    </section>
  );
}
