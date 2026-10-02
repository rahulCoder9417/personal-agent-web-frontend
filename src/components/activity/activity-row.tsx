import type { ActivityEntry } from "@/lib/api/client";
import { cn, formatCredits, formatTime, humanizeEvent } from "@/lib/format";
import { AutomationsIcon, LockIcon } from "../icons";
import { AgentFigure } from "../tex";

const ACTOR_NAME: Record<ActivityEntry["actor"], string> = {
  agent: "Tex",
  user: "You",
  system: "Automation",
  admin: "Textcrew team",
};

/** Who did it, as a 30px mark: Tex's face, your initials, or a neutral glyph for the system and our team. */
function ActorMark({ actor, userInitials }: { actor: ActivityEntry["actor"]; userInitials: string }) {
  const base = "grid size-[30px] shrink-0 place-items-center rounded-full";
  if (actor === "agent") {
    return (
      <span title="Tex" className={cn(base, "bg-accent-soft")}>
        <AgentFigure who="tex" mood="ready" glyph size={22} label="" />
      </span>
    );
  }
  if (actor === "user") {
    return (
      <span title="You" aria-hidden className={cn(base, "bg-fg text-[12px] font-semibold text-white")}>
        {userInitials}
      </span>
    );
  }
  return (
    <span title={ACTOR_NAME[actor]} aria-hidden className={cn(base, "bg-surface-2 text-nav")}>
      {actor === "system" ? <AutomationsIcon size={15} /> : <LockIcon size={15} />}
    </span>
  );
}

/** One line of the audit log: when, who, what, and what it cost. */
export function ActivityRow({ entry, userInitials }: { entry: ActivityEntry; userInitials: string }) {
  const credits = entry.creditsCharged ?? 0;
  return (
    <li className="flex min-h-[54px] items-center gap-4 border-t border-line px-5 py-2">
      <time dateTime={entry.createdAt} className="w-[64px] shrink-0 text-[12px] text-muted">
        {formatTime(entry.createdAt)}
      </time>
      <ActorMark actor={entry.actor} userInitials={userInitials} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium" title={entry.summary}>
          {entry.summary}
        </span>
        <span className="truncate text-[12px] text-muted">
          {ACTOR_NAME[entry.actor]} · {humanizeEvent(entry.action)}
        </span>
      </div>
      <span className={cn("w-[88px] shrink-0 text-right text-[12px]", credits > 0 ? "text-fg" : "text-muted")}>
        {credits > 0 ? formatCredits(credits) : "—"}
      </span>
    </li>
  );
}
