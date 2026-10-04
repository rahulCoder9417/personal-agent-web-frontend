// The crew, as the backend describes it (`GET /v1/crew`): Tex leads, and Byte, Patch and Scout are
// the specialists it hands work to. Nothing here names a member or says who is available by itself.

import type { CrewMember } from "./api/client";
import { listNames } from "./format";

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
