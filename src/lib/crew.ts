// The crew, as the backend describes it (`GET /v1/crew`): Tex leads, and Byte, Patch and Scout are
// the specialists it hands work to. Who they are (name, role, description) and who is available
// comes from the backend. What is written here is what the backend doesn't say: what each one is
// good for in three lines, a request to try, and how the crew works together.

import type { AgentProgress, CrewMember } from "./api/client";
import { listNames, titleCase } from "./format";

/** What the crew page says about a member beyond the backend's one-line description. */
export type CrewGuide = {
  /** What it can do, as three short lines. */
  does: readonly [string, string, string];
  /** Something to ask Tex that this member would end up doing. */
  example: string;
};

/**
 * What each member is good for. These follow the crew as it is built: Byte works on a new branch
 * and opens the pull request, Patch posts one review and never changes code, and only Scout
 * touches the web.
 */
export const CREW_GUIDE: Record<CrewMember["id"], CrewGuide> = {
  tex: {
    does: [
      "Answers you here and in every chat app you linked",
      "Plans the job and hands each part to the right specialist",
      "Works in your connected apps, and asks before anything risky",
    ],
    example: "Summarise my unread email and tell me what needs a reply today.",
  },
  byte: {
    does: ["Writes new code and fixes bugs in your repos", "Works on a new branch, never on your main one", "Opens the pull request for you to merge"],
    example: "Fix the typo in the README of acme/website and open a pull request.",
  },
  patch: {
    does: [
      "Reviews a pull request for bugs, security and tests",
      "Posts one review on the pull request and sends you the verdict",
      "Never changes code, and never merges",
    ],
    example: "Review pull request 42 in acme/website.",
  },
  scout: {
    does: [
      "Searches the web and reads the pages it finds",
      "Comes back with a short answer and its links",
      "The only one on the web, with no way into your files or apps",
    ],
    example: "Research what other scheduling tools charge, with links.",
  },
};

/** How a job moves through the crew, for the strip at the foot of the crew page. */
export const CREW_STEPS: readonly { title: string; body: string }[] = [
  { title: "You text Tex", body: "One chat, in plain words. You never have to pick a specialist yourself." },
  { title: "Tex plans and hands out", body: "Each part goes to whoever is best at it. Up to three specialists can work on one job at once." },
  { title: "You see who is working", body: "The chat shows each one at work (“Scout · reading 4 pages”), and the activity log keeps it." },
  { title: "Tex answers", body: "One answer comes back from Tex. Sending, deleting or spending still waits for your OK." },
];

/** Whether a member works here yet, as the pill on its card says it. */
export function describeAvailability(member: Pick<CrewMember, "kind" | "available">): { label: string; tone: "done" | "muted" } {
  if (member.kind === "lead") return { label: "Leads your crew", tone: "done" };
  return member.available ? { label: "On your crew", tone: "done" } : { label: "Coming soon", tone: "muted" };
}

/** The lead, the specialists that work on this deployment, and the ones still to come. */
export function splitCrew(crew: readonly CrewMember[]): { lead: CrewMember | undefined; working: CrewMember[]; coming: CrewMember[] } {
  const specialists = crew.filter((member) => member.kind === "specialist");
  return {
    lead: crew.find((member) => member.kind === "lead"),
    working: specialists.filter((member) => member.available),
    coming: specialists.filter((member) => !member.available),
  };
}

const names = (members: readonly CrewMember[]) => listNames(members.map((member) => member.name), "and");

/** One line for the top of the crew page: who is working, and who is still to come. */
export function crewHeadline(crew: readonly CrewMember[]): string {
  const { lead, working, coming } = splitCrew(crew);
  const tex = lead?.name ?? "Tex";
  const onTheWay = coming.length > 0 ? `${names(coming)} ${coming.length === 1 ? "is" : "are"} on the way.` : "";
  if (working.length === 0) return `${tex} is on the job today. ${onTheWay}`.trim();
  return `${tex} leads and hands work to ${names(working)}. ${onTheWay}`.trim();
}

/** "soon" next to Crew in the navigation while no specialist works yet; nothing once one does. */
export function crewNavNote(crew: readonly CrewMember[] | undefined): string | undefined {
  if (!crew) return undefined;
  return splitCrew(crew).working.length === 0 ? "soon" : undefined;
}

export type CrewBrowser = NonNullable<CrewMember["browser"]>;

/** The real browser a crew member can drive (Scout's), if the backend lists one. */
export function crewBrowser(crew: readonly CrewMember[] | undefined): CrewBrowser | null {
  return crew?.find((member) => member.browser)?.browser ?? null;
}

/**
 * What to say about Scout's browser. Two things decide it, and they are not the same:
 * whether the browser is built yet, and whether this person's plan includes it.
 * `upgrade` is true when a better plan is all that stands in the way.
 */
export function describeBrowser(browser: CrewBrowser, planName: string, included: boolean): { text: string; upgrade: boolean } {
  if (!browser.available) {
    return {
      text: included
        ? `A real browser isn’t ready yet. It comes with your ${planName} plan when it is.`
        : `A real browser isn’t ready yet. It will need the ${planName} plan.`,
      upgrade: false,
    };
  }
  return included
    ? { text: `A real browser is part of your ${planName} plan, at 2 credits per minute.`, upgrade: false }
    : { text: `A real browser needs the ${planName} plan.`, upgrade: true };
}

// ---------------------------------------------------------------- progress lines

/** A specialist's id, as progress lines and activity entries carry it. */
export type SpecialistId = NonNullable<AgentProgress["crew"]>;

/** The lead's name, for a line that names nobody: it is the lead's own. */
const LEAD = "Tex";
/** "Scout: reading 4 pages": a line from a specialist starts with its name and a colon. */
const NAMED = /^([A-Za-z][A-Za-z0-9 ]{0,30}):\s*([\s\S]*)$/;

/**
 * Who a progress line is about and what it says, with the name taken off the front:
 * "Scout: reading 4 pages" → Scout, "reading 4 pages". The backend says which member it is
 * (`crew`); the name is the one the line itself uses.
 */
export function splitCrewLine(text: string, crew: SpecialistId | null | undefined): { who: CrewMember["id"]; name: string; text: string } {
  const line = text.trim();
  if (!crew) return { who: "tex", name: LEAD, text: line };
  const named = NAMED.exec(line);
  // Only take a name off the front when it is this member's.
  if (named && named[1].toLowerCase() === crew) return { who: crew, name: named[1], text: named[2] || "working" };
  return { who: crew, name: titleCase(crew), text: line };
}

/** One line of the chat's live progress: who is working and on what. */
export type ProgressLine = { who: CrewMember["id"]; name: string; text: string; at: string };

export function progressLine(progress: AgentProgress): ProgressLine {
  return { ...splitCrewLine(progress.text, progress.crew), at: progress.at };
}

/**
 * Adds a line to the turn's progress, keeping one line per member (its latest) in the order they
 * last spoke. Tex can have three specialists at work at once, so that is what there is room for.
 */
export function addProgress(lines: readonly ProgressLine[], next: ProgressLine, max = 4): ProgressLine[] {
  return [...lines.filter((line) => line.who !== next.who), next].slice(-max);
}
