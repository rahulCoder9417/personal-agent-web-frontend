"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "@/components/brand-icon";
import { ApprovalsIcon, CloseIcon, ExternalIcon, LockIcon } from "@/components/icons";
import { AgentFigure } from "@/components/tex";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui";
import type { App } from "@/lib/api/client";
import { useConnectApp } from "@/lib/api/hooks";
import { leaveTo, openInNewTab } from "@/lib/navigate";
import { connectCopy, describeConnectError, type ConnectCopy, type ConnectPurpose } from "./apps-logic";
import { PRICING_PATH } from "@/lib/pricing";

/** A coin, for the line about credits. Drawn here: the shared icon set has none. */
function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10.2c.4-.9 1.3-1.4 2.5-1.4 1.5 0 2.4.7 2.4 1.7 0 2.2-4.9 1.2-4.9 3.6 0 1 .9 1.8 2.5 1.8 1.2 0 2.1-.5 2.5-1.4" />
    </svg>
  );
}

const POINT_ICON: Record<ConnectCopy["points"][number]["kind"], ReactNode> = {
  approval: <ApprovalsIcon size={16} />,
  credits: <CoinIcon size={16} />,
  signin: <LockIcon size={16} />,
  tab: <ExternalIcon size={14} />,
};

/** Tex and the app, side by side: who is being connected to what. */
function Pair({ app }: { app: App }) {
  return (
    <div aria-hidden className="flex items-center gap-2.5">
      <AgentFigure who="tex" mood="ready" glyph size={48} label="" />
      <span className="flex items-center gap-1">
        <span className="size-1 rounded-full bg-line" />
        <span className="size-1 rounded-full bg-muted/50" />
        <span className="size-1 rounded-full bg-line" />
      </span>
      <AppIcon name={app.slug} iconUrl={app.iconUrl} size={48} />
    </div>
  );
}

/**
 * Textcrew's own connect screen, shown before anyone leaves for a sign-in page: the app, what Tex
 * will be able to do with it, the rules that hold for every app, and "Continue to <provider>".
 * Only Continue asks the API for the sign-in link (which saves a pending connection), so Cancel
 * leaves nothing behind.
 *
 * `newTab`: onboarding opens the sign-in beside the setup flow, which stays where it is; elsewhere
 * the sign-in takes over this tab and comes back to `returnPath`.
 *
 * A native modal dialog: the page behind can't be reached, Escape closes it, and the keyboard
 * goes back to the button that opened it.
 */
export function ConnectDialog({
  app,
  purpose,
  returnPath,
  newTab = false,
  onClose,
  onOpened,
}: {
  app: App;
  purpose: ConnectPurpose;
  /** A path of this app, such as `/integrations/apps?connected=gmail`. */
  returnPath: string;
  newTab?: boolean;
  onClose: () => void;
  /** After the sign-in opened in a new tab. */
  onOpened?: (slug: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const connect = useConnectApp();
  const [leaving, setLeaving] = useState(false);
  const copy = connectCopy(app, purpose, newTab);
  const titleId = `connect-${app.slug}-title`;

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const busy = connect.isPending || leaving;
  // Closing goes through the dialog itself, so the keyboard goes back to the button that opened it.
  const close = () => {
    if (!leaving) dialog.current?.close();
  };

  const proceed = () =>
    connect.mutate(
      { appSlug: app.slug, returnUrl: `${window.location.origin}${returnPath}` },
      {
        onSuccess: ({ redirectUrl }) => {
          if (newTab) {
            openInNewTab(redirectUrl);
            onOpened?.(app.slug);
            dialog.current?.close();
            return;
          }
          // The sign-in takes over this tab and comes back to `returnPath` when it is done.
          setLeaving(true);
          leaveTo(redirectUrl);
        },
        onError: (error) => {
          const refusal = describeConnectError(app.name, error);
          toastError(refusal.title, refusal.detail, refusal.plans ? { label: "See plans", href: PRICING_PATH } : undefined);
          dialog.current?.close();
        },
      },
    );

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape while the browser is already on its way would only half-close it.
        if (leaving) event.preventDefault();
      }}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dimmed page lands on the dialog itself, not on anything in it.
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] max-w-none rounded-2xl border-0 bg-surface p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-fg/30"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <Pair app={app} />
          <button
            type="button"
            onClick={close}
            disabled={leaving}
            aria-label="Close"
            className="-mt-1 -mr-2 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="text-[19px] leading-tight font-semibold tracking-[-0.01em]">
            {copy.title}
          </h2>
          {copy.intro && <p className="text-[14px] text-muted">{copy.intro}</p>}
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-[12px] font-medium text-muted">What Tex can do with {app.name}</span>
          <p className="text-[14px] leading-snug">{copy.can}</p>
        </div>

        <ul className="flex flex-col gap-2.5">
          {copy.points.map((point) => (
            <li key={point.kind} className="flex items-start gap-2.5 text-[13px] leading-snug text-nav">
              <span className="mt-px grid size-4 shrink-0 place-items-center text-muted">{POINT_ICON[point.kind]}</span>
              <span>{point.text}</span>
            </li>
          ))}
        </ul>

        {leaving && (
          <p role="status" className="text-[12.5px] text-muted">
            {copy.leaving}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} disabled={leaving}>
            Cancel
          </Button>
          <Button variant="primary" pending={busy} onClick={proceed} autoFocus>
            {copy.continueLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Opening the connect screen from a card or a list: which app and why, or nothing. `dialog` is
 * drawn wherever the caller puts it.
 */
export function useConnectDialog(options: { returnPath: (app: App) => string; newTab?: boolean; onOpened?: (slug: string) => void }) {
  const [target, setTarget] = useState<{ app: App; purpose: ConnectPurpose } | null>(null);
  const dialog = target ? (
    <ConnectDialog
      key={`${target.app.slug}:${target.purpose}`}
      app={target.app}
      purpose={target.purpose}
      returnPath={options.returnPath(target.app)}
      newTab={options.newTab}
      onOpened={options.onOpened}
      onClose={() => setTarget(null)}
    />
  ) : null;
  return { open: (app: App, purpose: ConnectPurpose = "connect") => setTarget({ app, purpose }), dialog };
}
