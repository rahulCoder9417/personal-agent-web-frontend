# Textcrew web

The Textcrew web app: what people use in a browser, on a laptop or a phone. Next.js renders the screens and its route handlers proxy the Textcrew API.

```
Browser ──▶ Next.js app ──/api/v1/*──▶ Next.js route handler ──Bearer token──▶ Textcrew API
             (screens)                  (adds the Clerk session                (../beckend)
                                         token on the server)
```

- **Screens**: chat, approvals, automations and pull-request review, activity, apps and your own MCP servers, crew, settings (general, agent and AI, memory, credits, plans), onboarding, sign-in and sign-up.
- **One layout, two shapes**: on a wide screen a sidebar sits beside the current screen; on a phone there is a top bar, the screen edge to edge and five tabs along the bottom (the rest is under More).
- **Every screen takes the whole width.** See [Width](#width).
- **Installable on a phone**: "Add to Home Screen" on Android and iPhone opens it in its own window. See [Installing on a phone](#installing-on-a-phone).
- **The pages only talk to this app's own `/api/v1/*`.** `src/app/api/v1/[...path]/route.ts` forwards to the backend and adds the Clerk session token on the server, so the token never sits in page JavaScript or in an `EventSource` URL. Only user-facing paths are allowed through (no admin, waitlist or webhook routes).

This is the address the backend calls `WEB_APP_URL`: Polar returns here after checkout, app sign-in screens return here, and Tex's messages link here. The desktop app (`../user-frontend-desktop`) is a small window around this live web app, so it has no screens of its own: what is deployed here is what it shows.

API contract: `openapi/openapi.yaml`, copied from `../beckend/openapi/openapi.yaml`. One field was written into the copy by hand ahead of the backend: `App.connectable` (see [Apps](#what-the-backend-decides)). The next `pnpm openapi:sync` should bring the same field from the backend; if it doesn't, the two have drifted.

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

Things to try in the demo:

- **The crew at work**: ask Tex in the web chat to research something ("research what other tools charge"), fix code ("fix the bug in…") or review ("review my pull request"). Scout, Byte or Patch reports three lines while it works, then Tex answers. Scout's search costs 1 credit.
- **Replies drawn as Markdown**: the web chat opens on an answer with a heading, a table, a block of code, a numbered list and a link. Ask Tex to research something and the answer has a table, a list and links; ask it to fix code and it has code with a Copy button. Every other reply is a plain sentence and looks as it always did, and so do the Telegram chats.
- **Pull-request review** (Automations → Pull-request review): two repos are seeded, one on and one paused after failures. Pro allows five automations and four are used, so one more repo can be given review and the next one hits the plan limit. A repo owned by `octocat` stands in for one the GitHub account can't administer. Disconnect GitHub under Apps to see the screen without it.
- **Choosing Textcrew AI** (Settings → Agent & AI): the demo has an Anthropic key saved, so "Use Textcrew AI" and the way back are both there.
- **The chat history**: four chats are seeded, two in the web chat and two on Telegram. Open the Telegram one to read it (it can't be answered from here), open the earlier web one and write in it (it moves to the top and Tex answers there), and start a "New chat". Rename or delete one from the three dots on its row. The 31st new chat in an hour is refused with a toast.
- **Claude Code's model and effort** (Settings → Agent & AI): connect the Claude plan with any code of four characters or more, then pick a model and a thinking effort.
- **Memory** (Settings → Memory): eight memories are seeded. Tell Tex "remember that I send invoices on the 1st" in the web chat and it is saved; "remember that my password is…" is refused. Both are in the activity log.
- **Apps that can't be connected yet** (Apps): HubSpot, Asana and Airtable say "Not available yet" and have no Connect button, the way an app without a setup on the server does.
- **Toasts**: on Pull-request review, turn review on for one more repo (five of five), then for another. The refusal is a toast with "See plans". A repo owned by `octocat` is refused under the field instead, because that one is about what was typed.
- **Automations**: click a template or a "Try it in chat" link and the chat opens with the request typed in. The demo's canned reply doesn't make an automation, so the list stays as seeded.

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
- **The first page asks only for what it draws.** The shell asks for the account and the pending approvals; the chat for the channels, the chat history, the open conversation's messages and the agent's state; and the live stream opens. That is all a phone sends (6 calls and the stream). The messages are asked for once the history has said which conversation is open, so that one call waits for another. The sidebar, hidden on a phone, asks for the crew and the plans only on a wider screen (8), and the chat's side panel is only drawn where it shows (from 1100px, or from 1340px while the chat history is open beside the thread), where it adds activity, automations and the agent settings (11). Both follow `useMediaQuery` (`src/lib/media-query.ts`), which says no on the server and in the first render. The checkout watcher asks for the subscription, credits and plans only while a checkout is waiting.
- **What draws Markdown is not part of the first page.** It is a chunk of its own (147 kB, 44 kB gzipped), fetched the first time a reply has something to draw. See [Tex's replies are drawn as Markdown](#texs-replies-are-drawn-as-markdown).
- **The live stream reconnects** every five minutes on Vercel (the function's time limit) and whenever the connection drops. The backend's stream has no event ids and replays nothing, so a reconnect asks again for the open conversation's messages, the chat history, the approvals and the agent's state; in a tab nobody is looking at they are only marked stale and asked for when the tab is shown again (`catchUpAfterReconnect` in `src/lib/api/stream.ts`).

## Sign-in

Clerk is the sign-in service: it holds the accounts, checks passwords and codes, sends the emails and makes the session the backend trusts. The screens are this app's own. No Clerk component is drawn; the forms sit on Clerk's hooks (`useSignIn()`, `useSignUp()`, `useClerk()`, its "custom flows" API). The rest of the Clerk use is unchanged: the provider in `src/app/layout.tsx`, the session token the API proxy adds, sign-out and deleting the account.

| Page | What it does |
|---|---|
| `/sign-in` | Continue with Google; or email and password, with "Forgot password?" (a code by email, then a new password, which signs out the other devices) and "Email me a code instead". When Clerk wants a code from the inbox after a right password (a new device), it asks for it. |
| `/sign-up` | Continue with Google; or first and last name (optional), email and password, then the code Clerk emails to check the address. |
| `/sso-callback` | Where Google sends the browser back to when Clerk still needs this app: turns "sign in with Google" by someone new into an account and "sign up with Google" by someone known into a sign-in, or says what went wrong. |

- **Built for what the Clerk application has switched on** (read from its public `/v1/environment`): email as the only identifier, a password (at least 15 characters, checked against known leaks), a code by email (sign-in, verifying at sign-up, resetting the password), Google, optional first and last name, no second factor, bot protection at sign-up. Switching more on in the Clerk Dashboard (a phone number, a username, an authenticator app) needs the forms to change; until then the page says what it can't ask for. The social buttons come from `SOCIAL_PROVIDERS` in `src/lib/auth-flow.ts`.
- **Clerk's refusals in plain words**: `describeAuthError` in `src/lib/auth-flow.ts` turns Clerk's error codes into a sentence, under the field it is about or above the form. A password rule keeps Clerk's own sentence, which carries the number.
- **Where people land**: on the page the proxy sent them from (`redirect_url`, carried between the three pages), else on the home screen. Only addresses inside this app are followed (`afterAuthPath`). Someone already signed in who opens `/sign-in` or `/sign-up` goes straight there: the proxy sends them, so the pages themselves are static and read `redirect_url` and `step` in the browser.
- **The proxy** (`src/proxy.ts`) lets `/sign-in`, `/sign-up` and `/sso-callback` open without a session (exactly those paths, nothing under them) and sends people without one to `/sign-in`, not to Clerk's hosted page. The addresses are set in code (`SIGN_IN_PATH`, `SIGN_UP_PATH`), so no environment variable is needed for them.
- **Bot protection**: Clerk draws its check in `<div id="clerk-captcha">` on the sign-up and callback pages when it wants one; most of the time it stays empty.
- **Demo mode and the development token** have no accounts: the proxy sends the three pages to the home screen. A build made without the Clerk keys and run with them shows a note on these pages instead of sending the browser round in circles.

## What the backend decides

The screens don't know which chat apps or which AI are on offer. They ask.

**Chat apps.** `GET /v1/channels` returns the linked chats (`items`) and the channels that are switched on (`available`, for example `["telegram", "web"]`). Onboarding, Settings, the chat panel and the chat filter are built from `available`: only those chat apps are offered, the first one is the default, and wording that lists chat apps is put together from the list (`src/lib/channels.ts`). `web` is the web chat itself, so it is never something to link; if it is missing, the composer gives way to a note. A chat linked before its channel was switched off still shows, marked "Switched off", and can be unlinked; its messages keep their label and stay in the chat filter. A link code for a channel that is off is refused with 403 `channel_disabled`.

**AI, three ways.** Settings → Agent & AI and the third onboarding step offer the same three choices:

1. **Your own API key** (recommended): Anthropic, OpenAI or OpenRouter. The provider bills the AI.
2. **Your Claude plan** (beta): runs Claude Code in the person's private workspace. Plain text only, no logos. Once it is connected, its section has two selects, "Model" and "Thinking effort", each with "Default" (Claude Code's own) first.
3. **Textcrew AI**: nothing to set up, paid in credits. It is what Tex uses when no key or plan is connected.

`GET /v1/agent/settings` says all of it (`src/components/settings/agent-summary.ts` puts it into words):

- `aiAccess` (`own_key`, `claude_plan`, `platform` or `none`) is what pays for the AI right now.
- `platformAvailable` is whether Textcrew AI is on offer. When it is false (`AI_ACCESS_MODE=own_only` on the backend) the card says "Not available" rather than hiding.
- `claudeModel` and `claudeEffort` are what Claude Code runs with (null is its default), and `claudeChoices` (`models` with an id and label each, `efforts`) is what they can be set to, in the order the selects offer them (`src/lib/claude-code.ts`). A change is saved as it is made (`PATCH /v1/agent/settings` with `claudeModel` or `claudeEffort`; "Default" sends null), shown at once and put back if refused. They can be set whatever runs now and apply to turns on Claude Code; a value not offered is 400 `invalid_request`.
- `aiPreference` (`auto` or `platform`) is what the person chose. Someone with a key saved or a Claude plan connected can choose Textcrew AI anyway ("Use Textcrew AI" sends `{ aiPreference: "platform" }`) and go back ("Go back to your Anthropic key" sends `{ runtime: "hermes", aiPreference: "auto" }`; to the Claude plan, `{ runtime: "claude_code", aiPreference: "auto" }`). The key and the plan stay saved either way. With Textcrew AI chosen the agent shown as running is Hermes, and picking Claude Code goes back to the plan.

**Apps.** `GET /v1/apps` lists the catalog with each app's connections, whether the plan includes it (`availableOnPlan`) and whether it can be connected on this server at all (`connectable`: the server has a Composio setup for it; today that is Gmail and GitHub). An app that isn't connectable is listed after the ones that are, says "Not available yet" and has no Connect button; a connected one loses "Add account" and "Reconnect". Onboarding offers only apps that are on the plan and connectable. A backend from before the field existed doesn't send it, and that reads as connectable (`isConnectable` in `src/components/apps/apps-logic.ts`), so an older server doesn't switch every app off.

**The crew.** `GET /v1/crew` lists Tex and the specialists with a name, role and description each, whether each one works on this deployment yet (`available`), and for Scout which plan the real browser needs and whether it is built yet (`browser`). The crew page, the "soon" note in the navigation and the browser note on the Plans screen are built from it (`src/lib/crew.ts`). The app keeps the figures and their colours, and what the backend doesn't say: three lines on what each member does, a request to try, and the four steps of how the crew works (`CREW_GUIDE` and `CREW_STEPS` in the same file).

**Credits.** What credits pay for is written once, in `src/lib/credit-costs.ts`: Textcrew AI if you use it, the agent's running time (1 credit per 10 minutes), app actions that change something (1 credit each; reading and searching are free), paid tools such as Scout's web search (about 1 credit per search) and browser use on the Max plan (2 credits per minute). The usage chart shows the same five parts from `GET /v1/usage`: browser use (`browserCredits`) and paid tools (`toolCredits`) are separate numbers. In the history (`GET /v1/credits/ledger`) browser use is part of a usage line and a paid tool is its own line, known by its name ("Web search"), because the ledger has no field for the kind of charge. Whether a plan includes browser use is `limits.browser`.

## Chat

The chat has a history, like ChatGPT or Claude.ai. A **conversation** is one stretch of a chat between two "New chat" actions, and Tex's context is separate for each: in one conversation it doesn't see what was said in another. What Tex was asked to remember (Settings → Memory) is the person's, not a chat's, and stays.

- **The history** (`GET /v1/conversations`) lists every conversation, the one something was last said in first, each with its title and how long ago that was. The title is the first thing the person said in it, cut short by the backend, or "New chat" while it is empty. A conversation from Telegram carries the Telegram mark. The open conversation is highlighted. More are asked for as the list is scrolled to its end (30 at a time).
- **Where it sits**: from 1024px it is a column on the left of the thread, which the button at its top folds away and the button in the chat's header brings back (the browser remembers the choice, `src/lib/stored-flag.ts`). Below 1024px it is a drawer from the left, opened with the button in the chat's header; picking a conversation closes it. While the column is open the side panel on the right needs 1340px instead of 1100px, so three columns never squeeze the thread.
- **The thread shows one conversation** (`GET /v1/messages?conversationId=`): the one picked from the history, or else the active web conversation, which is where a message from here is written. Earlier messages are asked for as you scroll up to them. The chat's header shows the conversation's title.
- **Writing** sends the open conversation's id (`POST /v1/messages` with `conversationId`). Writing in an earlier web conversation makes it the active one, and Tex carries on with that conversation's own context. Nothing is open before the first thing ever said in web chat; that message starts the conversation.
- **Telegram conversations are read here and answered there.** In place of the composer the screen says "Reply on Telegram to continue this chat". On Telegram, `/new` starts a new one (the backend's part).
- **New chat** is at the top of the history, and in the chat's header while the history is put away. It calls `POST /v1/conversations`, opens the new conversation and puts the cursor in the composer. Nothing is lost, so it doesn't ask first. When nothing has been said in the active conversation yet, that one is opened again instead of starting another empty one. 30 an hour, after which a toast says so. It is in the activity log as "You · started a new chat".
- **Rename and delete** are in the menu on each row (the three dots). Rename turns the title into a field: Enter or clicking away saves (`PATCH /v1/conversations/{id}` with `title`, 1 to 80 characters), Escape leaves it. Delete asks once more, because the conversation's messages and files go with it (`DELETE /v1/conversations/{id}`), then a toast confirms. When the conversation that was open is deleted the chat goes back to the active web conversation; when that was the one deleted, the newest web conversation left becomes the active one. It is in the activity log as "You · deleted a chat", without a word of what was in it.
- **Errors and confirmations of these actions are toasts** (`toast()` in `src/components/toast.tsx`), not red lines under a row.
- **Live**: `message.created` and `message.status` carry the message with its `conversationId`, so it joins that conversation's thread and no other, and its conversation moves to the top of the history. `conversation.updated` (a new one, a new title, something said in it, or it became the active one) and `conversation.deleted` change the history as they arrive (`applyStreamEvent` in `src/lib/api/stream.ts`, `src/lib/conversations.ts`).
- **Tex at work**: the "Tex is working" bubble and its progress lines show only in the conversation that has a turn going: its newest incoming message that has left the queue is `processing` (the backend sets that when the agent takes the message and moves it on when the turn ends) and the agent is busy (`src/lib/chat-thread.ts`). A turn in another web conversation or on Telegram doesn't show in the one that is open.
- **Web chat switched off**: there is no "New chat" and no composer, and the chat opens on the newest conversation, to read.

### Tex's replies are drawn as Markdown

What Tex writes for the web chat may be Markdown; a chat app such as Telegram gets plain text (that is the agent's and the backend's part). The web chat draws it: headings, bold, italic, strikethrough, lists, numbered lists, lists inside lists, task lists, quotes, rules, tables, code inside a sentence, blocks of code with the language they were given and a Copy button, links and footnotes. What the person wrote is always shown as typed.

- **Where**: `AgentBubble` (`src/components/chat/agent-bubble.tsx`) is the bubble for anything Tex wrote: its messages in the thread, and the message of an approval that can no longer be found. The rules are in `src/lib/markdown.ts`, the drawing in `src/components/chat/markdown.tsx`, the look in `globals.css` under `.markdown`. The approval card itself is not drawn as Markdown: its summary is one line, and its preview is the email or post as it will be sent, so it is shown as typed.
- **A plain reply looks as it did.** A reply with nothing in it for Markdown to draw (`hasMarkdown`) is shown exactly as typed, line breaks and spaces kept. That is most short replies, and what Tex writes on Telegram. In a reply that is drawn, a single line break is still a line break and its parts sit one line apart, as paragraphs with a blank line between them do, so a reply reads the same with or without a bold word in it. A list, a table or a block of code sits close under the sentence that leads to it, and headings are only a little larger than the text: a reply is a chat message, not a page.
- **What Tex wrote is not trusted.** A web page or an email it read can put words in its mouth. So:
  - Raw HTML is shown as the text it was typed as, never drawn.
  - A link leads only to an `http`, `https` or `mailto` address given in full, and opens in a new tab with `rel="noopener noreferrer"`. Anything else (`javascript:`, `data:`, a path inside this app) keeps its words and is not a link (`safeLink`).
  - A picture is not fetched, because its address could be used to track the reader or to carry something out. It shows as a link that says "Image: …".
- **Width**: a bubble is 560px wide at most, a comfortable line to read. A reply with a table or a block of code may take the thread's whole width instead (654px on a wide screen). A table or a block of code wider than its bubble scrolls sideways inside it; the page and the thread never do. On a phone, a table of three or more columns may be 11em a column wide before its text wraps, so its columns aren't squeezed into slivers.
- **Loaded when needed**: the renderer is a chunk of its own, fetched the first time a reply has something to draw; a chat of plain replies never asks for it. Until it arrives the reply reads as typed, and it stays that way if the chunk can't be fetched or a reply can't be drawn.
- **The libraries**: `react-markdown` with `remark-gfm` (tables, task lists, strikethrough, bare addresses as links) and `remark-breaks` (a line break stays a line break). `react-markdown` builds React elements from the text and never sets HTML. `rehype-raw`, which would draw raw HTML, must not be added.

## Toasts and errors

When something the person asked for doesn't work, a toast says so in the corner of the page (above the tab bar on a phone): what failed, why in the API's own words, and a button for the way out where there is one ("See plans"). The same goes for confirmations that arrive on their own, such as a payment landing.

- **One place draws them**: `src/components/toast.tsx`, on the `sonner` library. `toast({ title, body })` is a confirmation, `toastError(title, why, action?)` a failure. The toaster is mounted once, in `Providers`, so setup and sign-in can raise toasts too. sonner's own look is switched off and each part wears the app's design tokens.
- **What stays under a field** is validation: what the form checks itself (an empty name, a URL that isn't https), and the API's verdict on a value that was typed, which is a 400: a coupon code, the code from Anthropic, an API key the provider rejects, a repo that doesn't exist (`refusedTypedValue` in `src/lib/action-errors.ts`). Everything else is a toast: a plan limit, a missing connection, too many tries, the server being down.
- **A list that fails to load** still shows the full "That didn't load" state with "Try again". That is a screen with nothing to show, not an action.
- **The same failure twice** shows one toast, and at most three are up at once.
- The chat's own two messages (a message that didn't send, an approval that didn't go through) are still red lines; the chat is being reworked separately.

## Width

Every screen under the shell takes the whole width of the sheet. `PageBody` (`src/components/page.tsx`) no longer caps it.

- **Lists and tables** fill the width: activity, the credit history, the automations.
- **Cards** sit in as many columns as fit. Apps, plans and templates use a grid; Settings → General and Memory use `Columns`, which fills each column top to bottom so cards of different heights leave no gaps (one column on a phone, two on a laptop, three on a wide monitor).
- **Text that is read**, not scanned, keeps a comfortable line with the `READING` class (72 characters): the intro paragraphs, the message in an approval.
- **Approvals** show the list and the open approval side by side from 1024px, the list taking about a third; below that they stack, which includes a tablet with the sidebar showing.
- Checked at 1440, 1100, 768 and 390 pixels wide.

## Automations

Automations → All automations (`/automations`). An automation is made by asking Tex in chat; there is no form. The page explains that, offers a way to start, and lists what exists.

- **The three kinds**, each with one line on when it runs and a request that makes one: once, on repeat, and when something happens in a connected app. "Try it in chat" opens the chat with the request typed in.
- **Templates**: eight ready-made requests. A click opens the chat with the request typed in, to change and send; "Review every pull request" opens the Pull-request review tab instead. A template that needs an app shows only when that app can be connected here, and says "Connect Gmail first" when it isn't connected yet.
- **How the chat gets the text**: the link is `/?draft=<the request>` (`chatDraftHref` in `src/lib/chat-link.ts`). The composer reads `draft` once, puts it in the box and tidies the address. Nothing is sent until the person presses Send. The crew page's "Try it" links and onboarding's examples use the same address.
- **Each automation in plain words** (`src/lib/automations.ts`): "Every weekday at 8:00 AM, your time", "Once, tomorrow at 10:00 AM", "When a new email arrives in Gmail". A schedule in the person's own time zone reads "your time"; in another it names the place ("London time"). A cron line that isn't one of the usual shapes is shown as it is rather than guessed at, and an app trigger the app doesn't know keeps the app's own name for it, in quotes.
- **With each one**: on or paused and why (with the way out), the next run, the last run, a note that it uses credits, the switch to pause or resume, and Delete, which asks once more.
- **An empty list** says how one comes to exist, in three steps.
- **The plan's limit** is in the header ("4 of 5 on Pro", with Upgrade once it is full) and beside the list. When the plan is full, the templates say so before anyone tries.

## Pull-request review

Automations → Pull-request review (`/automations/reviews`). The person turns review on per GitHub repo. When a pull request in that repo opens or gets new commits, Patch reviews it, comments on the pull request and Tex sends a short verdict to the person's chat. It never merges.

- **Where it lives**: with the automations, because each repo with review on *is* an automation (`preset: pr_review`) and counts against the plan's limit. The two share a header and a plan meter. The crew page links there from Patch.
- **The API**: `GET /v1/pr-reviews`, `PUT` and `DELETE /v1/pr-reviews/{owner}/{repo}`. A repo is paused and resumed as the automation it is (`PATCH /v1/automations/{id}`, the `id` of the review). "Turn off" deletes it.
- **Typing a repo**: `owner/repo`, a GitHub link (also one to a pull request or a branch) or a clone address all work (`parseRepo` in `src/lib/pr-review.ts`).
- **Refusals**, each with its own words (`describeEnableError`): 400 names the repo and says to check that it exists and that the connected GitHub account has admin access; 403 `plan_limit` names the plan's number of automations and links to Plans; 409 says GitHub isn't connected and links to Apps; 429 asks for patience. The 400 is about the repo as typed, so it stays under the field; the others are toasts, with their link as the toast's button. When the Apps list shows GitHub isn't connected, the screen says so before anything is typed.
- **Each row** shows on or paused and why (by you, out of credits, after failures, each with its way out), where the verdict goes (`channel`) and when the last review ran.
- **In the automations list** a repo with review on is labelled "Pull-request review" and shows its repo name; "Manage" leads to the review screen instead of a switch and a delete. Among the templates, "Review every pull request" leads here too.
- Turning review on is the person's standing OK for Patch to comment on pull requests in that repo; the form says so. Everything else risky still asks.

## The crew page

`/crew` says what the crew is and what to ask it.

- **A hero**: the four faces and one sentence. You text Tex; Tex plans the job, hands each part to the specialist best at it and answers. Each member's name and role is a link to its card.
- **A card per member**, in the order the backend lists them: the face on the member's own colour, name and role, whether it works here yet ("Leads your crew", "On your crew", "Coming soon"), the backend's description, three lines on what it does, and a request to try. "Try it" opens the chat with the request typed in (`/?draft=`, as on the automations page). A member that isn't switched on here yet is shown asleep, with no link.
- **Scout's card** says where the real browser stands: part of your plan, needs the Max plan (with a link to Plans), or not ready yet. **Patch's card** leads to pull-request review and says how many repos have it on.
- **How the crew works**: four steps, from texting Tex to Tex answering.
- One column on a phone, two beside the sidebar, four where they fit. The members' colours are design tokens (`--byte`, `--patch`, `--scout`, and the accent for Tex), mixed into the card's surface.

## The crew at work

- **Chat**: `agent.progress` events (`{ text, crew, at }`) arrive on the live stream while a turn runs. The bubble that says "Tex is working…" shows the latest line of each member at work, with its face and name ("Scout · reading 4 pages"). The lines are live only: they are kept in the query cache, emptied when the agent stops being busy and when the stream reconnects, and are not there after a reload.
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

## Billing (Polar)

The backend owns Polar; the app never talks to it directly.

1. **Start**: Plans or Credits calls `POST /v1/billing/checkout` and sends the browser to the Polar URL it returns. The app remembers what it is waiting for (`src/lib/checkout.ts`).
2. **Pay**: on Polar's page. Polar then calls the backend's `/webhooks/polar`; only that changes the plan or adds credits.
3. **Return**: Polar sends the browser to `/billing?checkout=done`, which forwards to Plans.
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
| `pnpm lint && pnpm typecheck && pnpm test` | Checks (ESLint, `tsc`, Vitest) |
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
  onboarding, sign-in, sign-up, sso-callback, billing, connected
  manifest.ts        the web manifest ("Add to Home Screen")
src/components/      screens and UI primitives (ui.tsx, page.tsx, tex.tsx, shell/…, auth/ for the sign-in forms)
  toast.tsx          toasts, drawn by sonner: a confirmation, or an action that failed
  page.tsx           a screen's header and full-width body, columns of cards, the reading width
  chat/agent-bubble.tsx  the bubble for what Tex wrote: as typed, or drawn as Markdown
  chat/markdown.tsx      draws Markdown; loaded the first time a reply needs it
src/lib/
  api/               generated types, typed client, TanStack Query hooks, SSE → cache
  auth-flow.ts       sign-in and sign-up: where to land, Clerk's refusals in words, what comes next
  auth-mode.ts       demo, Clerk or the development token: fixed at build for the pages (env.ts reads it per request)
  media-query.ts     whether a part of the shell that CSS hides is on screen, so it isn't drawn or fetched when it isn't
  demo/              the in-memory demo backend
  channels.ts        which chat apps to offer, from what the backend has switched on
  crew.ts            who is on the crew and what they are doing, from what the backend says; what each one does, in the app's words
  automations.ts     automations in plain words: the three kinds, the templates, when one runs, its status, runs and cost
  chat-link.ts       the link that opens the chat with a request typed in
  action-errors.ts   which failures stay under a field (the API's verdict on a typed value) and which are toasts
  memory.ts          what Tex remembers: the kinds, their order and how a memory's dates read
  pr-review.ts       reading a repo as typed, a repo's state and the API's refusals in words
  conversations.ts   the chat history: which conversation is open, what can be done with it, and the list kept in order as things happen
  chat-thread.ts     the chat thread: whether Tex is at work in the open conversation
  markdown.ts        Markdown in Tex's replies: whether a reply has any, and where a link may lead
  in-view.ts         asks for the next page when the end of a list scrolls into view
  stored-flag.ts     a yes or no this browser remembers (the chat history folded away)
  claude-code.ts     Claude Code's model and thinking effort as the selects offer them
  credit-costs.ts    what credits pay for, in the words every screen uses
  checkout.ts        what a Polar checkout is waiting for, and when it has arrived
```

`src/lib`, `src/components` and most of `src/app` started as a copy of the desktop app's. Until they share a package, a fix to a shared screen has to be made in both repos.

## Not done yet

- Admin screens (`/v1/admin/*`).
- A dark theme. The app is light only, on purpose (`color-scheme: only light` in `globals.css`). The toasts, the crew page and the automations page take every colour from the design tokens, so they would follow a dark set of tokens; the primary button (white text on the ink colour) and the figures' own colours would still need one.
- The demo doesn't make an automation when one is asked for in chat, so a template can be followed as far as the chat and no further.
- The chat's two error lines (a message that didn't send, an approval that didn't go through) are not toasts yet.
- Voice notes from the composer (files and text only).
- Code in a reply has no colours for its syntax, and maths written as LaTeX is shown as typed.
- Markdown is drawn only in Tex's chat messages. Memories, the activity log and an approval's preview are shown as typed.
- Scout's browser: the contract says it isn't built (`browser.available: false`), so there is nothing to show but the note. `browserSeconds` is in the usage and not shown yet.
- What the screens would like and the contract doesn't offer:
  - A pull-request review repo has no history: which pull requests were reviewed, the verdicts, or why a review failed. The screen shows only when the last one ran.
  - There is no way to list the repos of the connected GitHub account, or to check admin access before trying, so the repo is typed.
  - An automation doesn't carry its repo; the automations list finds it in `/v1/pr-reviews` by id.
  - The ledger has no field for the kind of charge, so a paid tool is known by its description.
  - Only progress lines carry `crew`. A web search or a refused page is logged as Tex's, though it is Scout's tool.
  - A conversation doesn't say how many messages it has, so "New chat" only knows the active one is empty when its messages are already loaded.
  - The history can't be searched, and a conversation has no address of its own: a reload opens the active web conversation again.
  - Progress lines are not replayed: after a reload in the middle of a turn the chat says "Tex is working…" until the next line.
  - Memory can't be added or edited from the app, and has no live event (the list is asked for again when a turn ends).
  - The activity log names a memory by id only. Once it is deleted, the log can't say what it was, and a `forget` entry doesn't say whether Tex removed or corrected (the app goes by the entry's summary).
  - A refused save (`memory_refused`) and a search (`recall`) carry no `memoryId`, so they link nowhere.
  - Only the web chat's new chat is known (`chatStartedAt`): one started on Telegram with `/new` draws no divider. A new chat started in another tab shows once the messages are asked for again (there is no live event for it).
  - A turn with no incoming message of its own (an automation, the follow-up to an approval) shows Tex at work only under All, because the agent's state carries no channel.
- Installed on a phone, the app has not been tried on a real Android phone or iPhone.
- Not yet run with a real Clerk application, real Polar products or a real agent container. The sign-in pages have been rendered with the real (development) Clerk application, but no one has signed in or up through them yet: the steps against Clerk are covered by unit tests of the logic, not by a real sign-in.
- Sign-in has no second factor beyond a code by email, no passkeys and no phone numbers, because none is switched on in Clerk.
