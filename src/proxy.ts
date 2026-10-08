import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { SIGN_IN_PATH, SIGN_UP_PATH, SSO_CALLBACK_PATH } from "@/lib/auth-flow";
import { authMode } from "@/lib/env";

// Pages need a session; API routes answer 401 as JSON themselves, so they aren't redirected.
// The sign-in pages (sign in, sign up, and where Google sends the browser back to) are for
// people who have no session yet.
// /connected and /billing are where a browser lands after connecting an app or paying.
// They show no account data, and that browser may not be signed in (the desktop app's case).
const isOpen = createRouteMatcher([SIGN_IN_PATH, SIGN_UP_PATH, SSO_CALLBACK_PATH, "/connected", "/billing", "/api/(.*)"]);

const withClerk = clerkMiddleware(
  async (auth, request) => {
    if (!isOpen(request)) await auth.protect();
  },
  // Where someone without a session is sent. Left out, that is Clerk's own hosted sign-in page.
  { signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH },
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Only Clerk mode has sessions to check.
  if (authMode() !== "clerk") return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
