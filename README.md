# Textcrew web

The Textcrew web app: what people use in a browser, on a laptop or a phone. Next.js renders the screens and its route handlers proxy the Textcrew API.

```
Browser ──▶ Next.js app ──/api/v1/*──▶ Next.js route handler ──Bearer token──▶ Textcrew API
             (screens)                  (adds the Clerk session                (../beckend)
                                         token on the server)
```

- **Screens**: chat, approvals, automations, activity, apps and your own MCP servers, crew, settings (general, agent and AI, credits, plans), onboarding, sign-in.
- **One layout, two shapes**: on a wide screen a sidebar sits beside the current screen; on a phone there is a top bar, the screen edge to edge and five tabs along the bottom (the rest is under More).
- **Installable on a phone**: "Add to Home Screen" on Android and iPhone opens it in its own window. See [Installing on a phone](#installing-on-a-phone).
- **The pages only talk to this app's own `/api/v1/*`.** `src/app/api/v1/[...path]/route.ts` forwards to the backend and adds the Clerk session token on the server, so the token never sits in page JavaScript or in an `EventSource` URL. Only user-facing paths are allowed through (no admin, waitlist or webhook routes).

This is the address the backend calls `WEB_APP_URL`: Polar returns here after checkout, app sign-in screens return here, and Tex's messages link here. The desktop app (`../user-frontend-desktop`) is a separate codebase built from the same screens.

API contract: `openapi/openapi.yaml`, copied from `../beckend/openapi/openapi.yaml`.

## Quick start (demo mode, no backend needed)

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

With no environment set, the app runs in **demo mode**: the proxy answers from an in-memory account (`src/lib/demo/`) and sign-in is skipped. Messages get a canned reply, approvals can be decided, and the coupon `TEXTCREW-DEMO` adds credits, so every screen can be exercised.

The demo account behaves like the backend at launch: Telegram and the web chat are switched on, Textcrew AI is on offer, and credits are charged for running time and for app actions that change something. Two settings show the other cases:

| | |
|---|---|
| `TEXTCREW_DEMO_PLAN=free` / `max` | The account on another plan (the default is Pro) |
| `TEXTCREW_DEMO_AI_ACCESS_MODE=own_only` | Textcrew AI is not on offer: remove the demo's API key and Tex can't start a job |

## Against the real backend

**With Clerk (how it runs for real)**

1. Start the backend (`../beckend`, `pnpm dev`, API on `:8080`).
2. Copy `.env.example` to `.env.local` and set `TEXTCREW_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (the same Clerk application as the backend).
3. `pnpm dev`. The backend's `WEB_APP_URL` and `CLERK_AUTHORIZED_PARTIES` default to `http://localhost:3000`, which is this app.

**Without Clerk, Docker or a Polar account (for working on the app)**

```bash
pnpm backend:local     # the real api + worker, on :8080
```

That starts the backend from `../beckend` with embedded Postgres and a throwaway Redis, seeds one user and prints two lines for `.env.local` (`TEXTCREW_API_URL` and a `TEXTCREW_DEV_TOKEN`). With the token set, the proxy signs every request as that user. Every `/v1` route, the database, the queues, credits and the Polar webhook handling are the real code; the agent, Composio and Polar's hosted checkout are stand-ins. The token is ignored in a production build. It needs about 1 GB of free memory.

## What the backend decides

The screens don't know which chat apps or which AI are on offer. They ask.

**Chat apps.** `GET /v1/channels` returns the linked chats (`items`) and the channels that are switched on (`available`, for example `["telegram", "web"]`). Onboarding, Settings, the chat panel and the chat filter are built from `available`: only those chat apps are offered, the first one is the default, and wording that lists chat apps is put together from the list (`src/lib/channels.ts`). `web` is the web chat itself, so it is never something to link; if it is missing, the composer gives way to a note. A chat linked before its channel was switched off still shows, marked "Switched off", and can be unlinked; its messages keep their label and stay in the chat filter. A link code for a channel that is off is refused with 403 `channel_disabled`.

**AI, three ways.** Settings → Agent & AI and the third onboarding step offer the same three choices:

1. **Your own API key** (recommended): Anthropic, OpenAI or OpenRouter. The provider bills the AI.
2. **Your Claude plan** (beta): runs Claude Code in the person's private workspace. Plain text only, no logos.
3. **Textcrew AI**: nothing to set up, paid in credits. It is what Tex uses when no key or plan is connected.

Which one is in use comes from `GET /v1/agent/settings` (`aiAccess`: `own_key`, `claude_plan`, `platform` or `none`). `none` means the backend requires your own AI (`AI_ACCESS_MODE=own_only`), so Textcrew AI is shown as "Not available" rather than hidden. The API has no field that says whether Textcrew AI could be used while a key or plan is running, so in that case the screen says "Not in use" and nothing more (`src/components/settings/agent-summary.ts`).

**Credits.** What credits pay for is written once, in `src/lib/credit-costs.ts`: Textcrew AI if you use it, the agent's running time (1 credit per 10 minutes), app actions that change something (1 credit each; reading and searching are free) and browser use on the Max plan (2 credits per minute). The usage chart and the credit history show the same four parts, from `GET /v1/usage` and `GET /v1/credits/ledger`.

## Installing on a phone

There is no store app. On a phone, the browser's "Add to Home Screen" (Android: "Install app") puts Textcrew on the home screen and opens it in its own window.

- `src/app/manifest.ts` is the web manifest, served at `/manifest.webmanifest`: name, colours, `display: standalone` and the icons in `public/icons/` (192 and 512, plain and maskable).
- `src/app/apple-icon.png` is the iPhone home-screen icon, and `appleWebApp` in `src/app/layout.tsx` adds the Apple tags.
- The viewport uses `viewport-fit=cover`, and the tab bar and the page keep clear of the home indicator and the notch with the safe-area insets.
- These files have extensions the sign-in proxy skips (`src/proxy.ts`), so a phone can fetch them before anyone has signed in.
- There is no service worker: nothing is cached for offline use and there are no push notifications.

The PNGs are drawn from `src/app/icon.svg` (plain) and `public/icons/icon-maskable.svg` (full bleed, face inside the middle 80%) with `rsvg-convert -w <size> -h <size>`. The Apple icon is `icon.svg` with square corners, at 180.

## Billing (Polar)

The backend owns Polar; the app never talks to it directly.

1. **Start**: Plans or Credits calls `POST /v1/billing/checkout` and sends the browser to the Polar URL it returns. The app remembers what it is waiting for (`src/lib/checkout.ts`).
2. **Pay**: on Polar's page. Polar then calls the backend's `/webhooks/polar`; only that changes the plan or adds credits.
3. **Return**: Polar sends the browser to `/billing?checkout=done`, which forwards to Plans.
4. **Confirm**: the app asks the backend every few seconds (there is no live event for a plan change) and confirms with a toast once the new plan or the top-up grant shows up.

The plan buttons follow the backend's rules: a second plan can't be started while the current one will renew, it can once the current one is set to end, and top-ups need a paid plan. `/billing?checkout=done` also works with no session, for checkouts started from the desktop app.

## Scripts

| | |
|---|---|
| `pnpm dev` | Dev server on :3000 |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint && pnpm typecheck && pnpm test` | Checks (ESLint, `tsc`, Vitest) |
| `pnpm backend:local` | The real backend on this machine, with stand-ins for the agent, Composio and Polar checkout |
| `pnpm openapi:sync` | Copy the contract from the backend and regenerate `src/lib/api/schema.d.ts` |

## Layout

```
openapi/             the API contract (copy of the backend's)
scripts/             local-backend.mjs
public/icons/        home-screen icons for the web manifest
src/app/
  (app)/             signed-in screens inside the shell
  api/v1/[...path]/  the proxy to the backend
  onboarding, sign-in, billing, connected
  manifest.ts        the web manifest ("Add to Home Screen")
src/components/      screens and UI primitives (ui.tsx, page.tsx, tex.tsx, shell/…)
src/lib/
  api/               generated types, typed client, TanStack Query hooks, SSE → cache
  demo/              the in-memory demo backend
  channels.ts        which chat apps to offer, from what the backend has switched on
  credit-costs.ts    what credits pay for, in the words every screen uses
  checkout.ts        what a Polar checkout is waiting for, and when it has arrived
```

`src/lib`, `src/components` and most of `src/app` started as a copy of the desktop app's. Until they share a package, a fix to a shared screen has to be made in both repos.

## Not done yet

- Admin screens (`/v1/admin/*`).
- Voice notes from the composer (files and text only).
- The crew page is a preview: only Tex works today and there is no API for the specialists (Byte, Patch and Scout).
- The API can't say whether Textcrew AI is on offer while a key or Claude plan is running, and has no way to choose Textcrew AI while a key is saved. Browser use on Max is not a plan limit in the contract either; the fallback feature list goes by the plan's id.
- Installed on a phone, the app has not been tried on a real Android phone or iPhone.
- Not yet run with a real Clerk application, real Polar products or a real agent container.
