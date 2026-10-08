import type { ReactNode } from "react";
import { Brand } from "@/components/shell/brand";
import { ButtonLink, EmptyState } from "@/components/ui";

/** The page around a sign-in form: the lockup at the top, the form in the middle. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center px-4 md:px-5">
        <Brand />
      </header>
      {/* A column with auto margins: centred when there is room, from the top (and scrolling) when the keyboard takes it. */}
      <main className="scroll-pane flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto my-auto w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}

/**
 * The sign-in pages of a build without sign-in (demo mode, the development token). The proxy leads
 * to the home screen before this is shown; it is only seen when the server has the Clerk keys and
 * the build didn't, and it says so instead of sending the browser round in circles.
 */
export function NoSignIn() {
  return (
    <AuthFrame>
      <EmptyState
        mood="paused"
        title="Sign-in isn’t part of this build"
        action={
          <ButtonLink href="/" variant="primary" size="lg">
            Open Textcrew
          </ButtonLink>
        }
      >
        The app was built without the Clerk keys. Build it again with them set to turn sign-in on.
      </EmptyState>
    </AuthFrame>
  );
}
