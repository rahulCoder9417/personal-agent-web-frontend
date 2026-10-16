"use client";

import type { CrewMember } from "@/lib/api/client";
import { useCrew } from "@/lib/api/hooks";
import { comingSoon, crewWash } from "@/lib/crew";
import { cn, listNames } from "@/lib/format";
import { AgentFigure } from "../tex";
import { Pill } from "../ui";

/** The answer in Help's crew section that says how to ask for each member. */
export const CREW_TOPIC: Record<CrewMember["id"], string> = { tex: "crew-who", byte: "crew-byte", patch: "crew-patch", scout: "crew-scout" };

/**
 * Who is on the crew here, as the backend lists it (`GET /v1/crew`): each face on its own colour,
 * its name and role, and "Coming soon" on one that isn't switched on here yet. Each leads to the
 * answer that says how to ask for it. Drawn at the top of Help's crew section; until the list has
 * come (or if it can't), the answers stand on their own.
 */
export function CrewLineup() {
  const crew = useCrew();
  if (!crew.data) return null;
  const coming = comingSoon(crew.data);

  return (
    <div className="flex flex-col gap-2.5">
      <ul aria-label="Your crew" className="flex flex-wrap gap-2">
        {crew.data.map((member) => (
          <li key={member.id}>
            <a
              href={`#${CREW_TOPIC[member.id]}`}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-1.5 text-[13px] transition-colors hover:bg-surface-2"
            >
              <span className="grid size-[26px] place-items-center rounded-full" style={crewWash(member.id, 16)}>
                <AgentFigure who={member.id} mood={member.available ? "ready" : "asleep"} glyph size={19} label="" />
              </span>
              <span className={cn("font-semibold", !member.available && "text-muted")}>{member.name}</span>
              <span className="text-muted">{member.role}</span>
              {!member.available && <Pill className="h-[18px] px-1.5 text-[11px]">Coming soon</Pill>}
            </a>
          </li>
        ))}
      </ul>
      {coming.length > 0 && (
        <p className="text-[13px] text-muted">
          {listNames(coming.map((member) => member.name), "and")} {coming.length === 1 ? "isn’t" : "aren’t"} switched on here yet.
        </p>
      )}
    </div>
  );
}
