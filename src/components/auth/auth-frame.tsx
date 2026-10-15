import type { ReactNode } from "react";
import { ButtonLink, EmptyState } from "@/components/ui";
import { AuroraFrame } from "./looks/aurora";
import { ChatWallFrame } from "./looks/chat-wall";

/**
 * The sign-in pages' looks, kept side by side while one is chosen:
 * - aurora: the whole page a night sky in the crew's colours, the form on a white card.
 * - chat-wall: a wall of what people text the crew on the left, the form on warm paper on the right.
 */
export type AuthLook = "aurora" | "chat-wall";

/** The look the sign-in pages wear. */
export const AUTH_LOOK: AuthLook = "aurora";

/**
 * The page around a sign-in form, in the chosen look. Every look keeps the same form: centred and
 * 400px at most, starting from the top (and scrolling) when the window or the keyboard leaves too
 * little room. Below 1024px the look's background is a band at the top and the form sits under it.
 */
export function AuthFrame({ children, look = AUTH_LOOK }: { children: ReactNode; look?: AuthLook }) {
  switch (look) {
    case "aurora":
      return <AuroraFrame>{children}</AuroraFrame>;
    case "chat-wall":
      return <ChatWallFrame>{children}</ChatWallFrame>;
  }
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
