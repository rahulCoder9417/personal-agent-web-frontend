// The words of the Help page (/help). Every sentence here says what the product does today, as the
// backend's docs (../beckend/docs/hld-mvp.md, backend-report.md) and code describe it. When the
// backend changes something a user sees (a limit, a command, a price), this file changes with it.
//
// Markup in a sentence (help.ts, parseInline): {place} links to a screen by its name (PLACES),
// [words](#section) or [words](/path) is a link, **bold**, `code` for what is typed.

import { AUTOMATION_KINDS } from "./automations";
import { CREDIT_COSTS } from "./credit-costs";
import { CREW_EXAMPLES } from "./crew";
import { ask, list, note, p, steps, table, type HelpSection } from "./help";

/** The crew's part of the page (`/help#crew`), where the old Crew screen's address leads (crew-address.ts). */
export const CREW_SECTION_ID = "crew";

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "start",
    title: "Getting started",
    summary: "What Textcrew is, the first steps, and where to talk to Tex.",
    icon: "start",
    go: ["chat"],
    topics: [
      {
        id: "start-what",
        title: "What is Textcrew?",
        blocks: [
          p("Textcrew is a personal AI agent that you text. Its name is **Tex**. Tex works in your apps, and its crew researches the web and writes and reviews code. See [The crew](#crew)."),
          p("Tex runs in a private, locked workspace on our server, one per person. You talk to it in plain words, as you would to a person."),
          ask("What’s on my calendar tomorrow?"),
        ],
      },
      {
        id: "start-first-steps",
        title: "The first three things to do",
        blocks: [
          steps(
            "Connect your AI in {ai}. Tex can’t think without one. See [Your AI](#ai).",
            "Connect an app, such as Gmail or GitHub, in {apps}.",
            "Send Tex a first message in {chat}.",
          ),
          p("Then, when you like:"),
          list(
            "{linkTelegram}, so Tex is one text away on your phone.",
            "Try an automation, such as a summary of your email every morning. See [Automations](#automations).",
          ),
          note("The **Getting started** checklist in the sidebar keeps count. On a phone it is at the top of More."),
        ],
      },
      {
        id: "start-where",
        title: "Where do I talk to Tex?",
        blocks: [
          p("In two places. It is the same Tex in both, with the same apps and the same memory."),
          list(
            "**The web chat**: open {chat}. You can attach files, and watch Tex’s answer as it is written.",
            "**Telegram**: text the Textcrew bot from your phone, once you link it. See [Telegram](#telegram).",
          ),
          note("Telegram is the only chat app for now."),
        ],
      },
      {
        id: "start-conversations",
        title: "Conversations and New chat",
        blocks: [
          p("Each conversation has its own context: Tex doesn’t see what was said in another one. What Tex remembers about you ({memory}) stays in all of them."),
          list(
            "**New chat**, at the top of your chat history, starts a fresh conversation. It costs nothing.",
            "Open an earlier web conversation from the history and keep writing. Tex carries on where you left off.",
            "Rename or delete a conversation from the three dots on its row. Deleting removes its messages and files.",
            "On Telegram, send `/new` to start a fresh conversation there.",
          ),
          note("You can start up to 30 new chats an hour."),
        ],
      },
      {
        id: "start-replies",
        title: "How Tex’s replies look",
        blocks: [
          list(
            "In the web chat a reply can have headings, lists, tables, and code with a **Copy** button. It appears a few words at a time while Tex writes it.",
            "While Tex works, the web chat shows who is at work, for example “Scout · reading 4 pages”.",
            "On Telegram the same reply arrives in one piece, as plain text. A table becomes one line per row.",
          ),
        ],
      },
      {
        id: "start-files",
        title: "Files, photos and voice notes",
        blocks: [
          list(
            "**Web chat**: attach up to 5 files to a message with the paperclip, up to 10 MB each.",
            "**Telegram**: send photos, documents, audio and voice notes, up to 25 MB. Tex gets a voice note as text.",
          ),
          note("Voice notes can’t be recorded in the web chat yet."),
        ],
      },
      {
        id: "start-phone",
        title: "Put Textcrew on your phone’s home screen",
        blocks: [
          p("There is no store app. Open this web app in your phone’s browser and choose **Add to Home Screen** (on Android: **Install app**). It then opens in its own window, like an app."),
        ],
      },
    ],
  },

  {
    id: CREW_SECTION_ID,
    title: "The crew",
    summary: "Tex leads, and Byte, Patch and Scout take parts of a job. You ask for all of it in the chat.",
    icon: "crew",
    go: ["chat", "prReview"],
    topics: [
      {
        id: "crew-who",
        title: "Who is on the crew?",
        blocks: [
          p("You only ever text Tex, here or on Telegram. Tex plans the job and hands each part to the specialist best at it, so you never pick one yourself. There is no form for the crew: you ask in plain words."),
          table(
            ["Who", "What they do"],
            ["**Tex**", "Leads. Answers you, works in your apps, does small jobs itself, and asks before anything risky."],
            ["**Byte**", "Writes code and fixes bugs in your GitHub repos, on a new branch, never your main one. Opens a pull request for you to merge."],
            ["**Patch**", "Reviews pull requests for bugs, security and tests. Never changes code, never merges, never approves."],
            ["**Scout**", "Searches the web and reads pages. The only one on the web, with no way into your files or apps."],
          ),
          note("Up to three specialists can work on one job at once."),
        ],
      },
      {
        id: "crew-byte",
        title: "Get code changed (Byte)",
        blocks: [
          p("Ask Tex in the chat: say what to change and in which repo. Tex hands it to Byte, however small the change is."),
          ask(CREW_EXAMPLES.byte),
          list(
            "Byte makes the change on a new branch and runs the project’s tests when it has them.",
            "It pushes the branch and opens a pull request that says what changed and why.",
            "Tex answers with the pull request’s link, what changed and how the tests went. Merging is up to you.",
            "Say more in the same message if it helps: the branch to start from, how to run the tests, or what must work when it’s done.",
          ),
          note("Byte needs GitHub connected in {apps}. Opening the pull request costs 1 credit, like any app action that changes something. Pushing to your main branch is always refused."),
        ],
      },
      {
        id: "crew-patch",
        title: "Get a pull request reviewed (Patch)",
        blocks: [
          p("Ask Tex in the chat, with the repo and the pull request’s number or link. Tex hands it to Patch."),
          ask(CREW_EXAMPLES.patch),
          list(
            "Patch reads the changes, runs the tests, and looks for bugs, security problems and missing tests. Say if it should look hard at something, or how to run the tests.",
            "You get the verdict in the chat: ship, or fix first, with the main findings.",
            "Patch can post its review on the pull request, as one comment. Tex asks for your OK first, unless pull-request review is on for that repo. See [Approvals](#approvals).",
          ),
          note("Patch needs GitHub connected in {apps}."),
        ],
      },
      {
        id: "crew-auto-review",
        title: "Review every pull request in a repo",
        blocks: [
          p("To have Patch review each new pull request in a repo by itself, turn review on for that repo in {prReview}. This one is switched on there, not in the chat: Tex can’t turn it on for you, and sends you there."),
          p("Patch then reviews every pull request that opens or gets new commits, posts one review on it, and sends a short verdict to {automationsChat}. See [Pull-request review](#automations-pr-review)."),
        ],
      },
      {
        id: "crew-brief",
        title: "A bigger job, with the whole brief",
        blocks: [
          p("For Patch or Byte, you can give the whole brief in one message: the repo, the pull request or branch, what to look for or fix, the commands to install and test, and whether to post the report on the pull request or open an issue with it."),
          ask("Patch, review pull request 42 in acme/website. Run pnpm install and pnpm test, and look hard at security."),
          p("Tex runs it as a job of its own, right after it answers you. The work happens in a folder that is deleted afterwards, and the report comes back to the same chat: the verdict, each finding or change with its file and line, the tests run, and what wasn’t checked."),
          note("Posting the report on the pull request waits for your OK first."),
        ],
      },
      {
        id: "crew-scout",
        title: "Research on the web (Scout)",
        blocks: [
          p("Ask Tex anything that needs the web. Tex hands it to Scout, which searches, reads the pages and comes back with an answer and its links."),
          ask(CREW_EXAMPLES.scout),
          list(
            "Reading a web page is free on every plan.",
            "With your Claude plan, Scout uses Claude’s own web search, at no credits. Otherwise web search is part of the Max plan, at about 1 credit a search.",
            "On the Max plan Scout can also drive a real browser, for pages that need clicking, at 2 credits a minute. {plans} says whether it is ready yet.",
          ),
        ],
      },
      {
        id: "crew-at-work",
        title: "See who is working",
        blocks: [
          list(
            "While a specialist works, the web chat shows its face and what it is doing, such as “Scout · reading 4 pages”.",
            "{activity} keeps those lines. Its **Crew** filter shows only them.",
            "On Telegram you get only the finished answer.",
          ),
        ],
      },
    ],
  },

  {
    id: "telegram",
    title: "Telegram",
    summary: "Link it once with a code, then text Tex from your phone.",
    icon: "telegram",
    go: ["linkTelegram", "chatApps"],
    topics: [
      {
        id: "telegram-link",
        title: "Link Telegram",
        blocks: [
          steps(
            "Open {chatApps}. On a phone, Integrations is a tab at the bottom.",
            "Press **Get my Telegram code**. You get a one-time code like `LINK-7KQ2-M9XP`. It works once and lasts 10 minutes.",
            "Press **Open Telegram**. The Textcrew bot opens with your code. Press **Start**, or send the code if it is typed in for you.",
            "The bot answers “✅ Linked!”, and the page says Telegram is linked. Now text Tex anything.",
          ),
          note("On a laptop without Telegram, send the code to the bot from your phone instead."),
        ],
      },
      {
        id: "telegram-commands",
        title: "Bot commands",
        blocks: [
          p("Send these in your chat with the bot:"),
          table(
            ["Send", "What happens"],
            ["`/new`", "Starts a new conversation. Tex won’t use what you talked about before in this chat; your saved memories stay. Free. The bot answers “Started a new chat…”."],
            ["`/clear` or `/reset`", "The same as `/new`."],
            ["`/start`", "What Telegram sends when you open the bot. From **Open Telegram** it carries your code, and links the chat."],
            ["A link code, such as `LINK-7KQ2-M9XP`", "Links this chat to your account."],
            ["A coupon code, such as `AGT-7KQ2-M9XP-4RWD-ABCD`", "Adds the coupon’s credits. The bot says how many, when they expire, and your new balance."],
            ["`yes` or `no`", "Answers the newest approval waiting in this chat, like tapping **Approve** or **Reject**."],
          ),
          note("A command must be the whole message: “/new please” goes to Tex as a normal message. Anything else, `/help` included, is a normal message too: Tex reads it and answers."),
        ],
      },
      {
        id: "telegram-replies",
        title: "Replies and approvals in Telegram",
        blocks: [
          list(
            "Replies are plain text. A table becomes one line per row, and a long reply comes as several messages.",
            "When Tex needs your OK, you get “Approval needed: …” with **Approve** and **Reject** buttons. Tap one, or type yes or no.",
            "Progress lines (“Scout · reading 4 pages”) show only in the web chat. On Telegram you get the finished answer.",
            "The bot never sends a payment link. Plans and credits are bought in the web app.",
          ),
        ],
      },
      {
        id: "telegram-in-web",
        title: "Telegram chats in the web app",
        blocks: [
          p("Your Telegram conversations show in the web chat’s history with the Telegram mark, so you can read them anywhere. To answer one, reply on Telegram."),
          p("An automation you made on Telegram answers in {automationsChat} and also sends a copy to Telegram, starting with ⏰ or ⚡ and its name. To follow up on it, write in the Automations chat."),
        ],
      },
      {
        id: "telegram-unlink",
        title: "Unlink Telegram",
        blocks: [
          steps("Open {chatApps}.", "Press **Unlink** next to the chat, then **Unlink Telegram** to confirm."),
          p("Tex stops reading and answering that chat, and the bot only answers that it isn’t linked. Your chat history stays. To move the chat to another Textcrew account, unlink it first, then send that account’s code."),
        ],
      },
    ],
  },

  {
    id: "ai",
    title: "Your AI",
    summary: "Tex needs an AI to think with. There are three ways to give it one.",
    icon: "ai",
    go: ["ai"],
    topics: [
      {
        id: "ai-three-ways",
        title: "The three ways, and what each costs",
        blocks: [
          table(
            ["Way", "What it costs"],
            ["**Your Claude plan** (beta)", "Your Claude subscription pays for the AI. Tex runs on Claude Code in your private workspace. No credits for the AI."],
            ["**Your own API key**", "An Anthropic, OpenAI or OpenRouter key. The provider bills you for the AI. No credits for the AI."],
            ["**Textcrew AI**", "Nothing to set up. The AI is paid in credits, by how much each answer uses."],
          ),
          p("Whichever you pick, credits still pay for Tex’s running time and for app actions that change something. See [Credits and plans](#credits)."),
        ],
      },
      {
        id: "ai-claude-plan",
        title: "Connect your Claude plan",
        blocks: [
          steps(
            "Open {ai} and start **Connect your Claude plan**.",
            "Sign in on Anthropic’s own page. It shows you a code.",
            "Paste the code back in Textcrew. Tex now runs on Claude Code.",
          ),
          p("Under **Engine** you can pick the Claude model and the thinking effort. **Default** lets Claude Code choose. Some models cost extra on some Claude plans; the list says which."),
          note("We never see or store your Claude password. The sign-in stays in your own workspace."),
        ],
      },
      {
        id: "ai-own-key",
        title: "Use your own API key",
        blocks: [
          steps(
            "Open {ai} and find **Your own API key**.",
            "Pick the provider (Anthropic, OpenAI or OpenRouter) and paste the key. We check it with the provider before saving it.",
          ),
          p("The key is stored encrypted and never goes into Tex’s workspace. Only its last 4 characters are shown. **Remove key** stops Tex using it."),
        ],
      },
      {
        id: "ai-textcrew",
        title: "Textcrew AI",
        blocks: [
          p("Textcrew AI needs no setup and is paid in credits. When it is on offer, Tex uses it until you connect your own AI."),
          p("You can choose it even with a key or a Claude plan saved, and switch back any time. What you set up stays saved."),
          note("It isn’t on offer everywhere yet. When {ai} shows it as “Not available”, connect your Claude plan or a key."),
        ],
      },
      {
        id: "ai-none",
        title: "What happens without an AI",
        blocks: [
          p("If Textcrew AI isn’t on offer and you haven’t connected your own, Tex can’t work. Every message gets one short note asking you to connect your AI, and nothing else runs. The note uses no credits."),
        ],
      },
    ],
  },

  {
    id: "apps",
    title: "Apps and integrations",
    summary: "Connect Gmail, GitHub and other apps, so Tex can work in them.",
    icon: "apps",
    go: ["apps"],
    topics: [
      {
        id: "apps-connect",
        title: "Connect an app",
        blocks: [
          steps(
            "Open {apps} (on a phone, Integrations is a tab at the bottom) and press **Connect** on the app.",
            "Textcrew’s own screen says what Tex can do with it. Press **Continue to Google** (or the app’s own name).",
            "Sign in on the app’s own page and allow access. We never see your password.",
            "You come back to Textcrew, which says the app is connected.",
          ),
          note("An app that says “Not available yet” can’t be connected on Textcrew yet."),
        ],
      },
      {
        id: "apps-what",
        title: "What Tex can do in your apps",
        blocks: [
          p("Ask in plain words:"),
          ask(CREW_EXAMPLES.tex),
          ask("List the pull requests waiting for my review."),
          list(
            "Reading and searching are free.",
            "An action that changes something, such as sending an email or creating an event, costs 1 credit.",
            "Sending to other people, deleting, paying or changing what is already there waits for your **Approve**. See [Approvals](#approvals).",
          ),
        ],
      },
      {
        id: "apps-composio",
        title: "Why does Google’s screen say “Composio”?",
        blocks: [
          p("Textcrew reaches your apps through **Composio**, a service that keeps app sign-ins safe and runs the actions. The keys to your apps stay with Composio and our server, never in Tex’s workspace."),
          p("For now, Google apps use Composio’s shared Google sign-in. So Google’s “Allow” screen names Composio, not Textcrew. It is still your own Google account, and you choose what to allow."),
          note("Some apps show a short Composio page before the app’s own sign-in. Textcrew’s own Google sign-in comes once Google has reviewed it."),
        ],
      },
      {
        id: "apps-manage",
        title: "Disconnect, reconnect or add an account",
        blocks: [
          list(
            "**Disconnect** removes Tex’s access to that account. It asks first, and names any automation that watches the app and would stop with it.",
            "**Reconnect** shows when a connection has expired. Sign in again and it works as before.",
            "**Add account** connects a second account of the same app. Tex uses the newest one.",
          ),
        ],
      },
      {
        id: "apps-plan",
        title: "Which apps are on my plan?",
        blocks: [p("There are about 25 apps. The Free plan includes 10 of them; Pro and Max include all of them. {apps} shows which are on your plan.")],
      },
      {
        id: "apps-mcp",
        title: "Your own MCP servers",
        blocks: [p("On the Max plan you can give Tex your own tool servers (MCP servers), in {mcp}.")],
      },
    ],
  },

  {
    id: "approvals",
    title: "Approvals",
    summary: "Tex asks before it sends, deletes, pays or changes something.",
    icon: "approvals",
    go: ["approvals"],
    topics: [
      {
        id: "approvals-what",
        title: "What needs your OK",
        blocks: [
          table(
            ["Kind of action", "For example"],
            ["Sending to other people", "Send, reply to or forward an email; post, share or invite"],
            ["Deleting", "Delete, remove, trash or archive"],
            ["Paying", "Pay, transfer, charge or refund"],
            ["Changing what is there", "Update, move, merge, close, cancel, accept or decline"],
            ["Calendar events", "Creating one, because people may be invited"],
            ["GitHub", "Comments and reviews"],
          ),
          p("Reading and searching never ask. Neither does saving an email draft."),
        ],
      },
      {
        id: "approvals-web",
        title: "Approve in the web app",
        blocks: [
          list(
            "In the chat, Tex’s question is a card marked **Needs your OK**, with **Approve** and **Reject**. It shows exactly what will happen, such as the email as it will be sent.",
            "Every waiting approval is also in {approvals}, with a count beside it in the sidebar. That includes the ones Tex asked on Telegram.",
          ),
        ],
      },
      {
        id: "approvals-telegram",
        title: "Approve in Telegram",
        blocks: [p("You get “Approval needed: …” with two buttons. Tap **Approve** or **Reject**, or type yes or no. A typed answer goes to the newest approval waiting in that chat.")],
      },
      {
        id: "approvals-rules",
        title: "How approvals work",
        blocks: [
          list(
            "An approval works once, and only for exactly what you saw. If anything changes, Tex has to ask again.",
            "After you approve, Tex carries on in the conversation where it asked.",
            "If you reject, Tex doesn’t do it.",
            "An approval nobody answers expires after 24 hours, and nothing happens.",
          ),
          note("Turning on pull-request review for a repo is your standing OK for Patch’s review comments there. Everything else still asks."),
        ],
      },
    ],
  },

  {
    id: "automations",
    title: "Automations",
    summary: "Tex works on a schedule, or when something happens in your apps.",
    icon: "automations",
    go: ["automations", "automationsChat"],
    topics: [
      {
        id: "automations-kinds",
        title: "Three kinds",
        blocks: [
          table(["Kind", "When it runs"], ...AUTOMATION_KINDS.map((kind) => [kind.name, kind.when] as const)),
          ...AUTOMATION_KINDS.map((kind) => ask(kind.example)),
        ],
      },
      {
        id: "automations-make",
        title: "Make one",
        blocks: [
          p("Ask Tex in chat, in plain words. There is no form. Tex says what it set up and when it runs."),
          ask("Every weekday at 10am, list the pull requests waiting for my review."),
          p("{automations} has ready-made ones. A click opens the chat with the words typed in; nothing is sent until you press Send."),
        ],
      },
      {
        id: "automations-results",
        title: "Where the results go",
        blocks: [
          p("Every run answers in {automationsChat}, pinned at the top of your chat history. A dot shows when a new run has arrived. Write there to follow up: Tex has the runs in mind."),
          p("An automation you made on Telegram also sends a copy of each answer to Telegram."),
        ],
      },
      {
        id: "automations-time",
        title: "Your time zone",
        blocks: [p("“Every morning at 9” means 9 where you are. Textcrew takes your time zone from your browser on your first visit. Change it in {timezone}.")],
      },
      {
        id: "automations-limits",
        title: "Limits and cost",
        blocks: [
          list(
            "Free allows 1 automation, Pro 5 and Max 50. Reminders and paused ones count. A repo with pull-request review counts as one.",
            "A schedule can run at most once every 15 minutes.",
            "Each run costs what a message costs: running time, the AI on Textcrew AI, and 1 credit for each app action that changes something.",
            "A risky action in a run still waits for your **Approve**.",
          ),
        ],
      },
      {
        id: "automations-manage",
        title: "Pause, change or delete one",
        blocks: [
          list(
            "On {automations}, the switch on each card pauses or resumes it.",
            "**Change** opens the chat with “Change my automation …” typed in. Tell Tex what to change.",
            "**Delete** removes it, after asking once more.",
          ),
          p("Textcrew pauses an automation by itself at zero credits (it comes back when credits are added) and after 3 failures in a row (turn it back on yourself)."),
        ],
      },
      {
        id: "automations-late",
        title: "A run that starts late",
        blocks: [p("If Textcrew was down when a run was due, the run happens as soon as it is back; it is never skipped. If it starts more than 10 minutes late, Tex says so.")],
      },
      {
        id: "automations-pr-review",
        title: "Pull-request review",
        blocks: [
          p("In {prReview}, turn review on for a GitHub repo. When a pull request opens or gets new commits, Patch reviews it and posts one review on GitHub. You get a short verdict in the Automations chat. Patch never merges and never approves."),
          note("It needs GitHub connected in {apps}, and admin access to the repo."),
          p("To have one pull request reviewed once, ask Tex in the chat. See [Get a pull request reviewed](#crew-patch)."),
        ],
      },
    ],
  },

  {
    id: "credits",
    title: "Credits and plans",
    summary: "What uses credits, how long they last, and what happens at zero.",
    icon: "credits",
    go: ["credits", "plans"],
    topics: [
      {
        id: "credits-what",
        title: "What uses credits",
        blocks: [
          list(...CREDIT_COSTS.map((cost) => `**${cost.name}**: ${cost.detail}`)),
          p("Free: reading and searching in apps, reading a web page, starting a new chat, and the web search built into Claude Code on your Claude plan."),
          note("{credits} shows a chart of what you used, and every charge."),
        ],
      },
      {
        id: "credits-expiry",
        title: "Credits last 90 days",
        blocks: [
          list(
            "Credits come in batches: 100 when you sign up, your plan’s credits every month, a top-up, or a coupon.",
            "Each batch lasts 90 days from the day you get it. A coupon may set its own length.",
            "The batch that ends soonest is spent first, so you lose as few as possible.",
            "Monthly credits you don’t use carry over until their 90 days are up.",
          ),
          note("The credits card in the sidebar says when the next ones expire."),
        ],
      },
      {
        id: "credits-zero",
        title: "At zero credits",
        blocks: [
          list(
            "A new message gets a short reply, “You’re out of credits, so I can’t work on that right now.”, and nothing else runs.",
            "Your automations pause. They start again by themselves when credits are added.",
            "App actions that change something are refused. Reading still works.",
          ),
          p("The balance can dip a little below zero when a last task costs more than was left. Your next credits cover that first. To carry on, buy a top-up or change plan in {plans}, or redeem a coupon in {credits}."),
        ],
      },
      {
        id: "credits-refunds",
        title: "Failed tasks are refunded",
        blocks: [
          p("If a task fails because of a problem on our side, Tex says “Sorry, something went wrong on our side and I couldn’t finish that. You weren’t charged for it.” The credits it used come back shortly after."),
          p("A failure that isn’t ours isn’t refunded, for example when your Claude plan has hit its limit."),
        ],
      },
      {
        id: "credits-plans",
        title: "The plans",
        blocks: [
          table(
            ["Plan", "What you get"],
            ["**Free**", "100 credits once, when you sign up. 10 apps. 1 automation."],
            ["**Pro**", "1,500 credits every month. All apps. 5 automations. Top-ups."],
            ["**Max**", "4,500 credits every month. All apps and your own MCP servers. 50 automations. Web search through Textcrew. First in line when the server is busy."],
          ),
          p("Prices and the rest are in {plans}. Plans and top-ups are bought in the web app, never in Telegram."),
          p("To cancel, press **Cancel plan** in {plans}. You keep the plan until the end of the period you’ve paid for, then move to Free. The credits you have stay until they expire."),
          note("To move between Pro and Max, cancel the plan you have first, then pick the other."),
        ],
      },
      {
        id: "credits-coupon",
        title: "Redeem a coupon",
        blocks: [
          p("Type the code in {credits} under **Redeem a code**, or send it to the Textcrew bot on Telegram. Codes look like `AGT-7KQ2-M9XP-4RWD-ABCD`."),
          note("A coupon works once per account. Your account needs a verified email and a linked chat app, such as Telegram."),
        ],
      },
    ],
  },

  {
    id: "privacy",
    title: "Memory and privacy",
    summary: "What Tex remembers, how to delete it, and how to delete your account.",
    icon: "privacy",
    go: ["memory", "activity", "account"],
    topics: [
      {
        id: "memory-what",
        title: "What Tex remembers",
        blocks: [
          p("Tex keeps short notes about you: preferences, people, projects, standing instructions and other lasting facts. Each is one line, and every conversation shares them."),
          ask("Remember that Priya handles finance."),
          list(
            "Tex saves what you tell it or confirm, not what it only read in an email or on a web page.",
            "Tex won’t save anything that looks like a password, a key or a card number.",
            "Up to 200 memories.",
          ),
        ],
      },
      {
        id: "memory-manage",
        title: "See, fix or delete memories",
        blocks: [
          p("{memory} lists every memory, grouped by kind. **Delete** removes one, **Delete all** removes them all; both ask once more."),
          p("To add or correct one, tell Tex:"),
          ask("That’s wrong: Priya handles sales now."),
        ],
      },
      {
        id: "privacy-activity",
        title: "The activity log",
        blocks: [p("{activity} lists everything Tex did: each action, when it happened and what it cost. It never holds the text of a memory.")],
      },
      {
        id: "privacy-data",
        title: "Your workspace and your data",
        blocks: [
          list(
            "Your agent runs in a private, locked workspace. Its files and notes never mix with anyone else’s.",
            "The keys to your apps never go into that workspace.",
            "Your data isn’t used to train AI. With your own key, your provider’s terms apply.",
          ),
          p("The full privacy policy is at {privacy}."),
        ],
      },
      {
        id: "privacy-delete-account",
        title: "Delete your account",
        blocks: [
          steps("Open {account}.", "Press **Delete my account and data**, then type DELETE to confirm."),
          p("This removes your agent and its workspace, your conversations, files, memories, approvals, activity log, connected apps, keys and automations. A paid plan stops renewing. Records of payments and credits are kept."),
          note("It can’t be undone."),
        ],
      },
    ],
  },

  {
    id: "faq",
    title: "Troubleshooting",
    summary: "Quick fixes when something doesn’t work.",
    icon: "faq",
    go: [],
    topics: [
      {
        id: "faq-no-answer",
        title: "Tex doesn’t answer",
        blocks: [
          steps(
            "Check {ai}. Without an AI, Tex only replies with a note asking you to connect one.",
            "Check your credits. At zero, Tex replies that you’re out of credits.",
            "Give it a few seconds. Tex sleeps after a few quiet minutes, and your message wakes it.",
            "On your Claude plan: if the plan hit its limit or was signed out, Tex says so. Reconnect it in {ai} if asked.",
            "If something failed on our side, Tex says so and you weren’t charged. Send it again.",
          ),
          note("Messages sent while Tex is busy wait their turn. Tex answers them one at a time."),
        ],
      },
      {
        id: "faq-not-linked",
        title: "The bot says this chat isn’t linked",
        blocks: [
          p("The chat isn’t tied to your account yet, or it was unlinked. Link it again with a new code: {linkTelegram}."),
          note("The bot’s message tells you where to get the code: {chatApps}."),
        ],
      },
      {
        id: "faq-blocked",
        title: "Tex’s replies don’t arrive on Telegram",
        blocks: [
          p("If you blocked the Textcrew bot, Telegram won’t let Tex send anything to that chat, and {chatApps} marks it **Blocked the bot**. Unblock the bot in Telegram and send it a message: the mark goes, and replies reach you again."),
          note("Until then, look for Tex’s answers in the web chat."),
        ],
      },
      {
        id: "faq-link-code",
        title: "My link code doesn’t work",
        blocks: [
          list(
            "A code lasts 10 minutes and works once. Get a new one.",
            "After 10 tries in an hour, the bot asks you to wait an hour.",
            "“Linked to another Textcrew account”: sign in to that account, unlink the chat there, then send your code again.",
            "“Already linked to your account”: you’re set. Just text Tex.",
          ),
        ],
      },
      {
        id: "faq-expired",
        title: "A connection expired",
        blocks: [
          p("Open {apps} and press **Reconnect** on the app. Tex tells you when an app needs it."),
          p("If Tex says an app is “still connecting”, the sign-in is finishing. Wait a minute and ask again. If it never finishes, connect it again."),
        ],
      },
      {
        id: "faq-forgot",
        title: "Tex forgot what we talked about",
        blocks: [
          p("You are probably in a new conversation (**New chat**, or `/new` on Telegram), and each one starts fresh. Open the earlier one from your chat history and carry on there."),
          p("For things Tex should always know, ask it to remember them."),
        ],
      },
      {
        id: "faq-automation-stopped",
        title: "An automation stopped running",
        blocks: [p("Its card on {automations} says why: out of credits (it comes back when credits are added), paused after failures (turn it back on), or paused by you.")],
      },
      {
        id: "faq-telegram-read-only",
        title: "I can’t write in a Telegram conversation here",
        blocks: [p("Telegram conversations are for reading in the web app. Reply on Telegram, or start a **New chat** here.")],
      },
      {
        id: "faq-approval-gone",
        title: "An approval says it was already answered or has expired",
        blocks: [p("Each approval works once and expires after 24 hours. Ask Tex again, and approve the new one.")],
      },
      {
        id: "faq-coupon",
        title: "My coupon code is refused",
        blocks: [
          p("Every refusal says “invalid or expired”, whatever the reason. Check the code, and that your account has a verified email and a linked chat app. A coupon works once per account."),
          note("After 5 tries in an hour, wait a while before trying again."),
        ],
      },
    ],
  },
];

/** The answers people look for first, linked from the top of the page by their address. */
export const HELP_POPULAR: readonly { topic: string; label: string }[] = [
  { topic: "telegram-link", label: "Link Telegram" },
  { topic: "telegram-commands", label: "Telegram commands, like /new" },
  { topic: "ai-three-ways", label: "Connect your AI" },
  { topic: "apps-composio", label: "Why Google’s screen says “Composio”" },
  { topic: "faq-no-answer", label: "Tex doesn’t answer" },
];

/** What the foot of the page offers to ask Tex: it can see the apps, the plan and the automations. */
export const HELP_ASK_TEX = "Which of my apps are connected, and which need reconnecting?";
