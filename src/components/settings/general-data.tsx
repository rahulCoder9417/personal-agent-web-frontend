"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ActivityIcon, ApprovalsIcon, LockIcon } from "@/components/icons";
import { useAppConfig } from "@/components/shell/providers";
import { Button, Card, inputClass } from "@/components/ui";
import { cn } from "@/lib/format";
import { ClerkDeleteAccountButton, ClerkSignOutButton } from "./clerk-actions";
import { SettingRow, SettingsGroup } from "./settings-rows";

function DataPromise({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
      <span className="mt-0.5 shrink-0 text-fg">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold">{title}</span>
        <span className="text-[13px] text-muted">{children}</span>
      </div>
    </li>
  );
}

function NoTrainingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

/** The privacy promises, stated plainly where people manage their account. */
export function YourDataSection() {
  return (
    <SettingsGroup title="Your data">
      <Card>
        <ul>
          <DataPromise icon={<LockIcon size={18} />} title="Your agent is yours alone">
            A private, isolated workspace. Its memory, files and notes never mix with anyone else’s.
          </DataPromise>
          <DataPromise icon={<ApprovalsIcon size={18} />} title="It asks before it acts">
            Sending to other people, deleting things or spending money always waits for your Approve.
          </DataPromise>
          <DataPromise icon={<NoTrainingIcon />} title="Not used to train AI">
            Tex calls AI providers through their APIs, which don’t train on that data. With your own key, your provider’s terms apply.
          </DataPromise>
          <DataPromise icon={<ActivityIcon size={18} />} title="Everything is logged">
            Every action, when it happened and what it cost, in your{" "}
            <Link href="/activity" className="font-medium text-accent hover:text-accent-dark">
              activity log
            </Link>
            .
          </DataPromise>
        </ul>
      </Card>
      <a
        href="https://textcrew.in/privacy"
        target="_blank"
        rel="noreferrer"
        className="self-start text-[12.5px] font-medium text-accent hover:text-accent-dark"
      >
        Privacy Policy
      </a>
    </SettingsGroup>
  );
}

/** Who is signed in, and signing out. */
function SessionRow({ email }: { email: string }) {
  const { mode, clerk } = useAppConfig();
  const title = mode === "demo" ? "Demo account" : mode === "dev-token" ? "Local backend" : "Signed in";
  const detail = mode === "demo" ? "no sign-in needed" : mode === "dev-token" ? `${email} · development token` : email;
  return (
    <SettingRow label={title} help={<span className="block truncate">{detail}</span>}>
      <div className="flex sm:justify-end">{clerk ? <ClerkSignOutButton /> : <Button disabled>Sign out</Button>}</div>
    </SettingRow>
  );
}

const CONFIRM_WORD = "DELETE";

function DeleteAccountRow() {
  const { mode, clerk } = useAppConfig();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const id = useId();
  const confirmed = typed.trim() === CONFIRM_WORD;

  return (
    <div className="flex flex-col gap-3.5 border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13.5px] font-medium">Delete account</span>
          <p className="text-[12.5px] text-muted">
            Removes your agent’s workspace, memory, messages and connected apps. Backups clear within 30 days. This can’t be undone.
          </p>
        </div>
        {!asking && (
          <Button variant="secondary" className="self-start border-danger/40 text-danger hover:border-danger sm:self-center" onClick={() => setAsking(true)}>
            Delete my account and data
          </Button>
        )}
      </div>
      {asking && (
        <div className="flex flex-col gap-3 rounded-xl bg-danger-soft/60 p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[12.5px] font-medium">
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id={id}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              spellCheck={false}
              className={cn(inputClass, "max-w-56")}
            />
          </div>
          <div className="flex flex-wrap items-start gap-2.5">
            {clerk ? (
              <ClerkDeleteAccountButton confirmed={confirmed} />
            ) : (
              <Button variant="primary" className="border-danger bg-danger" disabled>
                Delete forever
              </Button>
            )}
            <Button
              onClick={() => {
                setAsking(false);
                setTyped("");
              }}
            >
              Keep my account
            </Button>
          </div>
          {!clerk && (
            <p className="text-[12.5px] text-muted">
              {mode === "demo"
                ? "This is the demo account, so there’s nothing to delete."
                : "Accounts are deleted through sign-in, which this development session doesn’t use."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Signing out, and deleting the account. The first row waits for the account's email. */
export function AccountSection({ email }: { email?: string }) {
  return (
    <SettingsGroup title="Account">
      <Card>
        {email !== undefined && <SessionRow email={email} />}
        <DeleteAccountRow />
      </Card>
    </SettingsGroup>
  );
}
