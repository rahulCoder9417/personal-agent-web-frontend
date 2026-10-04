import type { ActivityEntry } from "@/lib/api/client";
import type { SpecialistId } from "@/lib/crew";
import { cn, formatCredits, formatTime } from "@/lib/format";
import { AutomationsIcon, LockIcon } from "../icons";
import { AgentFigure } from "../tex";
import { describeActivity } from "./group";

// The colour behind each specialist's face, as on the crew page.
const CREW_TINT: Record<SpecialistId, string> = { byte: "#F1ECFF", patch: "#FEF4E3", scout: "#E6F5F4" };

/**
 * Who did it, as a 30px mark: the face of Tex or of the specialist the entry belongs to, your
 * initials, or a neutral glyph for the system and our team.
 */
function ActorMark({ actor, crew, who, userInitials }: { actor: ActivityEntry["actor"]; crew: SpecialistId | null; who: string; userInitials: string }) {
  const base = "grid size-[30px] shrink-0 place-items-center rounded-full";
  if (crew) {
    return (
      <span title={who} className={base} style={{ background: CREW_TINT[crew] }}>
        <AgentFigure who={crew} mood="ready" glyph size={22} label="" />
      </span>
    );
  }
  if (actor === "agent") {
    return (
      <span title={who} className={cn(base, "bg-accent-soft")}>
        <AgentFigure who="tex" mood="ready" glyph size={22} label="" />
      </span>
    );
  }
  if (actor === "user") {
    return (
      <span title={who} aria-hidden className={cn(base, "bg-fg text-[12px] font-semibold text-white")}>
        {userInitials}
      </span>
    );
  }
  return (
    <span title={who} aria-hidden className={cn(base, "bg-surface-2 text-nav")}>
      {actor === "system" ? <AutomationsIcon size={15} /> : <LockIcon size={15} />}
    </span>
  );
}

/** One line of the audit log: when, who, what, and what it cost. */
export function ActivityRow({ entry, userInitials }: { entry: ActivityEntry; userInitials: string }) {
  const credits = entry.creditsCharged ?? 0;
  const line = describeActivity(entry);
  return (
    <li className="flex min-h-[54px] items-center gap-4 border-t border-line px-5 py-2">
      <time dateTime={entry.createdAt} className="w-[64px] shrink-0 text-[12px] text-muted">
        {formatTime(entry.createdAt)}
      </time>
      <ActorMark actor={entry.actor} crew={line.crew} who={line.who} userInitials={userInitials} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium" title={line.summary}>
          {line.summary}
        </span>
        <span className="truncate text-[12px] text-muted">
          {line.who} · {line.label}
        </span>
      </div>
      <span className={cn("w-[88px] shrink-0 text-right text-[12px]", credits > 0 ? "text-fg" : "text-muted")}>
        {credits > 0 ? formatCredits(credits) : "—"}
      </span>
    </li>
  );
}
