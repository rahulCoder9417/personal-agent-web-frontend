import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { afterAuthPath, requestOrigin, SIGN_IN_PATH, SIGN_UP_PATH, SSO_CALLBACK_PATH } from "@/lib/auth-flow";
import { authMode } from "@/lib/env";

// The pages are built ahead and served as they are, the same for everyone; this runs before each
// one and does what needs the request: who is signed in, and where they should be.

// Pages need a session; API routes answer 401 as JSON themselves, so they aren't redirected.
// The sign-in pages (sign in, sign up, and where Google sends the browser back to) are for
// people who have no session yet.
// /connected and /billing are where a browser lands after connecting an app or paying.
// They show no account data, and that browser may not be signed in (the desktop app's case).
const isOpen = createRouteMatcher([SIGN_IN_PATH, SIGN_UP_PATH, SSO_CALLBACK_PATH, "/connected", "/billing", "/api/(.*)"]);
const isSignInPage = createRouteMatcher([SIGN_IN_PATH, SIGN_UP_PATH]);
const isAuthPage = createRouteMatcher([SIGN_IN_PATH, SIGN_UP_PATH, SSO_CALLBACK_PATH]);

/** An address on this app, as the browser sees it (behind Vercel or Caddy, the forwarded host). */
function here(request: NextRequest, path: string): URL {
  return new URL(path, requestOrigin(request.headers) || request.nextUrl.origin);
}

const withClerk = clerkMiddleware(
  async (auth, request) => {
    if (isSignInPage(request)) {
      // Someone who is signed in has nothing to do here: on to the page they came for.
      if ((await auth()).userId) {
        return NextResponse.redirect(here(request, afterAuthPath(request.nextUrl.searchParams.get("redirect_url"), here(request, "/").origin)));
      }
      return;
    }
    if (!isOpen(request)) await auth.protect();
  },
  // Where someone without a session is sent. Left out, that is Clerk's own hosted sign-in page.
  { signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH },
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Only Clerk mode has sessions to check, or accounts to sign in to: the sign-in pages lead home.
  if (authMode() !== "clerk") return isAuthPage(request) ? NextResponse.redirect(here(request, "/")) : NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
