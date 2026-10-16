# Textcrew web

The Textcrew web app: what people use in a browser, on a laptop or a phone. Next.js renders the screens and its route handlers proxy the Textcrew API.

```
Browser ──▶ Next.js app ──/api/v1/*──▶ Next.js route handler ──Bearer token──▶ Textcrew API
             (screens)                  (adds the Clerk session                (../beckend)
                                         token on the server)
```

- **Screens**: chat, approvals, automations and pull-request review, activity, integrations (the chat apps, the apps and your own MCP servers: see [Integrations](#integrations)), pricing (your plan and Cancel, the plans, top-ups and how credits work: see [Pricing](#pricing)), settings (general, agent and AI, memory, credits), help, which also explains the crew (see [Help](#help) and [The crew](#the-crew)), the welcome flow and the "Getting started" checklist (see [Getting started](#getting-started)), sign-in and sign-up.
- **One layout, two shapes**: on a wide screen a sidebar sits beside the current screen, and folds down to a rail of icons; on a phone there is a top bar, the screen edge to edge and five tabs along the bottom (the rest is under More). See [Panels that fold](#panels-that-fold).
- **Every screen takes the whole width**, except Settings, which is one readable column beside its sections. See [Width](#width) and [Settings](#settings).
- **Installable on a phone**: "Add to Home Screen" on Android and iPhone opens it in its own window. See [Installing on a phone](#installing-on-a-phone).
- **The pages only talk to this app's own `/api/v1/*`.** `src/app/api/v1/[...path]/route.ts` forwards to the backend and adds the Clerk session token on the server, so the token never sits in page JavaScript or in an `EventSource` URL. Only user-facing paths are allowed through (no admin, waitlist or webhook routes).

This is the address the backend calls `WEB_APP_URL`: Polar returns here after checkout, app sign-in screens return here, and Tex's messages link here. The desktop app (`../user-frontend-desktop`) is a small window around this live web app, so it has no screens of its own: what is deployed here is what it shows.

API contract: `openapi/openapi.yaml`, copied from `../beckend/openapi/openapi.yaml` (`pnpm openapi:sync`). The copy is the backend's own: nothing in it is written by hand.

## Quick start (demo mode, no backend needed)

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

With no environment set, the app runs in **demo mode**: the proxy answers from an in-memory account (`src/lib/demo/`) and sign-in is skipped. Messages get a canned reply, approvals can be decided, and the coupon `TEXTCREW-DEMO` adds credits, so every screen can be exercised.

Demo mode, sign-in or the development token is decided when the app is built, or when `pnpm dev` starts (see [Loading](#loading)). After setting or removing the Clerk keys, `TEXTCREW_DEMO` or `TEXTCREW_DEV_TOKEN`, restart `pnpm dev` or build again.

The demo account behaves like the backend at launch: Telegram and the web chat are switched on, Textcrew AI is on offer, Byte, Patch and Scout are on the crew, and credits are charged for running time, for app actions that change something and for Scout's web searches. Three settings show the other cases:

| | |
|---|---|
| `TEXTCREW_DEMO_PLAN=free` / `max` | The account on another plan (the default is Pro) |
| `TEXTCREW_DEMO_AI_ACCESS_MODE=own_only` | Textcrew AI is not on offer: remove the demo's API key and Tex can't start a job |
| `TEXTCREW_DEMO_CREW_AVAILABLE=byte` | Only the named specialists work; the rest show as coming soon (the default is all three, an empty value is none) |
| `TEXTCREW_DEMO_ACCOUNT=new` | Someone who has just signed up instead of the account in use for three weeks: see [A brand-new account](#a-brand-new-account-in-the-demo) |
| `TEXTCREW_DEMO_TELEGRAM=blocked` | The linked Telegram chat has blocked the bot: Integrations → Chat apps says "Blocked the bot" and what to do |
| `TEXTCREW_DEMO_AUTOMATIONS_CHAT=none` | The automations were all made before the Automations chat existed, so the backend hasn't started it yet: the pinned row stands in for it until the demo's run, about 20 seconds after the app first connects |

Things to try in the demo:

- **The crew at work**: ask Tex in the web chat to research something ("research what other tools charge"), fix code ("fix the bug in…") or review ("review my pull request"). Scout, Byte or Patch reports three lines while it works, then Tex answers. Scout's search costs 1 credit.
- **Replies written as they come**: send anything in the web chat and Tex's answer appears a few words at a time, then the finished message takes its place. Ask "How does my day look?" (anything with "my day" or "inbox") to see Tex work a tool at a time, as the real agent does: it writes "Let me check your calendar." and "Now your inbox." before two tools, which are never shown (too short, started over too soon), then a longer line before reading two emails, which stays as a muted step with "Tex · reading 2 emails" under it while the answer is written below; the answer then takes the draft's place and the step folds into "Show steps (1)". Ask Tex to research something and "I’ll hand this to Scout." is never shown either; the answer is written after Scout's last line. A fact to remember and a risky request are answered at once, as before.
- **Replies drawn as Markdown**: the web chat opens on an answer with a heading, a table, a block of code, a numbered list and a link. Ask Tex to research something and the answer has a table, a list and links; ask it to fix code and it has code with a Copy button. Every other reply is a plain sentence and looks as it always did, and so do the Telegram chats.
- **The crew, from the chat**: there is no Crew screen and no form for Byte or Patch. Ask Tex in the web chat: "Fix the typo in the README on my repo acme/website" goes to Byte, "Review pull request 42 in acme/website" to Patch, each with its three lines and then Tex's answer. Help → The crew has both as "Try it" links, and `/crew` leads there. With `TEXTCREW_DEMO_CREW_AVAILABLE=byte` its line-up marks Patch and Scout "Coming soon".
- **Pull-request review** (Automations → Pull-request review): two repos are seeded, one on and one paused after failures. Pro allows five automations and four are used, so one more repo can be given review and the next one hits the plan limit. A repo owned by `octocat` stands in for one the GitHub account can't administer. Disconnect GitHub under Integrations → Apps to see the screen without it.
- **Choosing Textcrew AI** (Settings → Agent & AI): the demo has an Anthropic key saved, so "Use Textcrew AI" and the way back are both there.
- **The chat history**: four chats are seeded, two in the web chat and two on Telegram. Open the Telegram one to read it (it can't be answered from here), open the earlier web one and write in it (it moves to the top and Tex answers there), and start a "New chat". Rename or delete one from the three dots on its row. The 31st new chat in an hour is refused with a toast.
- **Unread chats**: the later Telegram chat has a blue dot and a bolder name: Tex wrote there since it was last looked at. Open it and the dot goes. Write in one web chat, open another before Tex answers, and the first gets the dot when the answer arrives. With the history put away, the header's Show chats button has a dot too.
- **The Automations chat**: pinned under "New chat", it holds the runs of "Today's meetings" and the pull-request review's verdict. The later Telegram chat shows the copy of that verdict, the way the backend sends it there. Open another chat and wait: about 20 seconds after the app first connects, "Today's meetings" runs once more, and the Automations row (and, with the history put away, the header's Show chats button) gets a dot until it is opened. Write in it and Tex answers there, while the web chat you had open stays the one a new message goes to. It has no menu: it can't be renamed or deleted, and the demo refuses both with 409, as the backend does. Automations → "See every run in the Automations chat" opens it. With `TEXTCREW_DEMO_AUTOMATIONS_CHAT=none` the account starts with none, as someone's whose automations were made before the Automations chat existed: the row stands in for it ("No runs yet", and the next run when opened) until the demo's run starts it.
- **Claude Code's model and effort** (Settings → Agent & AI): connect the Claude plan with any code of four characters or more, then pick a model and a thinking effort under Engine.
- **The dropdowns**: the time zone (Settings → General) is searched by typing a city or an offset ("kolk", "new york", "5:30"); the model and effort open a list, and on a phone a sheet from the bottom of the screen. Both work with the keyboard alone.
- **Memory** (Settings → Memory): eight memories are seeded. Tell Tex "remember that I send invoices on the 1st" in the web chat and it is saved; "remember that my password is…" is refused. Both are in the activity log.
- **Apps that can't be connected yet** (Integrations → Apps): HubSpot, Asana and Airtable say "Not available yet" and have no Connect button, the way an app without a setup on the server does.
- **A brand-new account**: `curl -X POST "localhost:3000/api/demo/reset?account=new&ai=own_only"`, then reload. See [below](#a-brand-new-account-in-the-demo).
- **Connecting an app** (Integrations → Apps, or the welcome flow's apps step): Connect opens Textcrew's own connect screen first. Cancel changes nothing; "Continue to Google" connects at once (there is no provider to sign in to) and comes back saying so. Reconnect the expired Google Drive account to see the screen say why. `/connected?app=gmail&status=failed` shows the page for a sign-in that didn't go through.
- **Telegram, linked and unlinked** (Integrations → Chat apps): the seeded account has Telegram linked as @aarav_s, with its masked chat id ("•••• 4821") and "Last message 17 min ago"; with `TEXTCREW_DEMO_TELEGRAM=blocked` it says "Blocked the bot". Unlink asks first in a dialog, then a toast says so and the one-time code is offered right there; "Get my Telegram code" makes one, and the demo links it by itself after six seconds.
- **Disconnecting an app** (Integrations → Apps): each account has its own Disconnect. GitHub's dialog lists the two pull-request reviews that stop with it; Gmail's second account says Tex goes on with the first. Afterwards a toast says so and GitHub is back under "Add more" with Connect.
- **Pricing**: the demo account is on Pro. Press **Cancel plan**: the dialog says you keep Pro until the period ends and then move to Free; **Keep my plan** changes nothing, **Cancel plan** does it, a toast says so and the card says when it ends. With `TEXTCREW_DEMO_PLAN=free` or `max` (or `TEXTCREW_DEMO_ACCOUNT=new`, which is Free) the page shows that plan. `curl -X POST localhost:3000/api/demo/reset` starts the account over.
- **Toasts**: on Pull-request review, turn review on for one more repo (five of five), then for another. The refusal is a toast with "See plans". A repo owned by `octocat` is refused under the field instead, because that one is about what was typed.
- **Automations**: click a template or a "Try it in chat" link and the chat opens with the request typed in. The demo's canned reply doesn't make an automation, so the list stays as seeded.
- **An automation as a flow**: click "Today's meetings" (or its strip of five steps) on Automations. Its page draws the five boxes; click one, or Tab to it and press Enter, to read it in full under the canvas. "Today's meetings" was made on Telegram, so its Results box says "Copy to Telegram"; "northwind/api" shows a paused pull-request review with its repo. Narrow the window below 768px, or pick "List view", for the list a phone gets. `/automations/aut_nope` shows the page for an automation that isn't there.

## Against the real backend

**With Clerk (how it runs for real)**

1. Start the backend (`../beckend`, `pnpm dev`, API on `:8080`).
2. Copy `.env.example` to `.env.local` and set `TEXTCREW_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (the same Clerk application as the backend). `CLERK_JWT_KEY` (Clerk's JWT public key, PEM) is optional: with it the proxy checks session tokens itself instead of fetching Clerk's keys. Clerk's package doesn't read that variable on its own; `clerkOptions` in `src/proxy.ts` hands it over.
3. `pnpm dev`. The backend's `WEB_APP_URL` and `CLERK_AUTHORIZED_PARTIES` default to `http://localhost:3000`, which is this app.

**Without Clerk, Docker or a Polar account (for working on the app)**

```bash
pnpm backend:local     # the real api + worker, on :8080
```

That starts the backend from `../beckend` with embedded Postgres and a throwaway Redis, seeds one user and prints two lines for `.env.local` (`TEXTCREW_API_URL` and a `TEXTCREW_DEV_TOKEN`). With the token set, the proxy signs every request as that user. Every `/v1` route, the database, the queues, credits and the Polar webhook handling are the real code; the agent, Composio and Polar's hosted checkout are stand-ins. The token is ignored in a production build. It needs about 1 GB of free memory.

## Loading

- **The pages are static.** Every screen except `/billing` is built ahead (`○` in `pnpm build`'s route table) and served from Vercel's CDN; the data comes afterwards from `/api/v1/*`. Nothing in the pages reads the request: whether the app runs with Clerk, in demo mode or with the development token is decided once, when the app is built (`next.config.ts` writes it in as `NEXT_PUBLIC_TEXTCREW_AUTH_MODE`, read with `builtAuthMode()` in `src/lib/auth-mode.ts`). `/billing` reads the session, so it is rendered per request.
- **The proxy still runs before every page** (`src/proxy.ts`) and does what needs the request: it asks for a session, sends someone signed in away from the sign-in pages and, without accounts, sends the sign-in pages home. It and the API route read the environment on every request (`authMode()` in `src/lib/env.ts`); on Vercel and in the Dockerfile that is the environment the app was built with.
- **The first page asks only for what it draws.** The shell asks for the account and the pending approvals; the chat for the channels, the chat history, the open conversation's messages and the agent's state; and the live stream opens. That is all a phone sends (6 calls and the stream), plus, once for an account whose time zone nobody has set, the `PATCH /v1/me` that sets it (see [Automations](#automations)). The messages are asked for once the history has said which conversation is open, so that one call waits for another. The sidebar, hidden on a phone, asks for the plans only on a wider screen (7), and the chat's side panel is only drawn where it shows (from 1100px, or from 1340px while the chat history is open beside the thread, and not while it is folded away), where it adds activity, automations and the agent settings (10). Both follow `useMediaQuery` (`src/lib/media-query.ts`), which says no on the server and in the first render. While the account hasn't hidden the "Getting started" checklist, the sidebar (from 768px), an empty chat and More also ask for what the checklist is worked out from: the agent settings, the apps and the automations, and the chat history and linked chats where nothing else has; that is 2 or 3 more calls, and on a phone only while a chat is empty. Once it is hidden they aren't asked for. A finished checklist still asks: nothing marks it finished on the account (see [Getting started](#getting-started)). The checkout watcher asks for the subscription, credits and plans only while a checkout is waiting. The chat history asks for the automations only while there is no Automations chat, to know whether to pin its stand-in (see [Chat](#chat)); on a phone that is when the drawer opens.
- **What draws Markdown is not part of the first page.** It is a chunk of its own (147 kB, 44 kB gzipped), fetched the first time a reply has something to draw. See [Tex's replies are drawn as Markdown](#texs-replies-are-drawn-as-markdown).
- **The live stream reconnects** every five minutes on Vercel (the function's time limit) and whenever the connection drops. The backend's stream has no event ids and replays nothing, so a reconnect asks again for the open conversation's messages, the chat history, the approvals and the agent's state; in a tab nobody is looking at they are only marked stale and asked for when the tab is shown again (`catchUpAfterReconnect` in `src/lib/api/stream.ts`).
- **A stream that has gone quiet is replaced.** The browser can hold a connection open for minutes while nothing comes through it, and doesn't notice. The backend writes a `ping` after 25 seconds without an event, so 70 seconds with nothing at all (not an event, not a ping) means the connection is dead: the app opens a new one, which catches up as above. This is looked at every 10 seconds, and at once when the tab is shown again. A stream the proxy refused (a 401 or a 502) is given up for good by the browser; the app opens it again after 3 seconds, then twice as long each time it is refused again, up to a minute (`connectLive` in `src/lib/api/stream.ts`).

## Sign-in

Clerk is the sign-in service: it holds the accounts, checks passwords and codes, sends the emails and makes the session the backend trusts. The screens are this app's own. No Clerk component is drawn; the forms sit on Clerk's hooks (`useSignIn()`, `useSignUp()`, `useClerk()`, its "custom flows" API). The rest of the Clerk use is unchanged: the provider in `src/app/layout.tsx`, the session token the API proxy adds, sign-out and deleting the account.

| Page | What it does |
|---|---|
| `/sign-in` | Continue with Google; or email and password, with "Forgot password?" (a code by email, then a new password, which signs out the other devices) and "Email me a code instead". When Clerk wants a code from the inbox after a right password (a new device), it asks for it. An attempt Clerk still holds from earlier (a refused password, a Google trip that came back here) is dropped while the first step shows, because Clerk's Google sign-in would carry it on and go nowhere (`dropsLeftoverSignIn`). |
| `/sign-up` | Continue with Google; or first and last name (optional), email and password, then the code Clerk emails to check the address. |
| `/sso-callback` | Where Google sends the browser back to when Clerk still needs this app: turns "sign in with Google" by someone new into an account and "sign up with Google" by someone known into a sign-in, or says what went wrong. |

- **The look**: the sign-in pages wear textcrew.in's own clothes, so signing in feels like the same site people saw before signing up (`AuthFrame` in `src/components/auth/auth-frame.tsx`). Its light page colour (the app's warm paper lightened halfway to white), the faint dot grid fading out downwards, the apps floating on white tiles around the hero, the lockup, the headline set heavy and tight with the blinking blue cursor, the hero's line, and "Text it from" with the crew's faces. On a wide screen (from 1024px) the hero is on the left and the form is on a white card on the right, 400px wide at most, with the crew standing on its top edge, Tex in the middle and taller, as at the end of textcrew.in. The tiles at the page's edges show only from 1280px, so none is cut off. In a shorter window the crew gets smaller, so a laptop's 720px holds the sign-up form whole; a very short one leaves out the row under the line, the tiles, then the crew, and the page scrolls rather than cutting anything off. Below 1024px the hero is a band at the top with the lockup, the headline and three of the apps, and the form is on a white sheet under it with the crew standing on its edge. The same frame holds sign-in, sign-up, the codes, the new password and the Google callback.
- **Built for what the Clerk application has switched on** (read from its public `/v1/environment`): email as the only identifier, a password (at least 15 characters, checked against known leaks), a code by email (sign-in, verifying at sign-up, resetting the password), Google, optional first and last name, no second factor, bot protection at sign-up. Switching more on in the Clerk Dashboard (a phone number, a username, an authenticator app) needs the forms to change; until then the page says what it can't ask for. The social buttons come from `SOCIAL_PROVIDERS` in `src/lib/auth-flow.ts`.
- **Clerk's refusals in plain words**: `describeAuthError` in `src/lib/auth-flow.ts` turns Clerk's error codes into a sentence, under the field it is about or above the form. A password rule keeps Clerk's own sentence, which carries the number.
- **Where people land**: on the page the proxy sent them from (`redirect_url`, carried between the three pages), else on the home screen. Only addresses inside this app are followed (`afterAuthPath`). Someone already signed in who opens `/sign-in` or `/sign-up` goes straight there: the proxy sends them, so the pages themselves are static and read `redirect_url` and `step` in the browser.
- **The proxy** (`src/proxy.ts`) lets `/sign-in`, `/sign-up` and `/sso-callback` open without a session (exactly those paths, nothing under them) and sends people without one to `/sign-in`, not to Clerk's hosted page. The addresses are set in code (`SIGN_IN_PATH`, `SIGN_UP_PATH`), so no environment variable is needed for them.
- **Bot protection**: Clerk draws its check in `<div id="clerk-captcha">` on the sign-up and callback pages when it wants one; most of the time it stays empty.
- **Demo mode and the development token** have no accounts: the proxy sends the three pages to the home screen. A build made without the Clerk keys and run with them shows a note on these pages instead of sending the browser round in circles.

## Getting started

A new account goes through a short welcome flow, then has a "Getting started" checklist in the app until the steps that matter are done. Whether a step is done always comes from the API; what the account keeps is only whether the flow was finished and whether the checklist was hidden.

**What the account keeps.** `GET /v1/me` has two first-run marks: `onboardingCompletedAt` (when the welcome flow was finished or skipped; null: show it) and `gettingStartedDismissedAt` (when the checklist was hidden; null: it may show). `PATCH /v1/me` sets them with `onboardingCompleted` and `gettingStartedDismissed` (true sets the time, keeping the first one; false clears it). Every change is shown at once and put back if the API says no (`useUpdateOnboarding` in `src/lib/api/hooks.ts`), with a toast. Accounts made before the marks existed have both null, so they get the flow once too. A backend that doesn't send the fields shows neither the flow nor the checklist, since neither could be put away. The browser keeps only a hint that the flow was done, so the chat needn't wait for the account (see below); the account always decides.

**The welcome flow** (`/onboarding`, `src/components/onboarding/flow.tsx`). Opening the chat leads there while `onboardingCompletedAt` is null; that is everyone just after signing up. A new account lands there straight from the sign-up (with email, or with Google from either sign-in page), without a stop on the chat to ask the API first; a person sent to sign up from another page lands on that page (`afterSignUpPath` in `src/lib/auth-flow.ts`). Nothing of the app is seen on the way (`WelcomeGate` in `src/components/onboarding/welcome-gate.tsx`, the rule in `homeView` in `src/lib/onboarding.ts`). Once the account has finished or skipped the flow, this browser keeps a note of it (`tc:onboarded:<Clerk user id>` in localStorage, `src/lib/onboarded-here.ts`), and with that note the chat shows at once, from the first paint, as it always did: a small script in the page's head checks the note before anything is drawn. Without the note (a new account, or a browser that hasn't seen this account yet) the chat's address shows a spinner over the whole window until `GET /v1/me` has answered, then the flow or the app; the app is already drawn under the spinner, so its own requests go out alongside the account's rather than after it. If the account then says the flow isn't done after all (shown again from Settings, or reset by an admin), the note is dropped and the flow comes, after a moment of the app. Signing out or deleting the account drops every note. If the account doesn't load and there is no note, the chat's address says so, with Try again, rather than showing the app. The other pages show at once and don't lead to the flow. Not when the chat was opened by a link that asked for something (`?draft=`, `?chat=automations`): that goes where it asked, at once, also after the chat has tidied the address, and the flow comes the next time the chat is opened. Five steps, each with a "Skip" and the whole flow with "Skip for now" at the top; the row of steps at the top can be clicked, and ticks each step that the API says is done:

1. **Meet the crew**: what Textcrew is in one screen. The four faces, who each is (the backend's `GET /v1/crew` words, "Coming soon" for one not switched on here), three lines on how it works, and what the next steps are.
2. **Your AI** (marked "Needed" while `aiAccess` is `none`): the three ways from Settings, the Claude plan first, each opening what Settings uses to connect it (Anthropic's sign-in and the pasted code, the key form, Textcrew AI). Without an AI Tex can't answer, so this is the step that matters most; it says so in those words.
3. **Telegram** (optional; "Chat app" when several are on offer, left out when none is): the one-time code, as before.
4. **Apps** (optional, left out when nothing can be connected here): the first six apps that can be connected, through the connect screen of Integrations → Apps, in a new tab.
5. **Say hi**: what is set up (the AI, Telegram, the apps, each with a way back to its step), the time zone Tex works in (set from the browser), and a first message to open the chat with, typed in and not sent. The message fits the apps connected ("What's in my inbox today?…" with Gmail); three more are offered under it (`firstMessages` in `src/lib/onboarding.ts`).

Finishing the last step, or "Skip for now", saves `onboardingCompleted: true` and goes to the chat. If that save fails, a toast says so and the chat doesn't send the person back to the flow for the rest of the visit. `/onboarding?step=ai` (also `chat`, `apps`, `hi`) opens one step for the checklist: its button reads "Done" and goes back (to `?return=`, a page of this app, or the chat), and leaving doesn't count as finishing the flow. Only the AI step is opened that way from the app now. Linking Telegram and connecting apps outside the flow happen in Integrations, so no "Telegram" or "Link" outside the flow leads to `/onboarding` (`src/lib/no-welcome-detour.test.ts` checks the code and the screens for it).

**The checklist** (`src/components/onboarding/getting-started.tsx`, the rules in `src/lib/onboarding.ts`), most important first:

| Step | Done when | Leads to |
|---|---|---|
| Connect your AI | `GET /v1/agent/settings` `aiAccess` isn't `none` (with Textcrew AI on offer, a new account already runs on it) | the flow's AI step |
| Connect an app | an app in `GET /v1/apps` has an `active` connection (left out when nothing can be connected here) | Integrations → Apps |
| Send Tex a first message | a conversation in `GET /v1/conversations?kind=chat` has a title from something said, or a `lastMessageAt` after its `startedAt` | the chat, with a first message typed in |
| Link Telegram, optional | `GET /v1/channels` has a linked chat other than the web chat (left out when no chat app can be linked) | Integrations → Chat apps, with the code ready (`/integrations?link=telegram`) |
| Try an automation, optional | `GET /v1/automations` has one | Automations |

- **Where**: in an empty chat, under Tex; in the sidebar, as a card above the credits ("2 of 5", a bar and the next step) that opens the whole list beside the sidebar, a ring with the count on the folded rail; and at the top of More on a phone. While the chat shows it, the sidebar's card steps aside, so it is never on screen twice.
- **When it goes**: by itself once the AI, an app and a first message are done (the optional ones don't keep it), or when the person hides it with × (`gettingStartedDismissed: true`). Settings → General → Getting started brings a hidden checklist back and shows the welcome tour again (`onboardingCompleted: false`, then the flow opens).
- **The side panel's own note** stays only for a missing AI ("Tex needs an AI"), since Tex can't answer without one; linking a chat app is on the checklist.
- **The way to Help**: the checklist ends with "How Textcrew works" (the card and the sidebar's popover), and the flow's last step offers "See how it works", which leaves the flow like its other links. See [Help](#help).

### A brand-new account in the demo

`TEXTCREW_DEMO_ACCOUNT=new pnpm dev` starts the demo as someone who has just signed up (`createNewAccount` in `src/lib/demo/seed.ts`): Meera, on the Free plan, with the 100 sign-up credits, nothing linked or connected, nothing said, the time zone still UTC (the browser's is set on the first page) and both first-run marks empty, so the chat leads to the welcome flow. Without restarting: `POST /api/demo/reset?account=new` (or `account=seeded` for the usual account, whose welcome flow was finished when it signed up and whose checklist has gone by itself), then reload; `&ai=own_only` takes Textcrew AI off, as the beta runs, so the AI step is needed and a message sent without an AI gets the backend's own note ("Connect your own AI first…"). In the flow: the Claude plan connects with any code of four characters, the Telegram code links itself after six seconds, and an app connects on "Continue to Google". The route answers 404 outside demo mode.

## Help

`/help` explains how Textcrew works, in short answers, for what the welcome flow can't say: the Telegram bot's commands, the three ways to give Tex an AI, apps and why Google's screen names Composio, approvals, automations, credits and plans, memory and privacy, and what to do when something doesn't work. It is also where the crew is explained (see [The crew](#the-crew)).

- **Where it is**: "Help" after Settings in the sidebar; on a phone, the last row of More (More stays lit on it). Also linked from the "Getting started" checklist, the welcome flow's last step, and Settings → General → Help.
- **The page** (`src/components/help/help-screen.tsx`): a search in the header; what Textcrew is, with the most asked answers; the ten topics as cards (a row each on a phone); then each topic with buttons to the screens it is about, and its answers as cards in as many columns as fit (`Columns`, at least 380px each). The whole width is used; a paragraph keeps a comfortable line.
- **An answer** is a question and short blocks: paragraphs, numbered steps, lists, a two-column table (the bot's commands), notes, and messages to try. A message to try has "Try it →", which opens the chat with it typed in and not sent (`/?draft=`, as on the automations page).
- **Each answer has an address of its own** (`/help#telegram-commands`), opened with the answer ringed (`:target`). Its link button copies the address, with a toast; if the browser refuses, the address bar gets it and a toast says so. Useful for sending someone the answer to their question.
- **The search** wants every word typed, in any case and without accents (`/new` is a word). The answer whose question holds every word comes first, then the one that says the words most often; a topic comes as high as its best answer (`searchHelp` in `src/lib/help.ts`). With nothing found, it says so, with a way back and a link that asks Tex in chat.
- **The crew** has a part of its own, second, at `/help#crew` (where `/crew` leads): who is on the crew here, as faces with each one's name and role, "Coming soon" on one the backend hasn't switched on, each leading to its answer (`CrewLineup` in `src/components/help/crew-lineup.tsx`, from `GET /v1/crew`; left out while searching, and until the list has come). Then the answers: who does what; asking Tex in the chat for a code change (Byte) and for a review (Patch); review of every pull request in a repo, the one thing set up on a screen; a whole brief in one message; research (Scout); and who is at work.
- **The words** are in `src/lib/help-content.ts`, written from what the backend does today (`../beckend/docs/hld-mvp.md`, `backend-report.md` and the bot's code), in plain words. They are not fetched: when the backend changes something a user sees (a limit, a command, a price, a reply), change the sentence there too. The crew's examples (`CREW_EXAMPLES`), the three kinds of automation and what credits pay for come from `crew.ts`, `automations.ts` and `credit-costs.ts`, so those stay the same everywhere.
- **The markup in a sentence** (`parseInline`): `{apps}` is a link to a place, named as the app names it ("Integrations → Apps"); `[words](#ai)` a link; `**bold**` a button's name; `` `code` `` something to type. Every place is one entry of `PLACES` in `src/lib/help.ts`, with its name and address, the Integrations ones from `src/lib/integrations.ts` ("Link Telegram" is `linkChatHref("telegram")`, never the welcome flow). When a screen moves or is renamed, only that table changes.
- **Tests**: every topic and answer is drawn, every link on the page leads to a page the app has (read from `src/app`, `src/test/app-routes.ts`), to a part of the page or to the privacy policy, every bot command is explained, and the search finds what it should.

## What the backend decides

The screens don't know which chat apps or which AI are on offer. They ask.

**Chat apps.** `GET /v1/channels` returns the linked chats (`items`) and the channels that are switched on (`available`, for example `["telegram", "web"]`). The welcome flow, the checklist, Integrations, Settings, the chat panel and the chat filter are built from `available`: only those chat apps are offered, the first one is the default, and wording that lists chat apps is put together from the list (`src/lib/channels.ts`). `web` is the web chat itself, so it is never something to link; if it is missing, the composer gives way to a note. A chat linked before its channel was switched off still shows, marked "Switched off", and can be unlinked; its messages keep their label and stay in the chat filter. A link code for a channel that is off is refused with 403 `channel_disabled`.

**AI, three ways.** Settings → Agent & AI and the welcome flow's AI step offer the same three choices (the welcome flow lists the Claude plan first, the one that has run end to end, and says only "Beta" beside it):

1. **Your own API key** (recommended): Anthropic, OpenAI or OpenRouter. The provider bills the AI.
2. **Your Claude plan** (beta): runs Claude Code in the person's private workspace. Plain text only, no logos. Once it is connected, the Engine group has two dropdowns, "Model" and "Thinking effort", each with "Default" (Claude Code's own) first. Before that, the Engine group says they come with the plan and links to its card.
3. **Textcrew AI**: nothing to set up, paid in credits. It is what Tex uses when no key or plan is connected.

`GET /v1/agent/settings` says all of it (`src/components/settings/agent-summary.ts` puts it into words):

- `aiAccess` (`own_key`, `claude_plan`, `platform` or `none`) is what pays for the AI right now.
- `platformAvailable` is whether Textcrew AI is on offer. When it is false (`AI_ACCESS_MODE=own_only` on the backend) the card says "Not available" rather than hiding.
- `claudeModel` and `claudeEffort` are what Claude Code runs with (null is its default), and `claudeChoices` is what they can be set to, in the order the dropdowns offer them (`src/lib/claude-code.ts`). `models` holds every Claude model Claude Code can use, each with an id, a label, a group (`current` or `older`, shown as the dropdown's headings "Current models" and "Older models"), the effort levels it takes, and sometimes a short note (Fable's usage credits), which is the model's second line in the list. The effort dropdown offers only the levels of the chosen model (all of them on "Default"); it is greyed out for a model with none (Opus 4.5, Haiku 4.5). At the foot of the Engine card: the chosen model's note, and a line when the saved effort does not apply to it or runs at a lower level (xhigh on Sonnet 4.6 runs at high). `efforts` is every level. A change is saved as it is made (`PATCH /v1/agent/settings` with `claudeModel` or `claudeEffort`; "Default" sends null), shown at once and put back if refused. They can be set whatever runs now and apply to turns on Claude Code; a value not offered is 400 `invalid_request`.
- `aiPreference` (`auto` or `platform`) is what the person chose. Someone with a key saved or a Claude plan connected can choose Textcrew AI anyway ("Use Textcrew AI" sends `{ aiPreference: "platform" }`) and go back ("Go back to your Anthropic key" sends `{ runtime: "hermes", aiPreference: "auto" }`; to the Claude plan, `{ runtime: "claude_code", aiPreference: "auto" }`). The key and the plan stay saved either way. With Textcrew AI chosen the agent shown as running is Hermes, and picking Claude Code goes back to the plan.

**Apps.** `GET /v1/apps` lists the catalog with each app's connections, whether the plan includes it (`availableOnPlan`) and whether it can be connected on this server at all (`connectable`: the server has a Composio setup for it; today that is Gmail and GitHub). An app that isn't connectable is listed after the ones that are, says "Not available yet" and has no Connect button; a connected one loses "Add account" and "Reconnect" (Disconnect stays). The welcome flow and the checklist offer only apps that are on the plan and connectable. A backend from before the field existed doesn't send it, and that reads as connectable (`isConnectable` in `src/components/apps/apps-logic.ts`), so an older server doesn't switch every app off.

**Connecting an app.** No screen leaves for another site straight from a Connect button. Connect, Add account and Reconnect (Integrations → Apps) and Connect (the welcome flow) open Textcrew's own connect screen first (`src/components/apps/connect-dialog.tsx`): Tex and the app side by side, what Tex can do with the app (`App.description`, in the backend's words), the rules that hold for every app (Tex asks before it sends, deletes or changes something that's already there; reading is free and a change costs 1 credit; the sign-in is on the provider's own page) and "Continue to Google" (`App.provider`). Its words are `connectCopy` in `apps-logic.ts`, with words of its own for a backend that doesn't send the two fields. Only Continue calls `POST /v1/apps/{appSlug}/connect`, so Cancel leaves no pending connection behind. The next page is the provider's own sign-in when the server uses our own sign-in app for that app, and Composio's connect page otherwise (the backend decides; the screen says the same either way).

- **The way back.** Composio sends the browser back with `status=success` or `status=failed` added (`connectOutcome`). From Integrations → Apps the sign-in takes over the tab and returns to `/integrations/apps?connected=<slug>` (the backend's own default, `/apps?connected=<slug>`, is redirected there with its query), where a toast says "Gmail connected" or, as an error, "Gmail didn't connect". The welcome flow opens the sign-in in a new tab so it stays put; that tab returns to `/connected?app=<slug>`, which says "Gmail is connected" or "Gmail didn't connect" with the app's icon beside Tex. Anything else that lands on `/connected` still says "All set".
- **A refusal** (the plan's limit, an app the server can't connect, Composio being down: 403, 404, 503) closes the screen and is a toast, the plan's limit with "See plans".

**The crew.** `GET /v1/crew` lists Tex and the specialists with a name, role and description each, whether each one works on this deployment yet (`available`), and for Scout which plan the real browser needs and whether it is built yet (`browser`). Help's crew line-up, the welcome flow's first step, the note on Pull-request review when Patch isn't on the crew here, and the browser note on Pricing's Max plan are built from it (`src/lib/crew.ts`). The app keeps the figures and their colours (`CREW_COLOUR`), and a request to try for each member (`CREW_EXAMPLES`).

**Credits.** What credits pay for is written once, in `src/lib/credit-costs.ts`: Textcrew AI if you use it, the agent's running time (1 credit per 10 minutes), app actions that change something (1 credit each; reading and searching are free), paid tools such as Scout's web search (about 1 credit per search) and browser use on the Max plan (2 credits per minute). The usage chart shows the same five parts from `GET /v1/usage`: browser use (`browserCredits`) and paid tools (`toolCredits`) are separate numbers. In the history (`GET /v1/credits/ledger`) browser use is part of a usage line and a paid tool is its own line, known by its name ("Web search"), because the ledger has no field for the kind of charge. Whether a plan includes browser use is `limits.browser`.

**Approvals.** An approval's state comes from the backend (`Approval.status`), and the words for it are in `src/lib/approvals.ts`. Under an answered card in the chat: "You approved this", "You denied this", "This expired before it was answered", or "Replaced by a newer request". `replaced` means Tex asked again for the same action with corrected details (for example when the app refused the first one), so the earlier card was set aside: nothing was done with it, and the user did not deny it. The newer card below is the one to answer. A replaced request has no tab on the Approvals screen, because the newer one is listed. On that screen an approved one says "Tex was told to go ahead": the yes is the user's, and whether the app then did it shows in the chat and the activity log. The card finds an approval by asking the lists one status at a time (there is no "get one approval" endpoint), `replaced` last. The fields on a card are the action's inputs as the backend stored them, under Composio's own names ("Recipient email", not "To"): the backend refuses an approval whose inputs don't fit the action, so what the card shows is what runs.

## Integrations

Everything the person connects is on one screen, `/integrations` ("Integrations" in the sidebar under Set up, the phone's fourth tab, and a row in More). Three tabs, each with a heading and a line or two on what it is for:

| Tab | Address | What it holds |
|---|---|---|
| **Chat apps** | `/integrations` | The chats that are Tex: each linked chat and the web chat, and linking a chat app that isn't linked yet, right there |
| **Apps** | `/integrations/apps` | The apps Tex works in: what is connected (each account with Reconnect and Disconnect), the rest of the catalog with Connect, the search and the categories |
| **MCP servers** | `/integrations/mcp` | The person's own MCP servers on Max (a switch, Rename and Remove each, and the form to add one); on another plan, what they are and the way to Max |

**Chat apps** (`src/components/integrations/chat-apps.tsx`):

- **Each linked chat** shows its chat app, the name it is shown as (`displayId`: a Telegram name or a masked number) and its chat id masked as the backend sends it (`maskedChatId`, "•••• 4821"; left out when it is the same as the name, as for a WhatsApp number), when it was linked and when it last wrote ("Last message 2h ago", from `lastInboundAt`), and Unlink. A chat whose chat app has since been switched off says "Switched off" and can still be unlinked. A chat that blocked the bot (`blocked`) says "Blocked the bot" instead of "Linked", with a line on what to do: unblock the bot in the chat app and send it a message. A backend from before 15 October 2026 sends none of the three, and the row is drawn without them (`maskedChatIdToShow`, `lastMessageLine` and `blockedTheBot` in `src/lib/channels.ts`). Settings → General lists the same rows. The web chat is listed too, "Always on".
- **Unlink** asks first ("Unlink Telegram (@aarav_s)?", what stops, Cancel or Unlink Telegram), calls the person's own `DELETE /v1/channels/{id}`, then a toast says so and the chat app is offered for linking again.
- **A chat app not linked yet** gets the one-time code right on the page: "Get my Telegram code", then the code with Copy and "Open Telegram" (the code already typed), the time left, and "Waiting for your message" while the page asks every few seconds whether the chat has shown up. Once it has, a toast says "Telegram is linked" and the chat moves under "Your chats". It is the welcome flow's own code card and logic (`src/components/channels/link-code.tsx`), not a copy: the flow's Telegram step draws the same pieces in its own layout.
- **Several chat apps on offer**: a row of them to pick from; `?link=<chat app>` picks one (the checklist and Settings use `?link=telegram`). None on offer: the screen says so, and still lists a chat linked before.
- **Beside it, on a wide screen**: the picture of what linking looks like inside the chat app, which follows the code as it goes.

**Apps** (`src/app/(app)/integrations/apps/page.tsx`, `src/components/apps/app-cards.tsx`): the Apps page as it was, under a heading and a line. Each connected account is a row with its name, whether it works ("Connected", "Sign-in expired…"), Reconnect when it doesn't, and its own Disconnect. Disconnect asks first: "Disconnect Gmail (name@gmail.com)?", what stops (Tex can no longer read or do anything in the app; or, with another working account of the app left, that Tex goes on with that one), and, for the app's last working account, the automations that watch it (`trigger.app`, and pull-request review for GitHub, from `GET /v1/automations`; `disconnectCopy` in `apps-logic.ts`). Then a toast ("Gmail disconnected"), and the app is back under "Add more" with Connect once no account is left, without a reload. A refusal is a toast with the API's reason.

**The old addresses.** `/apps` and `/apps/mcp` redirect to their tabs (307, the query kept: `OLD_ADDRESSES` in `src/lib/integrations.ts`, used by `next.config.ts`), so links in Tex's messages, the backend's default way back from a sign-in and bookmarks still work.

## Chat

The chat has a history, like ChatGPT or Claude.ai. A **conversation** is one stretch of a chat between two "New chat" actions, and Tex's context is separate for each: in one conversation it doesn't see what was said in another. What Tex was asked to remember (Settings → Memory) is the person's, not a chat's, and stays.

- **The history** (`GET /v1/conversations`) lists every conversation, the one something was last said in first, each with its title and how long ago that was. The title is the first thing the person said in it, cut short by the backend, or "New chat" while it is empty. A conversation from Telegram carries the Telegram mark. The open conversation is highlighted. More are asked for as the list is scrolled to its end (30 at a time).
- **Unread**: a conversation in which Tex said something that wasn't seen yet (the backend's `unread`: a reply, an approval request, a run's answer, on any channel) has a small blue dot before its name, and the name is bolder. The open conversation never has one. With the history put away (a folded column, or the phone's drawer), the header's Show chats button has a dot while any conversation does.
  - **Marked read** (`POST /v1/conversations/{id}/read`) when the conversation is shown, and again whenever something new arrives in it while it is shown, but only while the page is on screen: in a background tab it waits until the tab is shown again (`useReadWhileShown` in `src/lib/read-while-shown.ts`). The dot goes at once; the backend tells the person's other tabs and devices (`conversation.updated`).
  - **Live**: a message from Tex on the stream lights the dot of its conversation at once, before the backend's own `conversation.updated` says the same; a message the person wrote (here or on Telegram) clears it, as the backend counts it (`unreadAfter`, `readMarked` and `showsUnread` in `src/lib/conversations.ts`).
  - **An older backend** sends no `unread`: no conversation is marked and nothing is marked read.
- **Where it sits**: from 1024px it is a column on the left of the thread, which the button at its top folds away and the button in the chat's header brings back (the browser remembers the choice). Below 1024px it is a drawer from the left, opened with the button in the chat's header; picking a conversation closes it. While the column is open the side panel on the right needs 1340px instead of 1100px, so three columns never squeeze the thread. Both slide rather than jump: see [Panels that fold](#panels-that-fold).
- **Rows come and go smoothly**: a chat that arrives (a new chat, one from Telegram, the next page of the list) fades and slides in; one that is deleted, here or elsewhere, stays where it was for a moment, out of reach, and folds shut while the rows below close up. A list that loads simply appears.
- **The thread shows one conversation** (`GET /v1/messages?conversationId=`): the one picked from the history, or else the active web conversation, which is where a message from here is written. Earlier messages are asked for as you scroll up to them. The chat's header shows the conversation's title.
- **Writing** sends the open conversation's id (`POST /v1/messages` with `conversationId`). Writing in an earlier web conversation makes it the active one, and Tex carries on with that conversation's own context. Nothing is open before the first thing ever said in web chat; that message starts the conversation.
- **The Automations chat** is where every run of every automation answers: a reminder, a schedule, an app event, a pull-request review's verdict, and the notices about them (out of credits, paused after failures). The backend keeps one per person and never puts a run's result in another conversation, whichever one is open.
  - **Pinned**: it is asked for on its own (`GET /v1/conversations?kind=automations`) and sits under "New chat" with the automations icon, above the dated list, which asks for `kind=chat` and leaves it out. It shows when the last thing was said in it, or "No runs yet". The same holds in the phone's drawer.
  - **Always findable**: the backend starts it when an automation is made or runs, so someone whose automations were all made before it existed has none until the next run. While there is none and the person has at least one automation (`GET /v1/automations`, asked for only then), the row stands in for it (`usePinnedAutomations` in `src/lib/api/hooks.ts`). Opened, the stand-in says "No runs yet", that runs will appear there, what runs next ("Next: Today’s meetings, tomorrow at 8:00 AM", `nextRunLine` in `src/lib/automations.ts`) and links to the automations; in place of the composer, a note says it can be followed up once the first run has arrived. When the backend starts the real one (`conversation.updated`), it opens in the stand-in's place. `/?chat=automations` opens the stand-in too.
  - **An older backend** ignores `kind` and has no Automations chat. Each conversation it lists is checked for its own `kind`, so its newest chat is never taken for the Automations chat, and a backend whose conversations carry no `kind` gets no stand-in (`automationsChatIn` and `serverHasAutomationsChat` in `src/lib/conversations.ts`).
  - **Opened and written in** like any web chat: the composer says "Follow up on a run…", and Tex carries on with the runs in mind. Writing there doesn't make it the active conversation, so the next message from a web chat goes where it went before (`conversationSpoke` and the stream handling keep it out of the dated list and never active).
  - **Its mark**: a dot on its row, and on the header's Show chats button, when something arrived in it since it was last open. The backend says so (`unread`, the same on every device), and opening it marks it read like any conversation. An older backend doesn't, and then this browser remembers up to when it was seen (`src/lib/automations-seen.ts`, the rules in `src/lib/conversations.ts`): the first time a browser meets it, what is already there counts as seen; a different one than the one remembered (should the backend ever start it again) counts as unseen.
  - **It stays, with its name**: its row has no menu, so it can't be renamed or deleted, and nothing else in the app offers either (the backend refuses both with 409). It goes only when the account is deleted.
  - **An address of its own**: `/?chat=automations` opens it (the Automations screen's link, and the last line of each copy the backend sends to Telegram).
  - **On Telegram**: an automation made there also sends a copy of each answer to that Telegram chat, which shows in its Telegram conversation here with the automation's name on its first line. The follow-up happens in the Automations chat.
- **Telegram conversations are read here and answered there.** In place of the composer the screen says "Reply on Telegram to continue this chat". On Telegram, `/new` starts a new one (the backend's part).
- **New chat** is at the top of the history, and in the chat's header while the history is put away. It calls `POST /v1/conversations`, opens the new conversation and puts the cursor in the composer. Nothing is lost, so it doesn't ask first. When nothing has been said in the active conversation yet, that one is opened again instead of starting another empty one. 30 an hour, after which a toast says so. It is in the activity log as "You · started a new chat".
- **Rename and delete** are in the menu on each row of the dated list (the three dots); the Automations chat has neither. Rename turns the title into a field: Enter or clicking away saves (`PATCH /v1/conversations/{id}` with `title`, 1 to 80 characters), Escape leaves it. Delete asks once more, because the conversation's messages and files go with it (`DELETE /v1/conversations/{id}`), then a toast confirms. When the conversation that was open is deleted the chat goes back to the active web conversation; when that was the one deleted, the newest web conversation left becomes the active one. It is in the activity log as "You · deleted a chat", without a word of what was in it.
- **Errors and confirmations of these actions are toasts** (`toast()` in `src/components/toast.tsx`), not red lines under a row.
- **Live**: `message.created` and `message.status` carry the message with its `conversationId`, so it joins that conversation's thread and no other, and its conversation moves to the top of the history. `conversation.updated` (a new one, a new title, something said in it, or it became the active one) and `conversation.deleted` change the history as they arrive (`applyStreamEvent` in `src/lib/api/stream.ts`, `src/lib/conversations.ts`).
- **Tex's answer as it is written**: see [below](#texs-answer-is-shown-as-it-is-written).
- **Tex at work**: the "Tex is working" bubble and its progress lines show only in the conversation that has a turn going: its newest incoming message that has left the queue is `processing` (the backend sets that when the agent takes the message and moves it on when the turn ends) and the agent is busy (`src/lib/chat-thread.ts`). A turn in another web conversation or on Telegram doesn't show in the one that is open.
  - **The turn's end is checked after Tex's answer.** Tex's answer arrives a second or two before its turn ends, and the turn's last two events (the person's message `delivered`, the agent no longer busy) clear the bubble. If the thread still shows Tex at work 10 seconds after an answer, those events were lost on the way, and the app asks the API again for the agent's state and the thread; a turn that really carries on (Tex said it is on it, and works on) stays at work, as the API says so too (`SETTLE_CHECK_MS` in `src/lib/api/stream.ts`).
  - **A late word never puts Tex back to work.** A message's status only moves forward (queued, processing, sent, delivered or failed, read), so neither a late event, nor the answer to sending the message, nor a list asked for during the turn and answered after its end takes a delivered message back to "Tex is on it" (`laterMessage` and `pageAfterCache` in `src/lib/api/hooks.ts`). The agent's state asked of the API is dropped for the stream's when the stream said something while the answer was on its way (`fetchAgentStatus`).
- **When Tex stops to ask** (an approval): Tex's question is one message that carries the approval. The thread shows what Tex wrote ("I'd like to send an email to x@acme.com with subject "Test". Approve or Deny below.", made by the backend from the approval's summary) with the Approve / Deny card right under it (`ApprovalQuestion` in `src/components/chat/approval-card.tsx`). An older ask ("Approval needed: …") only repeated the card's summary, so its card shows alone (`approvalQuestion` in `src/lib/approvals.ts`). What Tex did before asking folds into the question's "Show steps".
  - **Waiting, not working**: while the newest message is a question still to answer, the "Tex is working" bubble doesn't show, even while the turn winds down; a quiet line under the card says "Waiting for your OK" (`threadActivity` in `src/lib/chat-thread.ts`).
  - **After Approve or Deny** Tex's follow-up runs in the same conversation, after the card, and has no incoming message of its own. So the bubble shows at once after an answer given in this browser (for up to 15 seconds), and then while the agent is waking or busy for it (a busy turn that started more than 15 minutes after the answer is about something else). Tex's reply (the result, or that it won't do it) then becomes the newest message and the usual rule applies. Answered in the Approvals screen or after a reload, the bubble shows from when the agent wakes or is busy.
  - **Deny** is the word on the buttons, here and in the Approvals screen; the API's decision is still `reject`, and its status `rejected`, shown as "Denied".
- **Web chat switched off**: there is no "New chat" and no composer, and the chat opens on the newest conversation, to read.

### Tex's replies are drawn as Markdown

What Tex writes for the web chat may be Markdown; a chat app such as Telegram gets plain text (that is the agent's and the backend's part). The web chat draws it: headings, bold, italic, strikethrough, lists, numbered lists, lists inside lists, task lists, quotes, rules, tables, code inside a sentence, blocks of code with the language they were given and a Copy button, links and footnotes. What the person wrote is always shown as typed.

- **Where**: `AgentBubble` (`src/components/chat/agent-bubble.tsx`) is the bubble for anything Tex wrote: its messages in the thread, and the message of an approval that can no longer be found. The rules are in `src/lib/markdown.ts`, the drawing in `src/components/chat/markdown.tsx`, the look in `globals.css` under `.markdown`. The approval card itself is not drawn as Markdown: its summary is one line, and its preview is the email or post as it will be sent, so it is shown as typed.
- **A plain reply looks as it did.** A reply with nothing in it for Markdown to draw (`hasMarkdown`) is shown exactly as typed, line breaks and spaces kept. That is most short replies, and what Tex writes on Telegram. In a reply that is drawn, a single line break is still a line break and its parts sit one line apart, as paragraphs with a blank line between them do, so a reply reads the same with or without a bold word in it. A list, a table or a block of code sits close under the sentence that leads to it, and headings are only a little larger than the text: a reply is a chat message, not a page.
- **What Tex wrote is not trusted.** A web page or an email it read can put words in its mouth. So:
  - Raw HTML is shown as the text it was typed as, never drawn.
  - A link leads only to an `http`, `https` or `mailto` address given in full, and opens in a new tab with `rel="noopener noreferrer"`. Anything else (`javascript:`, `data:`, a path inside this app) keeps its words and is not a link (`safeLink`).
  - A picture is not fetched, because its address could be used to track the reader or to carry something out. It shows as a link that says "Image: …".
- **Width**: the thread and the composer are at most 880px wide (they fill a narrower pane). A bubble of Tex's is 560px wide at most, or, where the thread is wider than it used to be, 85% of it up to 680px: a comfortable line to read. A reply with a table or a block of code may take the thread's whole width instead (838px on a wide screen), while its sentences, lists and headings keep the line of a plain reply (`.markdown` in `globals.css`). A table or a block of code wider than its bubble scrolls sideways inside it; the page and the thread never do. On a phone, a table of three or more columns may be 11em a column wide before its text wraps, so its columns aren't squeezed into slivers. Phones and narrow windows look as they did; measured at 1280, 1366 and 1440 pixels wide with each panel open and closed.
- **Loaded when needed**: the renderer is a chunk of its own, fetched the first time a reply has something to draw; a chat of plain replies never asks for it. Until it arrives the reply reads as typed, and it stays that way if the chunk can't be fetched or a reply can't be drawn.
- **The libraries**: `react-markdown` with `remark-gfm` (tables, task lists, strikethrough, bare addresses as links) and `remark-breaks` (a line break stays a line break). `react-markdown` builds React elements from the text and never sets HTML. `rehype-raw`, which would draw raw HTML, must not be added.

### Tex's answer is shown as it is written

In web chat Tex's answer appears a few words at a time while it is written, instead of all at once at the end. The backend sends it on the live stream as `message.draft` (web chat turns only; Telegram gets the finished answer): `{ conversationId, turnId, messageId, text, at }`, where `text` is the whole answer so far, not only the new words. Nothing of it is saved; the answer itself arrives as a message like any other.

Tex starts the draft over (an empty `text`) at each tool it uses, each new message of its own and each round of the crew. So a turn is a few runs of text, and most of them are a line before a tool ("Let me check your calendar."). Shown as they came, those lines appeared and vanished, and a longer one could vanish too. What the web chat does with them:

- **Only what is worth showing.** A run of text is shown once it is 80 characters long, has a line break, or has been written for 1.2 seconds without being started over. A short line before a tool is started over sooner than that, so it never flashes.
- **Nothing shown vanishes.** A run that was on screen and is started over stays as a **step**: one muted line beside the thread, cut short, with what Tex went on to do under it (the progress line that followed, "Tex · reading 2 emails"). The next run is written below it, or, between runs, the "Tex is working…" bubble. The last three steps are shown; older ones fold into "+N earlier steps", which opens them.
- **The answer takes the draft's place** (`Writing` in `src/components/chat/thread.tsx`): the same bubble, in the same place and at the same width, drawn the way the answer will be, Markdown included. The steps fold away smoothly into "Show steps (N)", at the end of the answer's line of channel and time, which opens them again. They are kept for this session only: after a reload they are gone.
- **A turn that fails or ends without its answer**: its steps stay on screen until the next message arrives (a failed turn's apology, or the person's next message), then fold into it the same way.
- **Screen readers** hear "Tex is writing…" once, not every few words: the changing text and the steps beside it are `aria-hidden`, and the answer is read out when it arrives. "Show steps" is a button that says whether it is open.
- **Less motion**: with "reduce motion" set in the system, steps and the fold simply appear and go.

The rules are in `src/lib/drafts.ts`, fed by `applyStreamEvent`:

- Each conversation has its own turn on screen. A turn in another conversation doesn't show in the open one.
- Within a run the text only grows. A text that doesn't carry on from the run is a new run, as after an empty draft: for a slow connection the backend keeps only a turn's newest draft, so the empty one between two runs can be skipped.
- Tex's message in that conversation (not an approval card) takes the draft's place, and any later draft of that turn is dropped. The answer comes from the API and the drafts from the worker, so the answer can arrive just before the turn's last draft.
- An approval card is Tex stopping to ask: the steps before it fold into it and the turn goes on (what Tex may still write is not the card). If the turn then ends without an answer, what is left folds into the card too, so nothing is left under the question.
- The turn ends when `agent.status` is other than `busy`, or the incoming message it answers moves to `delivered` or `failed`; what was being written then becomes a step.
- When the stream reconnects, what is on screen stays: if the turn still runs, its next draft carries on from it. If the agent turns out to be idle, the turn ended while the stream was down, so it ends here too, and its answer, which comes with the thread asked for again rather than as an event, takes its steps (`answerInThread`).
- **Live only**, like the progress lines: kept in the query cache, never asked for, not there after a reload.
- **Demo mode** writes its canned replies this way, a few words every 50 ms, and posts the answer at the same moment as before (`writeDraft` in `src/lib/demo/handlers-chat.ts`). "How does my day look?" is answered a tool at a time, with the empty drafts and progress lines the real agent sends (`DAY_TURN`).

## Toasts and errors

When something the person asked for doesn't work, a toast says so in the corner of the page (above the tab bar on a phone): what failed, why in the API's own words, and a button for the way out where there is one ("See plans"). The same goes for confirmations that arrive on their own, such as a payment landing.

- **One place draws them**: `src/components/toast.tsx`, on the `sonner` library. `toast({ title, body })` is a confirmation, `toastError(title, why, action?)` a failure. The toaster is mounted once, in `Providers`, so setup and sign-in can raise toasts too. sonner's own look is switched off and each part wears the app's design tokens.
- **What stays under a field** is validation: what the form checks itself (an empty name, a URL that isn't https), and the API's verdict on a value that was typed, which is a 400: a coupon code, the code from Anthropic, an API key the provider rejects, a repo that doesn't exist (`refusedTypedValue` in `src/lib/action-errors.ts`). Everything else is a toast: a plan limit, a missing connection, too many tries, the server being down.
- **Removing something asks first, in a dialog** (`ConfirmDialog` in `src/components/confirm-dialog.tsx`): disconnecting an app's account, unlinking a chat, removing an MCP server, cancelling a plan (where the way out reads "Keep my plan", `cancelLabel`). The row has a real button for it (`danger-outline`), the dialog names what goes and says what stops, the keyboard starts on Cancel, and while the work runs its button has a spinner and nothing can be pressed. Then a toast says how it went. Smaller removals (a memory, an API key, an automation) still ask with the inline "confirm / cancel" (`ConfirmButton`).
- **A list that fails to load** still shows the full "That didn't load" state with "Try again". That is a screen with nothing to show, not an action.
- **The same failure twice** shows one toast, and at most three are up at once.
- The chat's own two messages (a message that didn't send, an approval that didn't go through) are still red lines; the chat is being reworked separately.

## Width

Every screen under the shell takes the whole width of the sheet. `PageBody` (`src/components/page.tsx`) no longer caps it.

- **Lists and tables** fill the width: activity, the credit history, the automations.
- **Cards** sit in as many columns as fit. Apps, plans and templates use a grid. `Columns` (in `page.tsx`) fills each column top to bottom so cards of different heights leave no gaps; nothing uses it at the moment.
- **Settings is the exception.** General, Agent & AI and Memory are one column at most 720px wide, beside the column of sections on a wide screen, because a setting is read with its control and a wide page scatters them. Credits fills the width beside the sections, and puts its side column beside the rest when the page itself has 760px (a container query, not the window's width). See [Settings](#settings).
- **Pricing** is a screen of its own, the whole width: the plans sit three across from 228px each, and Top-ups sits beside How credits work when the page has 900px. See [Pricing](#pricing).
- **Text that is read**, not scanned, keeps a comfortable line with the `READING` class (72 characters): the intro paragraphs, the message in an approval.
- **Approvals** show the list and the open approval side by side from 1024px, the list taking about a third; below that they stack, which includes a tablet with the sidebar showing.
- Checked at 1440, 1100, 768 and 390 pixels wide.

## Settings

Settings has four sections: General, Agent & AI, Memory and Credits (`src/app/(app)/settings/`), and a fifth entry, Plans, which leads to [Pricing](#pricing).

- **Where the sections are**: from 1280px a column of links on the left of the screen (`RouteNav` in `src/components/route-tabs.tsx`); below that a strip of tabs under the title, as on the other screens. The app's own sidebar takes the left from 768px, and a second column beside it any earlier would squeeze Credits.
- **One column of groups**: a group is a heading, a line on what is in it, and a card of rows (`SettingsGroup` and `SettingRow` in `src/components/settings/settings-rows.tsx`). A row has the setting's name and a line of help on the left and its control on the right, 280px wide; on a phone the control goes under the words. A control that needs the room (the choice of agent) sits under its name at every width.
- **General**: Profile (name, email, time zone, and Save changes), Linked chats (the same rows as Integrations → Chat apps; Link leads there, and a line points to Integrations for the apps and MCP servers), Getting started (the welcome tour and the checklist again), Help (the way to the Help page), Your data, and Account (who is signed in and Sign out; Delete account, which asks for DELETE first).
- **Agent & AI**: on top, what runs now and what pays for it, with "How it’s decided" folded away under it (a `<details>`). Then **Engine**: the agent (Hermes or Claude Code) and Claude Code's model and thinking effort. Then **AI access**: the three ways to give Tex its AI, each a card with its name, its tag ("Recommended", "Beta") and where it stands ("In use", "Not available") at the top.
- **Memory**: the kinds one under another.
- **Credits**: the balance and what it is made of, credits used per day, a top-up, a coupon code, and the credit history. The history stays here rather than on Pricing: Pricing is what you pay for, Credits is what you spent.
- **Plans** is now Pricing. The section's link goes to `/pricing`, and the old address `/settings/plans` is redirected there with its query (`OLD_PRICING_ADDRESSES` in `src/lib/pricing.ts`, read by `next.config.ts`), for Tex's messages and bookmarks.

### Dropdowns

There is no native `<select>` in the app. `src/components/select.tsx` has two dropdowns in the app's own look, with no library behind them:

- **`Select`**: a button that shows the choice and opens a list of options. Options can have a second line (`description`), a note at the end of the row (`hint`), and can be shown but not picked (`disabled`); they can sit in groups under a heading. The list opens under the field, or above it when the field is near the bottom of the window. Below 640px it is a sheet from the bottom of the screen with rows 48px tall, over a dimmed page; a tap outside closes it. Used for Claude Code's model and thinking effort and for the welcome flow's API key provider.
- **`Combobox`**: a field that is typed in to find an option, for long lists. Typing filters the list (every word typed must be in the option's name, value, note or keywords; accents and case don't matter) and puts the keys on the first option left, so a few letters and Enter is a choice. Used for the time zone, where the offset is each zone's note: "5:30" finds Kolkata. On a phone the list stays under the field, where the keyboard leaves it room, with the sheet's big rows.
- **Keys**: they follow WAI-ARIA's combobox patterns. On a Select: the arrows, Enter or Space open the list on the chosen option, Home and End on the first and last, a letter on the option it starts (typed quickly, letters make a word; one letter again goes to the next option that starts with it). Open: the arrows, Home, End, Page Up and Page Down move, skipping options that can't be picked; Enter or Space chooses; Escape closes; Tab closes as focus moves on. Neither Escape nor Tab changes the choice. On a Combobox the arrows open and move, Enter chooses (and never submits the form while the list is open), Home and End stay with the text, and Escape, Tab or leaving the field put the chosen value back.
- **For screen readers**: the field is a `combobox` that controls a `listbox` of `option`s (in `group`s with their heading as the name). The keys stay on the field and `aria-activedescendant` says which option they are on; the chosen one is `aria-selected` and the ones that can't be picked are `aria-disabled`. A press in the list never takes focus from the field.
- **Choosing the option already chosen** just closes the list: nothing is saved again.
- **Where the rules are**: which option a key moves to, type-ahead, the search and where the list goes are in `src/lib/listbox.ts`, tested without a browser. The colours are all design tokens.

## Panels that fold

Three panels can be put away and brought back, and each slides rather than jumps. The browser remembers each one separately (`PANELS` in `src/lib/panels.ts`, on `src/lib/stored-flag.ts`).

| | Put away with | Brought back with | Folded, it is |
|---|---|---|---|
| **The sidebar** (every screen, from 768px) | the « button at its top | the same button, now » | a rail of icons, 60px wide |
| **The chat history** (the chat, from 1024px) | the button beside "Chats" | "Show chats" in the chat's header | gone |
| **The side panel** "Right now" (the chat, where there is room) | the button beside "Right now" | "Show side panel" at the right of the chat's header | gone |

- **How they move**: a panel's width closes to nothing (or to the rail) in 225ms, slowing as it lands, while what is in it slides out with the edge that moves and fades. What is inside keeps its width as it goes, so no text wraps afresh mid-way. The thread beside it widens in step.
- **No jump between the chat's two columns**: where there isn't room for the side panel beside the open history (below 1340px), opening the history folds the side panel in the same movement, and closing it brings the panel back the same way.
- **The rail**: every icon stays exactly where it was and still leads where it did. Pointing at one says where; a screen reader still reads its name. Approvals waiting show as a small count on their icon, and the credits card becomes the balance in a tile (1.9K), red when it is low. The words fade out faster than the sidebar folds, so nothing is seen being cut short. Tex's tile stays.
- **Put away means out of reach**: a folded panel is `inert` and hidden from screen readers, so the keyboard never lands in it. The buttons say what they do ("Hide chats", "Show side panel", "Collapse sidebar", "Expand sidebar") and whether their panel is open. The header's buttons fade in only while their panel is away.
- **The keyboard follows**: when the button pressed goes away with its panel, the keyboard goes to the button that brings it back, and the other way round. The sidebar's button stays where it is.
- **On a phone** nothing changes: the top bar and the tabs stay, and the chat history is the drawer, which now also slides back out as the page brightens, keeping what is in it until it has gone (`.drawer` in `globals.css`). A browser that can't yet keep a closing dialog on screen closes it at once, as before.
- **Less motion**: with "reduce motion" set in the system, nothing slides or fades; panels, rows and the drawer simply appear and go.
- **Not on load**: a page is built before it knows what this browser remembers, so it is drawn with every panel open. Once the app has started, the remembered panels are put away at once, without sliding (`useMotionReady` in `src/lib/motion.ts`); only what is pressed after that moves.

## Automations

Automations → All automations (`/automations`). An automation is made by asking Tex in chat; there is no form. The page explains that, offers a way to start, and shows what exists as cards across the full width.

- **The top of the page** (`src/components/automations/intro.tsx`) says in two sentences what an automation is and where its results go, then has a box: "What should Tex do, and when?". "Ask Tex in chat" opens the chat with those words typed in (empty, it just opens the chat); nothing is sent until the person presses Send. Under it, **the three kinds**, each with one line on when it runs and a request that makes one, which a click opens in the chat the same way. Once the person has automations, a phone leaves the three kinds out so the list comes sooner.
- **At a glance** (`overview.tsx`, shown once there is at least one): how many are running, how many are paused and how many of those need the person (out of credits, after failures), what runs next, and the way to the Automations chat, with its dot when a run arrived since it was last open (`AutomationsChatLink` in `chat-link.tsx`).
- **Each automation is a card** (`automation-card.tsx`), as many across as fit (at least 340px each), one column on a phone: its name and kind, the switch to pause or resume (with "On" or "Off" beside it), when it runs as a sentence, what Tex does each time, the next run and the last run as labelled values, and why it is paused with the way out. Along the foot: "See runs" (the Automations chat, where every run answers), "Change" (the chat with "Change my automation “…”:" typed in, because the API can only pause, resume and delete one) and Delete, which asks once more. A repo with pull-request review on has "Manage" instead of the switch and "See verdicts" instead of the rest. A failed pause, resume or delete is a toast.
- **The strip on each card** (`FlowStrip` in `flow-parts.tsx`): the automation's five steps side by side, a word or two each, joined by arrows: "Schedule → Tex → Your apps → Asks first → Chat + Telegram". It wraps onto a second line on a narrow card. Plain HTML, no drawing library. Screen readers hear each step in full ("Trigger: Every weekday at 8:00 AM, your time"). The strip and the card's name open the automation's own page.
- **Each automation in plain words** (`src/lib/automations.ts`): "Every weekday at 8:00 AM, your time", "Once, tomorrow at 10:00 AM", "When a new email arrives in Gmail". A schedule in the person's own time zone reads "your time"; in another it names the place ("London time"). A cron line that isn't one of the usual shapes is shown as it is rather than guessed at, and an app trigger the app doesn't know keeps the app's own name for it, in quotes. The next and last runs read "Tomorrow, 8:00 AM", "Each time it happens", "2h ago", "Not yet" (`describeAutomationTimes`), in the browser's own clock.
- **"Your time" is the browser's at first.** Every account starts on UTC. While nobody has set a time zone (`timezoneSet` is false in `GET /v1/me`), the app sends the browser's own (`PATCH /v1/me` with `timezone`), once, on the first page of the signed-in app or of the welcome flow (`BrowserTimezone` in `src/components/browser-timezone.tsx`, the rule in `src/lib/timezone.ts`). It is silent, and a failure is tried again on the next page load. After that `timezoneSet` is true, so a zone chosen in Settings, or set from a browser before, is never replaced, also when the person opens the app somewhere else. An old name a browser still reports ("Asia/Calcutta") is sent as the zone's current one ("Asia/Kolkata"), so the list's "your time" matches the zones Tex writes. A backend that doesn't send `timezoneSet` is left alone.
- **An empty list** says how one comes to exist, in three steps, and the templates under it read "Start with one of these".
- **Templates**: eight ready-made requests, below the list across the full width. A click opens the chat with the request typed in, to change and send; "Review every pull request" opens the Pull-request review tab instead. A template that needs an app shows only when that app can be connected here, and says "Connect Gmail first" when it isn't connected yet.
- **How the chat gets the text**: the link is `/?draft=<the request>` (`chatDraftHref` in `src/lib/chat-link.ts`). The composer reads `draft` when it arrives (also while the chat is already open, as the checklist's "Write" does), puts it in the box, gives it the keyboard and tidies the address. Help's "Try it" links and the welcome flow's first messages use the same address.
- **The plan's limit** is in the header ("4 of 5 on Pro", with Upgrade once it is full) and beside the list. When the plan is full, the templates say so before anyone tries.
- **What a run costs** is said once, under the list, with whose clock "your time" is and a link to change it.

### One automation, as a flow

`/automations/aut_…` (`src/app/(app)/automations/[automationId]/page.tsx`, `automation-screen.tsx`) is one automation's own page, opened from its card. The way back ("← All automations") is at the top, then its name, kind and state with the switch (or "Manage" for a pull-request review), a sentence on what the page is ("This is how Tex runs it, step by step. Nothing can be changed here yet: to change it, ask Tex in chat."), "See runs", "Change in chat" and Delete (a toast, then back to the list).

- **The five steps** (`src/lib/automation-flow.ts`), the same wherever an automation is drawn: **Trigger** (when it runs in words, its settings, on or paused) → **Tex's instruction** (the title and the instruction, with "Tex follows this in its own way") → **Apps Tex may use** (the trigger's app and the apps Tex named; none: "Your connected apps, as needed") → **Asks you first** ("Sending, deleting or paying waits for your OK") → **Results** ("Automations chat", and "Copy to Telegram" when `copyTo` says so). A pull-request review reads "A pull request opens or gets new commits in acme/web" → "Patch reviews it" → GitHub → "Comments without asking; never merges or approves" → Automations chat. The trigger's settings come from `trigger.config` ("Repository: acme/web", "From: boss@acme.com").
- **The canvas** (`flow-canvas.tsx`) draws them as five boxes joined by arrows with React Flow (`@xyflow/react`, MIT, pinned at exactly 12.12.0). It is read-only: the boxes sit in one line where the file puts them (no layout library), can't be dragged or joined, and the canvas pans by dragging and zooms with its buttons (the mouse wheel scrolls the page). Each box is a real button: Tab reaches it, Enter or a click opens its details in the panel under the canvas (beside it from 1560px), which is the readable version of everything the step says. React Flow's small "React Flow" link stays in the corner (the founder's decision).
- **Loaded on that page only.** `flow-view.tsx` imports the canvas with `next/dynamic` (`ssr: false`), and only once the window is known to be at least 768px wide. The build puts React Flow in a chunk of its own (about 57 KB compressed, plus 2.6 KB of styles) that only this page's manifest names; no other page and no phone fetches it.
- **Phones get a list**: under 768px the same steps are a column of cards, each with all its details (`FlowList`). "List view" (beside "Canvas") shows the list on a wide screen too; this browser remembers the choice.
- **Not found**: an address that leads to no automation of this account (deleted, mistyped or someone else's; the API answers 404) says "This automation isn't here", with the way back.
- **The API**: `GET /v1/automations/{id}` (`useAutomation`, which starts from the list when it is in the cache). `copyTo` and `trigger.config` came with it; an older backend sends neither, and they read as none.

## Pull-request review

Automations → Pull-request review (`/automations/reviews`). The person turns review on per GitHub repo. When a pull request in that repo opens or gets new commits, Patch reviews it, comments on the pull request and Tex sends a short verdict to the Automations chat, with a copy on Telegram when it was linked at the time. It never merges.

- **Where it lives**: with the automations, because each repo with review on *is* an automation (`preset: pr_review`) and counts against the plan's limit. The two share a header and a plan meter. Help's crew section links there: it is the one thing about the crew set up on a screen, because no agent tool can switch it on.
- **The API**: `GET /v1/pr-reviews`, `PUT` and `DELETE /v1/pr-reviews/{owner}/{repo}`. A repo is paused and resumed as the automation it is (`PATCH /v1/automations/{id}`, the `id` of the review). "Turn off" deletes it.
- **Typing a repo**: `owner/repo`, a GitHub link (also one to a pull request or a branch) or a clone address all work (`parseRepo` in `src/lib/pr-review.ts`).
- **Refusals**, each with its own words (`describeEnableError`): 400 names the repo and says to check that it exists and that the connected GitHub account has admin access; 403 `plan_limit` names the plan's number of automations and links to Plans; 409 says GitHub isn't connected and links to Integrations → Apps; 429 asks for patience. The 400 is about the repo as typed, so it stays under the field; the others are toasts, with their link as the toast's button. When the Apps list shows GitHub isn't connected, the screen says so before anything is typed.
- **Each row** shows on or paused and why (by you, out of credits, after failures, each with its way out), where the verdict goes ("the Automations chat", plus "with a copy on Telegram" when `channel` is `telegram`) and when the last review ran.
- **In the automations list** a repo with review on is labelled "Pull-request review" and shows its repo name; "Manage" leads to the review screen instead of a switch and a delete. Among the templates, "Review every pull request" leads here too.
- Turning review on is the person's standing OK for Patch to comment on pull requests in that repo; the form says so. Everything else risky still asks.
- **Just one pull request?** A card under the form says that one review, once, is asked of Tex in the chat, with "Review pull request 42 in acme/website." and "Try it in chat". When `GET /v1/crew` says Patch isn't on the crew here, a note says reviews may not run, with "About the crew" (Help's crew section).

## The crew

There is no Crew screen and no form for crew jobs. Byte and Patch are asked for in the chat, in plain words: "Fix the typo in the README on my repo acme/website" goes to Byte, "Review pull request 42 in acme/website" to Patch. Tex's own instructions (the Bridge, in `../vm-manager/agent-image/bridge/crew.py`) send every change to a repository to Byte, however small, and every review of a pull request to Patch. A whole brief (the commands to run, what to look for, posting the report on the pull request) is said in the same message; Tex then starts it as a crew job of its own (`start_crew_job`), and the report comes back to that chat.

- **What the crew is** lives in Help, in a part of its own (see [Help](#help)). `/crew` leads there (`/help#crew`, a temporary redirect: `OLD_CREW_ADDRESSES` in `src/lib/crew-address.ts`, read by `next.config.ts`).
- **What stays on a screen**: review of every pull request in a repo, Automations → Pull-request review (see [Pull-request review](#pull-request-review)). No agent tool can switch it on, so Tex sends people there.
- **Not asked for any more**: `GET /v1/crew-jobs`, `POST /v1/crew-jobs` and `GET /v1/github/repos`. The backend still has them, and the proxy still lets them through. The demo no longer answers them.
- **Tests**: no page at `/crew`, no address to it in the code but the redirect, nothing left of the jobs form or list, the redirect landing on Help's crew section, and no link to `/crew` from the sidebar, More, the phone's tabs or Pull-request review (`src/lib/crew-in-chat.test.ts`, `sidebar.test.ts`, `help-screen.test.ts`).

## The crew at work

- **Chat**: `agent.progress` events (`{ text, crew, at }`) arrive on the live stream while a turn runs. The bubble that says "Tex is working…" shows the latest line of each member at work, with its face and name ("Scout · reading 4 pages"). Once Tex has started a shown draft over, a line goes under that step instead, and the bubble just says "Tex is working…" (see [Tex's answer is shown as it is written](#texs-answer-is-shown-as-it-is-written)). The lines are live only: they are kept in the query cache, emptied when the agent stops being busy and when the stream reconnects, and are not there after a reload.
- **Activity**: an entry with `crew` is shown as that member's (face, name, and the name taken off the front of the line), and the "Crew" filter picks those out. `read_page_refused` reads "Blocked a page Scout wasn't given". On a phone an entry gets two lines.

## Memory

Settings → Memory (`/settings/memory`): what Tex has saved about the person. One memory is one short fact with a kind (standing instruction, preference, person, project, or anything else that lasts). Every engine shares them.

- **The API**: `GET /v1/memories` returns all of them, newest first, with `max` (200); `DELETE /v1/memories/{memoryId}` removes one; `DELETE /v1/memories` removes all and says how many. There is no call to add or edit: the person tells Tex ("remember that…", "that's wrong, it's…"), and the screen says so.
- **The screen** groups memories by kind, standing instructions first (`src/lib/memory.ts`). Each shows when it was saved, when Tex corrected it (`updatedAt`, when it differs from `createdAt`), and how often and when Tex last found it with a search (`useCount`, `lastUsedAt`). A meter shows how many of `max` are used; at the limit the screen says Tex can't save more. "Delete" and "Delete all" both ask once more first.
- **Keeping it fresh**: memory has no live event. The list is asked for when the screen opens and again whenever a turn ends (`agent.status` stops being `busy`), which is when Tex saves, corrects or forgets.
- **Activity**: the memory actions read "remembered", "looked up memory", "forgot" or "corrected a memory", "refused to save", "deleted a memory" and "cleared memory", after who did it, and a "Memory" filter picks them out. An entry never holds a memory's text. Where it has a `memoryId` and that memory still exists, "See the memory" opens the Memory screen on it (`?memory=<id>`).

## Installing on a phone

There is no store app. On a phone, the browser's "Add to Home Screen" (Android: "Install app") puts Textcrew on the home screen and opens it in its own window.

- `src/app/manifest.ts` is the web manifest, served at `/manifest.webmanifest`: name, colours, `display: standalone` and the icons in `public/icons/` (192 and 512, plain and maskable).
- `src/app/apple-icon.png` is the iPhone home-screen icon, and `appleWebApp` in `src/app/layout.tsx` adds the Apple tags.
- The viewport uses `viewport-fit=cover`, and the tab bar and the page keep clear of the home indicator and the notch with the safe-area insets.
- These files have extensions the sign-in proxy skips (`src/proxy.ts`), so a phone can fetch them before anyone has signed in.
- There is no service worker: nothing is cached for offline use and there are no push notifications.

The PNGs are drawn from `src/app/icon.svg` (plain) and `public/icons/icon-maskable.svg` (full bleed, face inside the middle 80%) with `rsvg-convert -w <size> -h <size>`. The Apple icon is `icon.svg` with square corners, at 180.

## Pricing

`/pricing` (`src/components/pricing/`) is where people see what they pay and change it: "Pricing" in the sidebar under Set up (after Crew), and a row of More on a phone (More stays lit on it). Every "See plans" and "Upgrade" link in the app leads here, and so does Polar after a payment (`/billing`). Each section has a heading and a line on what is in it.

- **Your plan**: the name, the price, and what happens next: "Renews on 5 Nov for $12.", or once cancelled "Ends on 5 Nov. You keep Pro until then, then move to Free.", or a failed payment. Beside it the credits left, how many expire next and when, and the next month's credits; a link to the credit history in Settings → Credits. Then what the plan includes.
- **Cancel plan** (paid plans that will renew, also after a failed payment, as the backend allows): a confirm dialog says you keep the plan until the end of the period you paid for, it won't renew, and you then move to Free with Free's own limits; your credits stay until they expire. The keyboard starts on **Keep my plan**. Then a toast. The API has no way to undo a cancel, so a cancelled plan has no "keep my plan" button: the plan's column offers to subscribe again, which starts a new paid month (see [Not done yet](#not-done-yet)).
- **Plans**: Free, Pro and Max side by side, with the current one marked and the buttons the backend's rules allow (see [Billing](#billing-polar)). The waitlist's 50% off the first month is said under them; the regular prices the website strikes out are not in the API, so they aren't shown.
- **Top-ups**: each pack with its price and Buy. On Free the price still shows, with the way to a plan that can buy it.
- **How credits work**: what uses credits (`credit-costs.ts`, the same words as Credits and Help), 90 days, what happens at zero, failed tasks refunded, and a link to Help's credits.
- **No automatic top-up.** The backend has none, so the page doesn't mention one.
- The words are in `pricing-logic.ts`; tests draw the page on Free, Pro, Max, cancelled, a failed payment, loading and failed (`pricing-screen.test.ts`), click Cancel through (`cancel-plan.test.ts`), and check every way to it (`pricing-nav.test.ts`).

## Billing (Polar)

The backend owns Polar; the app never talks to it directly.

1. **Start**: Pricing or Credits calls `POST /v1/billing/checkout` and sends the browser to the Polar URL it returns. The app remembers what it is waiting for (`src/lib/checkout.ts`).
2. **Pay**: on Polar's page. Polar then calls the backend's `/webhooks/polar`; only that changes the plan or adds credits.
3. **Return**: Polar sends the browser to `/billing?checkout=done`, which forwards to Pricing.
4. **Confirm**: the app asks the backend every few seconds (there is no live event for a plan change) and confirms with a toast once the new plan or the top-up grant shows up.

The plan buttons follow the backend's rules: a second plan can't be started while the current one will renew, it can once the current one is set to end, and top-ups need a paid plan. `/billing?checkout=done` also works with no session, for checkouts started from the desktop app.

## Running on the server (container)

`Dockerfile` builds the app for the backend's compose file, which runs it as the `web` service behind Caddy (`../beckend/infra/docker-compose.yml`).

- **Build:** the Clerk publishable key is a build argument (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`), because `NEXT_PUBLIC_*` values are compiled into the browser bundle. The Clerk secret key is passed as a build secret (`clerk_secret_key`) so the pages, rendered at build time, are built in sign-in mode; it is not kept in the image. The mode is fixed at build (see [Loading](#loading)), so `TEXTCREW_DEMO` set only at run time doesn't turn the pages to demo mode.
- **Run:** `TEXTCREW_API_URL` (inside compose: `http://api:8080`), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` as environment. Port 3000. `GET /api/health` answers when it is up, with the server's auth mode (`mode`) and the one the pages were built in (`builtMode`); the two should match.
- **The backend must know this app's address:** `WEB_APP_URL` and `CLERK_AUTHORIZED_PARTIES` in the backend's settings.

## Scripts

| | |
|---|---|
| `pnpm dev` | Dev server on :3000 |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint && pnpm typecheck && pnpm test` | Checks (ESLint, `tsc`, Vitest). Most tests draw screens to HTML in Node; the dialogs' flows are clicked through in happy-dom (`// @vitest-environment happy-dom`). In a fresh checkout, `pnpm exec next typegen` (or `pnpm dev` once) writes the route types `tsc` needs |
| `pnpm backend:local` | The real backend on this machine, with stand-ins for the agent, Composio and Polar checkout |
| `pnpm openapi:sync` | Copy the contract from the backend's working tree and regenerate `src/lib/api/schema.d.ts` |

When the backend is mid-change, take the contract as committed instead of from its working tree:

```bash
git -C ../beckend show origin/main:openapi/openapi.yaml > openapi/openapi.yaml && pnpm openapi:gen
```

## Layout

```
openapi/             the API contract (copy of the backend's)
scripts/             local-backend.mjs
public/icons/        home-screen icons for the web manifest
src/app/
  (app)/             signed-in screens inside the shell
  api/v1/[...path]/  the proxy to the backend
  onboarding (the welcome flow), sign-in, sign-up, sso-callback, billing, connected
  api/demo/reset/    demo mode only: start the demo account over, new or as usual
  manifest.ts        the web manifest ("Add to Home Screen")
src/components/      screens and UI primitives (ui.tsx, page.tsx, tex.tsx, shell/…, auth/ for the sign-in forms)
  onboarding/        the welcome flow (flow.tsx and a file per step), the checklist (getting-started.tsx), and what the chat shows first (welcome-gate.tsx)
  shell/sidebar.tsx  the sidebar, and the rail of icons it folds down to
  chat/folding-pane.tsx  a column beside the thread that slides shut and open (the chat history, the side panel)
  toast.tsx          toasts, drawn by sonner: a confirmation, or an action that failed
  page.tsx           a screen's header and full-width body, columns of cards, the reading width
  help/              the Help page: the screen, how a piece of help is drawn, and the crew's line-up
  select.tsx         the dropdowns: Select (a button and a list) and Combobox (a field that searches a list)
  route-tabs.tsx     a screen's pages as tabs under its title, or as a column of links (Settings)
  settings/settings-rows.tsx  the parts of a settings screen: a group, and a row with its control on the right
  chat/agent-bubble.tsx  the bubble for what Tex wrote: as typed, or drawn as Markdown
  chat/markdown.tsx      draws Markdown; loaded the first time a reply needs it
  apps/connect-dialog.tsx  Textcrew's own connect screen, shown before any app's sign-in page
  integrations/      the Integrations screen's chat apps tab and the tabs' headings
  channels/          linking a chat app with a one-time code, and the rows of linked chats (Integrations, Settings, the welcome flow)
  confirm-dialog.tsx the dialog that asks before something is removed (Disconnect, Unlink, Remove, Cancel plan)
  pricing/           the Pricing screen: your plan and Cancel, the plans, top-ups, how credits work, and the words (pricing-logic.ts)
  automations/       the Automations screens: the cards and their strip, an automation's page, the flow as a canvas
                     (flow-canvas.tsx, React Flow, loaded on that page only) or a list (flow-parts.tsx), pull-request review
src/lib/
  api/               generated types, typed client, TanStack Query hooks, SSE → cache
  auth-flow.ts       sign-in and sign-up: where to land, Clerk's refusals in words, what comes next
  auth-mode.ts       demo, Clerk or the development token: fixed at build for the pages (env.ts reads it per request)
  media-query.ts     whether a part of the shell that CSS hides is on screen, so it isn't drawn or fetched when it isn't
  demo/              the in-memory demo backend
  channels.ts        which chat apps to offer, from what the backend has switched on
  integrations.ts    the addresses of Integrations, where "Link Telegram" leads, and the redirects from /apps
  crew.ts            who is on the crew and what they are doing, from what the backend says; their colours and a request to try for each
  crew-address.ts    where the crew is explained in Help, and the redirect from /crew
  automations.ts     automations in plain words: the three kinds, the templates, when one runs, its status, runs and cost
  automation-flow.ts an automation (or a draft) as its five steps: what each says, for the strip, the canvas and the list
  automations-seen.ts  up to when this browser saw the Automations chat, for its unread mark (an older backend's)
  read-while-shown.ts  marks the conversation on screen read, while the page is on screen
  chat-link.ts       the link that opens the chat with a request typed in
  action-errors.ts   which failures stay under a field (the API's verdict on a typed value) and which are toasts
  memory.ts          what Tex remembers: the kinds, their order and how a memory's dates read
  pr-review.ts       reading a repo as typed, a repo's state and the API's refusals in words
  conversations.ts   the chat history: which conversation is open, what can be done with it, and the list kept in order as things happen;
                     which conversations are unread; the Automations chat, pinned apart, and when its mark is lit
  chat-thread.ts     the chat thread: whether Tex is at work in the open conversation
  drafts.ts          Tex's answer as it is written: when a draft is worth showing, the steps it leaves when Tex starts over,
                     and how they fold into the answer
  markdown.ts        Markdown in Tex's replies: whether a reply has any, and where a link may lead
  in-view.ts         asks for the next page when the end of a list scrolls into view
  listbox.ts         the rules of the dropdowns: the keys, type-ahead, the search and where the list opens
  stored-flag.ts     a yes or no this browser remembers
  panels.ts          the panels that fold, each remembered under its own key, and where the keyboard goes after one does
  motion.ts          how the panels move: their timing, no sliding on load, and a list whose rows fold away as they go
  claude-code.ts     Claude Code's model and thinking effort as the dropdowns offer them
  credit-costs.ts    what credits pay for, in the words every screen uses
  checkout.ts        what a Polar checkout is waiting for, and when it has arrived
  pricing.ts         the Pricing screen's address, and the old Settings → Plans address that leads there
  help.ts            the Help page's parts: what an answer is made of, the places it links to, the markup, the search
  help-content.ts    the Help page's words
  onboarding.ts      getting started: which steps are done (from the API), when the checklist shows and goes,
                     the welcome flow's steps, and what opening the chat shows (the flow, the app, or a spinner)
src/test/            for tests only: the pages the app has, read from src/app
```

`src/lib`, `src/components` and most of `src/app` started as a copy of the desktop app's. Until they share a package, a fix to a shared screen has to be made in both repos.

## Not done yet

- Help's words are written by hand from the backend's docs and code, and nothing checks them against the backend. The bot has no `/help` command of its own (Tex answers it like any message), and its "not linked" replies send people to "Settings → Channels", which the app calls Integrations → Chat apps; the help says so.

- Admin screens (`/v1/admin/*`).
- A dark theme. The app is light only, on purpose (`color-scheme: only light` in `globals.css`). The toasts, the Help page, the automations page, the dropdowns and the settings screens take every colour from the design tokens, so they would follow a dark set of tokens (the settings and the dropdowns were checked with a trial set); the primary button (white text on the ink colour) and the figures' own colours would still need one.
- The demo doesn't make an automation when one is asked for in chat, so a template can be followed as far as the chat and no further.
- The chat's two error lines (a message that didn't send, an approval that didn't go through) are not toasts yet.
- Voice notes from the composer (files and text only).
- Code in a reply has no colours for its syntax, and maths written as LaTeX is shown as typed.
- Markdown is drawn only in Tex's chat messages. Memories, the activity log and an approval's preview are shown as typed.
- Scout's browser: the contract says it isn't built (`browser.available: false`), so there is nothing to show but the note. `browserSeconds` is in the usage and not shown yet.
- What the screens would like and the contract doesn't offer:
  - Pricing: no way to undo a cancel (Polar has one, and the backend already follows its `subscription.uncanceled` event, but there is no endpoint for it), no automatic top-up, and no regular price beside the launch price.
  - An automation's last run says only when it ran, not how it went (answered, failed, ran late), and there is no list of one automation's own runs: "See result" and "See runs" open the Automations chat, where every automation's runs are mixed. Changing an automation is asked of Tex in chat, because the API can only pause, resume and delete one.
  - The backend can pause an automation for a suspended account or by Textcrew support (`suspended`, `admin`), but the contract's `pausedReason` doesn't list those, so such a card reads plain "Paused".
  - A pull-request review repo has no history: which pull requests were reviewed, the verdicts, or why a review failed. The screen shows only when the last one ran.
  - Pull-request review can't check admin access before trying, so its repo is still typed.
  - The app shows no list of crew jobs: a job given in chat is seen only as Tex's answer that it is queued, the progress lines while it runs, and the report in the chat. The backend keeps the list (`GET /v1/crew-jobs`); a job has no live event of its own.
  - An automation doesn't carry its repo; the automations list finds it in `/v1/pr-reviews` by id.
  - The ledger has no field for the kind of charge, so a paid tool is known by its description.
  - Only progress lines carry `crew`. A web search or a refused page is logged as Tex's, though it is Scout's tool.
  - A conversation doesn't say how many messages it has, so "New chat" only knows the active one is empty when its messages are already loaded.
  - The history can't be searched, and a conversation has no address of its own (only the Automations chat has one, `/?chat=automations`): a reload opens the active web conversation again.
  - With an older backend (no `unread`), whether the Automations chat has something unread is remembered by each browser, not by the account: on another device its dot starts from what is already there.
  - The backend can't know what was read in Telegram itself: Tex's last reply in a Telegram chat stays unread here until that conversation is opened here, or the person writes in the chat again.
  - Progress lines are not replayed: after a reload in the middle of a turn the chat says "Tex is working…" until the next line.
  - Drafts and their steps aren't saved, so an answer's "Show steps" is there only in the tab that saw it written, until a reload.
  - A linked chat (`GET /v1/channels`) has no masked chat id apart from its name, no time of its last message and no "blocked the bot", which the admin panel's user page shows (`AdminUserChannel`: `maskedChatId`, `lastInboundAt`, `blocked`). Integrations shows the name and when it was linked.
  - The automations don't say which account of an app they use, so a Disconnect lists the ones that watch the app only when its last working account goes.
  - Memory can't be added or edited from the app, and has no live event (the list is asked for again when a turn ends).
  - The activity log names a memory by id only. Once it is deleted, the log can't say what it was, and a `forget` entry doesn't say whether Tex removed or corrected (the app goes by the entry's summary).
  - A refused save (`memory_refused`) and a search (`recall`) carry no `memoryId`, so they link nowhere.
  - Only the web chat's new chat is known (`chatStartedAt`): one started on Telegram with `/new` draws no divider. A new chat started in another tab shows once the messages are asked for again (there is no live event for it).
  - A turn with no incoming message of its own (an automation, the follow-up to an approval) shows Tex at work only under All, because the agent's state carries no channel.
  - The follow-up to an approval is known only from the agent's state, which says nothing of which conversation it works in: if it ends without a word and the question stays the newest message, a later turn in another chat could show the bubble under it, within the 15 minutes after the answer.
- A panel that was put away shows open for a moment when a page is first loaded (or reloaded), until the app has started: the pages are built ahead, and only the browser knows what it remembers. Moving between screens doesn't do it. A small script in the page's head that reads the choices before the first paint would end it.
- Installed on a phone, the app has not been tried on a real Android phone or iPhone.
- The connect screen and the way back have been tried in demo mode only. With a real provider: whether Safari lets the welcome flow's new tab open after the API has answered (it opens once the request is back, not on the click itself), and how a real failed sign-in comes back, are not checked.
- Not yet run with a real Clerk application, real Polar products or a real agent container. The sign-in pages have been rendered with the real (development) Clerk application, but no one has signed in or up through them yet: the steps against Clerk are covered by unit tests of the logic, not by a real sign-in.
- Sign-in has no second factor beyond a code by email, no passkeys and no phone numbers, because none is switched on in Clerk.
- Integrations has been tried in demo mode only, at 1440×900, 390×844 and 360×780: linking and unlinking Telegram, disconnecting apps, the redirects from `/apps`. Not yet against the real backend or a real Telegram bot.
- Getting started: the welcome flow and the checklist have been tried in demo mode only, at 1440×900 and 390×844, not against the real backend. A finished checklist is worked out again on each page load (the agent settings, the apps and the automations are asked for) because the account only keeps whether it was hidden. The welcome flow lists the Claude plan first while Settings still calls an API key "Recommended", though the backend's design says the engine doesn't use a saved key yet.
