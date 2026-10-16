// The crew, as the backend describes it (`GET /v1/crew`): Tex leads, and Byte, Patch and Scout are
// the specialists it hands work to. Who they are (name, role, description) and who is available
// comes from the backend. What is written here is what the backend doesn't say: each member's
// colour and a request to try. There is no screen of its own for the crew: it is explained in Help
// (`help-content.ts`, the "crew" section), and Byte and Patch are asked for in the chat.

import type { CSSProperties } from "react";
import type { AgentProgress, CrewMember } from "./api/client";
import { titleCase } from "./format";

/**
 * Something to ask Tex that each member would end up doing. Byte and Patch have no form of their
 * own: a code change or a review is asked for in the chat, in plain words, with the repo named.
 */
export const CREW_EXAMPLES: Record<CrewMember["id"], string> = {
  tex: "Summarise my unread email and tell me what needs a reply today.",
  byte: "Fix the typo in the README on my repo acme/website.",
  patch: "Review pull request 42 in acme/website.",
  scout: "Research what other scheduling tools charge, with links.",
};

/** Each member's own colour, from the design tokens (the accent for Tex). */
export const CREW_COLOUR: Record<CrewMember["id"], string> = { tex: "var(--accent)", byte: "var(--byte)", patch: "var(--patch)", scout: "var(--scout)" };

/** A member's colour as a quiet wash over the surface, whatever the surface's own colour is. */
export const crewWash = (id: CrewMember["id"], strength = 12): CSSProperties => ({
  background: `color-mix(in srgb, ${CREW_COLOUR[id]} ${strength}%, var(--surface))`,
});

/** The specialists that aren't switched on here yet (`available: false`), in the backend's order. */
export function comingSoon(crew: readonly CrewMember[]): CrewMember[] {
  return crew.filter((member) => member.kind === "specialist" && !member.available);
}

export type CrewBrowser = NonNullable<CrewMember["browser"]>;

/** The real browser a crew member can drive (Scout's), if the backend lists one. */
export function crewBrowser(crew: readonly CrewMember[] | undefined): CrewBrowser | null {
  return crew?.find((member) => member.browser)?.browser ?? null;
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
