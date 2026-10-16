"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { Button } from "./ui";

/**
 * Asks once more before something is removed: what is being removed (the title names it), what
 * stops working, and Cancel or the action. Disconnecting an app, unlinking a chat app and
 * cancelling a plan use it.
 *
 * `onConfirm` does the work and says how it went (a toast); while it runs, the action button shows
 * a spinner and nothing in the dialog can be pressed, and when it settles the dialog closes. The
 * keyboard starts on Cancel (or `cancelLabel`), so Enter never removes anything by accident.
 *
 * A native modal dialog, like the connect screen: the page behind can't be reached, Escape and a
 * click on the dimmed page close it, and the keyboard goes back to the button that opened it.
 */
export function ConfirmDialog({
  title,
  icon,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "destructive",
  onConfirm,
  onClose,
}: {
  title: string;
  /** The app or chat app being removed, above the title. */
  icon?: ReactNode;
  /** What stops working, in a line or two. */
  children?: ReactNode;
  /** "Disconnect Gmail". */
  confirmLabel: string;
  /** The way out without doing it. "Cancel" unless that would read oddly ("Keep my plan" before cancelling a plan). */
  cancelLabel?: string;
  /** The confirm button: red for removing something (the default), the accent for keeping something. */
  tone?: "destructive" | "primary";
  onConfirm: () => Promise<unknown>;
  /** The dialog has closed, by Cancel, Escape, the dimmed page or after the work. */
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [working, setWorking] = useState(false);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const close = () => {
    if (!working) dialog.current?.close();
  };
  const confirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
    } catch {
      // `onConfirm` says why in a toast; the dialog only has to close.
    }
    setWorking(false);
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      aria-busy={working || undefined}
      onCancel={(event) => {
        // Escape while the work is under way would leave it half seen.
        if (working) event.preventDefault();
      }}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dimmed page lands on the dialog itself, not on anything in it.
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[min(440px,calc(100vw-32px))] max-w-none rounded-2xl border-0 bg-surface p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-fg/30"
    >
      <div className="flex flex-col gap-5 p-6 max-sm:p-5">
        <div className="flex items-start justify-between gap-3">
          {icon ?? <span />}
          <button
            type="button"
            onClick={close}
            disabled={working}
            aria-label="Close"
            className="-mt-1 -mr-2 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="text-[19px] leading-tight font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
            {title}
          </h2>
          {children && (
            <div id={bodyId} className="flex flex-col gap-3 text-[14px] text-muted">
              {children}
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="lg" onClick={close} disabled={working} autoFocus className="sm:h-[34px] sm:px-3.5 sm:text-[13.5px]">
            {cancelLabel}
          </Button>
          <Button variant={tone} size="lg" pending={working} onClick={() => void confirm()} className="sm:h-[34px] sm:px-3.5 sm:text-[13.5px]">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
