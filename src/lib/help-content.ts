// The words of the Help page (/help), kept short: one fact and a link to the right screen per answer.
// Every sentence says what the product does today. When the backend changes something a user sees
// (a limit, a command, a price), this file changes with it.
//
// Markup in a sentence (help.ts, parseInline): {place} links to a screen by its name (PLACES),
// [words](#section) or [words](/path) is a link, **bold**, `code` for what is typed.

import { CREDIT_COSTS } from "./credit-costs";
import { CREW_EXAMPLES } from "./crew";
import { ask, list, note, p, steps, table, type HelpSection, type HelpTopic, type PlaceId } from "./help";

/** The crew's part of the page (`/help#crew`), where the old Crew screen's address leads (crew-address.ts). */
export const CREW_SECTION_ID = "crew";

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "start",
    title: "Getting started",
    summary: "What Textcrew is and where to talk to Tex.",
    icon: "start",
    go: ["chat"],
    topics: [
      {
        id: "start-what",
        title: "What is Textcrew?",
        blocks: [
          p("A personal AI agent you text. Its name is **Tex**. Tex works in your apps, and its crew researches the web and writes and reviews code. See [The crew](#crew)."),
          ask("What’s on my calendar tomorrow?"),
        ],
      },
      {
        id: "start-first-steps",
        title: "What should I do first?",
        blocks: [
          steps(
            "Give Tex an AI in {ai}. If Textcrew AI shows as ready, you can skip this.",
            "Connect an app, such as Gmail, in {apps}.",
            "Send Tex your first message in {chat}.",
          ),
        ],
      },
      {
        id: "start-where",
        title: "Where do I talk to Tex?",
        blocks: [p("In the web chat ({chat}) and on Telegram. It is the same Tex in both. See [Telegram](#telegram).")],
      },
      {
        id: "start-soon",
        title: "WhatsApp, iMessage, desktop and phone apps?",
        blocks: [
          p("Not yet. Only the web app and Telegram are live. The desktop and mobile apps are in beta. On a phone, open the web app and choose **Add to Home Screen** to use it like an app."),
        ],
      },
      {
        id: "start-conversations",
        title: "How do I start a new chat?",
        blocks: [p("Press **New chat** in your chat history, or send `/new` on Telegram. It is free. Tex forgets that conversation but keeps your {memory}.")],
      },
    ],
  },

  {
    id: CREW_SECTION_ID,
    title: "The crew",
    summary: "Tex leads. Byte, Patch and Scout take parts of a job.",
    icon: "crew",
    go: ["chat", "prReview"],
    topics: [
      {
        id: "crew-who",
        title: "Who is on the crew?",
        blocks: [
          p("You only text Tex. Tex hands each part of a job to the right specialist. There is no form: you ask in plain words."),
          table(
            ["Who", "What they do"],
            ["**Tex**", "Leads, works in your apps, and asks before anything risky."],
            ["**Byte**", "Changes code in your GitHub repos on a new branch and opens a pull request."],
            ["**Patch**", "Reviews pull requests. Never changes code or merges."],
            ["**Scout**", "Searches the web and reads pages."],
          ),
        ],
      },
      {
        id: "crew-byte",
        title: "Get code changed (Byte)",
        blocks: [
          p("Tell Tex what to change and in which repo. Byte makes the change on a new branch and opens a pull request. Merging is up to you."),
          ask(CREW_EXAMPLES.byte),
          note("Needs GitHub connected in {apps}. Opening the pull request costs 1 credit."),
        ],
      },
      {
        id: "crew-patch",
        title: "Get a pull request reviewed (Patch)",
        blocks: [
          p("Give Tex the repo and the pull request’s number or link. Patch sends you a verdict in the chat. Posting it on the pull request waits for your OK. See [Approvals](#approvals)."),
          ask(CREW_EXAMPLES.patch),
        ],
      },
      {
        id: "crew-auto-review",
        title: "Review every pull request in a repo",
        blocks: [p("Turn on review for the repo in {prReview}. Patch then reviews each new pull request and sends a short verdict to {automationsChat}. See [Pull-request review](#automations-pr-review).")],
      },
      {
        id: "crew-scout",
        title: "Research on the web (Scout)",
        blocks: [
          p("Ask Tex anything that needs the web. Scout comes back with an answer and its links. Reading a page is free; web search is part of the Max plan, or free with your Claude plan."),
          ask(CREW_EXAMPLES.scout),
        ],
      },
    ],
  },

  {
    id: "telegram",
    title: "Telegram",
    summary: "Link it once, then text Tex from your phone.",
    icon: "telegram",
    go: ["linkTelegram", "chatApps"],
    topics: [
      {
        id: "telegram-link",
        title: "How do I link Telegram?",
        blocks: [
          steps(
            "Open {chatApps} and press **Get my Telegram code**. The code works once and lasts 10 minutes.",
            "Press **Open Telegram**, then **Start** in the Textcrew bot.",
            "The bot answers “✅ Linked!”. Now text Tex anything.",
          ),
        ],
      },
      {
        id: "telegram-commands",
        title: "Bot commands",
        blocks: [
          table(
            ["Send", "What happens"],
            ["`/new` (or `/clear`, `/reset`)", "Starts a new conversation. Free."],
            ["`/help`", "A short note on what Tex can do, with a link to this page."],
            ["`/start`", "What Telegram sends when you open the bot. With your code, it links the chat."],
            ["A link code, such as `LINK-7KQ2-M9XP`", "Links this chat to your account."],
            ["A coupon code, such as `AGT-7KQ2-M9XP-4RWD-ABCD`", "Adds the coupon’s credits."],
            ["`yes` or `no`", "Answers the newest approval waiting in this chat."],
          ),
          note("A command must be the whole message. Anything else goes to Tex."),
        ],
      },
      {
        id: "telegram-notices",
        title: "Hear on Telegram when work is done",
        blocks: [p("In {telegramNotices}, choose which notices to get: Byte or Patch finishing, pull-request reviews, automation runs, and automation approvals. Quiet hours (10 PM to 8 AM at first) mute the sound.")],
      },
      {
        id: "telegram-unlink",
        title: "How do I unlink Telegram?",
        blocks: [p("Open {chatApps} and press **Unlink** next to the chat. Your chat history stays.")],
      },
    ],
  },

  {
    id: "ai",
    title: "Your AI",
    summary: "Tex needs an AI to think with.",
    icon: "ai",
    go: ["ai"],
    topics: [
      {
        id: "ai-three-ways",
        title: "How do I give Tex an AI, and what does it cost?",
        blocks: [
          table(
            ["Way", "What it costs"],
            ["**Your Claude plan** (beta)", "Your Claude subscription pays. No credits for the AI."],
            ["**Your own API key**", "Anthropic, OpenAI or OpenRouter bills you. No credits for the AI."],
            ["**Textcrew AI**", "Nothing to set up. Paid in credits."],
          ),
          p("Credits still pay for Tex’s running time and app actions. See [Credits and plans](#credits)."),
        ],
      },
      {
        id: "ai-connect",
        title: "How do I connect my Claude plan or API key?",
        blocks: [
          steps(
            "Open {ai}.",
            "For a Claude plan, press **Connect your Claude plan**, sign in on Anthropic’s page and paste the code back. For a key, pick the provider and paste it.",
          ),
          note("We never see your Claude password, and your key is stored encrypted."),
        ],
      },
      {
        id: "ai-none",
        title: "What happens without an AI?",
        blocks: [p("Tex can’t work. Every message gets one short note asking you to connect an AI, at no cost. If {ai} shows Textcrew AI as “Not available”, connect your Claude plan or a key.")],
      },
    ],
  },

  {
    id: "apps",
    title: "Apps and integrations",
    summary: "Connect Gmail, GitHub and more, so Tex can work in them.",
    icon: "apps",
    go: ["apps"],
    topics: [
      {
        id: "apps-connect",
        title: "How do I connect an app?",
        blocks: [
          p("Open {apps}, press **Connect** on the app, then sign in on the app’s own page. We never see your password. The Free plan includes 10 apps; Pro and Max include all."),
        ],
      },
      {
        id: "apps-gmail",
        title: "How do I connect Gmail?",
        blocks: [
          p("Open {apps}, press **Connect** on Gmail, then **Continue to Google** and allow access. Google’s screen may name Composio: see [Why does Google say Composio?](#apps-composio)."),
          ask("Summarize my unread email from today."),
          note("Reading mail is free. Sending asks for your OK first and costs 1 credit."),
        ],
      },
      {
        id: "apps-composio",
        title: "Why does Google say “Composio”?",
        blocks: [p("Composio is the service that keeps app sign-ins safe. Google apps use its shared sign-in for now. It is still your own account, and your keys never go into Tex’s workspace.")],
      },
      {
        id: "apps-manage",
        title: "How do I disconnect or reconnect an app?",
        blocks: [p("In {apps}: **Disconnect** removes Tex’s access, **Reconnect** shows when a connection has expired, and **Add account** connects a second account.")],
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
        id: "approvals-why",
        title: "Why did Tex ask for my OK?",
        blocks: [
          p("Sending to other people, deleting, paying and changing what is already there always ask. Reading and searching never do. Tex shows exactly what it will do and waits for **Approve**."),
          list("Press **Reject** and Tex leaves it alone.", "Missed it? Every waiting question is in {approvals}. It expires after 24 hours."),
        ],
      },
      {
        id: "approvals-skip",
        title: "Can I stop Tex asking every time?",
        blocks: [
          p("On a card for an app action, choose **Don’t ask again for this…** to make a skip rule. Remove it any time under **Skip rules** in {approvals}. Deleting, paying and merging always ask."),
        ],
      },
      {
        id: "approvals-telegram",
        title: "Approve in Telegram",
        blocks: [p("Tap **Approve** or **Deny**, or type yes or no. The first answer counts, wherever you give it.")],
      },
    ],
  },

  {
    id: "automations",
    title: "Automations",
    summary: "Tex works on a schedule, or when something happens.",
    icon: "automations",
    go: ["automations", "automationsChat"],
    topics: [
      {
        id: "automations-make",
        title: "How do I make an automation?",
        blocks: [
          p("Ask Tex in plain words. Tex shows a **draft**, and nothing runs until you save it. Or use **New automation** on {automations}. It can run once, on a schedule, or when something happens in an app."),
          ask("Every weekday at 10am, list the pull requests waiting for my review."),
        ],
      },
      {
        id: "automations-results",
        title: "Where do the results go?",
        blocks: [p("Every run answers in {automationsChat}. Write there to follow up. For Telegram copies, switch on **Automation runs finish** in {telegramNotices}.")],
      },
      {
        id: "automations-limits",
        title: "Limits, cost and pausing",
        blocks: [
          list(
            "Free allows 1 automation, Pro 5 and Max 50. A schedule runs at most every 15 minutes.",
            "A run costs what a message costs. Risky actions still wait for your **Approve**.",
            "Textcrew pauses an automation at zero credits and after 3 failures in a row. Its card on {automations} says why.",
          ),
        ],
      },
      {
        id: "automations-pr-review",
        title: "Pull-request review",
        blocks: [p("In {prReview}, type the GitHub repo and press **Turn on review**. Patch reviews each new pull request. It needs GitHub connected in {apps} and admin access to the repo.")],
      },
    ],
  },

  {
    id: "credits",
    title: "Credits and plans",
    summary: "What uses credits, how long they last, and what the plans cost.",
    icon: "credits",
    go: ["credits", "plans"],
    topics: [
      {
        id: "credits-what",
        title: "What uses credits?",
        blocks: [
          list(...CREDIT_COSTS.map((cost) => `**${cost.name}**: ${cost.detail}`)),
          note("There is no fee for waking Tex. A task that fails on our side is refunded. {credits} shows every charge."),
        ],
      },
      {
        id: "credits-expiry",
        title: "How long do credits last?",
        blocks: [
          p("The 100 sign-up credits last 14 days, and are given once per email inbox. Every other batch lasts 90 days. The batch that ends soonest is spent first."),
        ],
      },
      {
        id: "credits-zero",
        title: "What happens when I run out of credits?",
        blocks: [
          p("Tex replies that you’re out of credits, your automations pause, and app actions that change something are refused. Buy a top-up or change plan in {plans}, or redeem a coupon in {credits}. Everything resumes when credits are added."),
        ],
      },
      {
        id: "credits-plans",
        title: "Which plan do I need, and what does it cost?",
        blocks: [
          table(
            ["Plan", "What you get"],
            ["**Free**", "100 credits once, lasting 14 days. 10 apps. 1 automation."],
            ["**Pro** ($19 a month at launch)", "1,500 credits a month. All apps. 5 automations."],
            ["**Max** ($30 a month at launch)", "4,500 credits a month. Your own MCP servers. 50 automations. Web search."],
          ),
          p("A top-up (Pro and Max) is $10 for 800 credits. Waitlist members get 50% off their first month. Buy, cancel and see invoices in {plans}, never in Telegram."),
        ],
      },
      {
        id: "credits-coupon",
        title: "How do I redeem a coupon code?",
        blocks: [p("Type it in {credits} under **Redeem a code**, or send it to the bot on Telegram. A coupon works once per account.")],
      },
    ],
  },

  {
    id: "privacy",
    title: "Memory and privacy",
    summary: "What Tex remembers, and how to delete it.",
    icon: "privacy",
    go: ["memory", "activity", "account"],
    topics: [
      {
        id: "memory-what",
        title: "What does Tex remember?",
        blocks: [
          p("Short notes about you that every conversation shares. See, fix or delete them in {memory}. To add one, tell Tex."),
          ask("Remember that Priya handles finance."),
        ],
      },
      {
        id: "privacy-data",
        title: "Is my data private?",
        blocks: [
          p("Your agent runs in its own locked workspace, your app keys never go into it, and your data isn’t used to train AI. {activity} lists everything Tex did. The policy is at {privacy}."),
        ],
      },
      {
        id: "privacy-delete-account",
        title: "How do I delete my account?",
        blocks: [p("Open {account} and press **Delete my account and data**. This removes your agent, conversations, memories, apps, automations and the backups of your workspace files. The rest leaves our database backups within 7 days. It can’t be undone.")],
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
            "Check {ai}. Without an AI, Tex only asks you to connect one.",
            "Check your credits. At zero, Tex says you’re out.",
            "Wait a few seconds. Tex sleeps when quiet, and your message wakes it.",
          ),
        ],
      },
      {
        id: "faq-telegram",
        title: "Telegram isn’t working",
        blocks: [
          list(
            "“Isn’t linked”: get a new code with {linkTelegram}. A code lasts 10 minutes and works once.",
            "No replies: if you blocked the bot, unblock it and send a message.",
          ),
        ],
      },
      {
        id: "faq-expired",
        title: "A connection expired",
        blocks: [p("Open {apps} and press **Reconnect** on the app.")],
      },
      {
        id: "faq-forgot",
        title: "Tex forgot what we talked about",
        blocks: [p("You are probably in a new conversation. Open the earlier one from your chat history. For things Tex should always know, ask it to remember them.")],
      },
      {
        id: "faq-coupon",
        title: "My coupon code is refused",
        blocks: [p("Check the code, and that your account has a verified email and a linked chat app. A coupon works once per account.")],
      },
    ],
  },
];

