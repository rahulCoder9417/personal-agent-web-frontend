# Textcrew web

The Textcrew web app: what people use in a browser, on a laptop or a phone. Next.js renders the screens and its route handlers proxy the Textcrew API.

```
Browser ──▶ Next.js app ──/api/v1/*──▶ Next.js route handler ──Bearer token──▶ Textcrew API
             (screens)                  (adds the Clerk session                (../beckend)
                                         token on the server)
```

- **Screens**: chat, approvals, automations, activity, apps and your own MCP servers, crew, settings (general, agent and AI, credits, plans), onboarding, sign-in.
- **One layout, two shapes**: on a wide screen a sidebar sits beside the current screen; on a phone there is a top bar, the screen edge to edge and five tabs along the bottom (the rest is under More).
- **The pages only talk to this app's own `/api/v1/*`.** `src/app/api/v1/[...path]/route.ts` forwards to the backend and adds the Clerk session token on the server, so the token never sits in page JavaScript or in an `EventSource` URL. Only user-facing paths are allowed through (no admin, waitlist or webhook routes).

This is the address the backend calls `WEB_APP_URL`: Polar returns here after checkout, app sign-in screens return here, and Tex's messages link here. The desktop app (`../user-frontend-desktop`) is a separate codebase built from the same screens.

API contract: `openapi/openapi.yaml`, copied from `../beckend/openapi/openapi.yaml`.

## Quick start (demo mode, no backend needed)

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

With no environment set, the app runs in **demo mode**: the proxy answers from an in-memory account (`src/lib/demo/`) and sign-in is skipped. Messages get a canned reply, approvals can be decided, and the coupon `TEXTCREW-DEMO` adds credits, so every screen can be exercised.

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
src/app/
  (app)/             signed-in screens inside the shell
  api/v1/[...path]/  the proxy to the backend
  onboarding, sign-in, billing, connected
src/components/      screens and UI primitives (ui.tsx, page.tsx, tex.tsx, shell/…)
src/lib/
  api/               generated types, typed client, TanStack Query hooks, SSE → cache
  demo/              the in-memory demo backend
  checkout.ts        what a Polar checkout is waiting for, and when it has arrived
```

`src/lib`, `src/components` and most of `src/app` started as a copy of the desktop app's. Until they share a package, a fix to a shared screen has to be made in both repos.

## Not done yet

- Admin screens (`/v1/admin/*`).
- Voice notes from the composer (files and text only).
- The crew page is a preview: only Tex works today and there is no API for the specialists.
- Not yet run with a real Clerk application, real Polar products or a real agent container.
