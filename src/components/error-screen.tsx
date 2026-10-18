import { HELP_CONTACT } from "@/lib/help-content";

// The page shown when something crashes (error.tsx, global-error.tsx) or an address doesn't exist
// (not-found.tsx). Plain on purpose: no providers, no hooks, no data, so it still works when the
// rest of the app doesn't. Plain <a> links, because the router may be the thing that broke.

export const CHAT_HREF = "/";
export const SUPPORT_HREF = `mailto:${HELP_CONTACT}?subject=${encodeURIComponent("Textcrew help")}`;

const PRIMARY =
  "inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-[14px] font-medium text-white hover:bg-[var(--accent-dark)]";
const SECONDARY =
  "inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[14px] font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]";

export function ErrorScreen({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <main className="grid min-h-full w-full place-items-center bg-[var(--bg)] p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--fg)]">{title}</h1>
        <p className="text-[15px] text-[var(--muted)]">{message}</p>
        <div className="mt-3 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {onRetry && (
            <button type="button" onClick={onRetry} className={PRIMARY}>
              Try again
            </button>
          )}
          <a href={CHAT_HREF} className={onRetry ? SECONDARY : PRIMARY}>
            Go to chat
          </a>
          <a href={SUPPORT_HREF} className={SECONDARY}>
            Email support
          </a>
        </div>
      </div>
    </main>
  );
}