/** Help's answer on auto top-up. Only shown while the server allows it (see `helpSectionsFor`). */
const AUTO_TOPUP_TOPIC: HelpTopic = {
  id: "credits-auto-topup",
  title: "Auto top-up",
  blocks: [
    p("On Pro and Max, Polar can add credits before you run out. Turn it on in {plans} under **Auto top-up** and pick the pack and a monthly limit. Switch it off any time. Without it, nothing is charged at zero."),
  ],
};

/**
 * The Help page's sections, with what the server has switched on. With auto top-up allowed,
 * "At zero credits" no longer reads as if a card is never charged, and the answer above is added.
 */
export function helpSectionsFor(options: { autoTopUp: boolean }): readonly HelpSection[] {
  if (!options.autoTopUp) return HELP_SECTIONS;
  return HELP_SECTIONS.map((section) => ({
    ...section,
    topics: section.topics.flatMap((topic) => {
      if (topic.id === "credits-zero") {
        return [
          {
            ...topic,
            blocks: [...topic.blocks, note("With auto top-up on, Polar adds credits before you reach zero, up to your monthly limit. See [Auto top-up](#credits-auto-topup).")],
          },
          AUTO_TOPUP_TOPIC,
        ];
      }
      return [topic];
    }),
  }));
}

export const HELP_POPULAR: readonly { topic: string; label: string }[] = [
  { topic: "apps-gmail", label: "Connect Gmail" },
  { topic: "approvals-why", label: "Why did Tex ask for my OK?" },
  { topic: "credits-zero", label: "Out of credits" },
  { topic: "telegram-link", label: "Link Telegram" },
  { topic: "faq-no-answer", label: "Tex doesn’t answer" },
];

/** "Get started in 3 steps", at the top of the page: each leads to the screen where it is done. */
export const HELP_START_STEPS: readonly { title: string; body: string; place: PlaceId; topic: string }[] = [
  { title: "Give Tex an AI", body: "Use Textcrew AI, your own API key or your Claude plan.", place: "ai", topic: "ai-three-ways" },
  { title: "Connect an app", body: "Gmail or GitHub, so Tex can work in them.", place: "apps", topic: "apps-gmail" },
  { title: "Say hi to Tex", body: "Ask in the chat, or link Telegram and text from your phone.", place: "chat", topic: "start-where" },
];

/** Where to write when the page doesn't answer. */
export const HELP_CONTACT = "support@textcrew.in";

/** What the foot of the page offers to ask Tex: it can see the apps, the plan and the automations. */
export const HELP_ASK_TEX = "Which of my apps are connected, and which need reconnecting?";
