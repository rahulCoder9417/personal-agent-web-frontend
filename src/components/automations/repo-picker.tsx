"use client";

// The repo to turn review on for: a search box over the GitHub repos the account can see, the most
// recently pushed first. A repo that is not in the list can still be typed as owner/repo or pasted
// as a link. Drawn from what it is given (the list, the text, the choice), so it can be tested.

import Link from "next/link";
import { useMemo } from "react";
import type { GithubRepo } from "@/lib/api/client";
import { cn, formatAgo } from "@/lib/format";
import { INTEGRATIONS_APPS_PATH } from "@/lib/integrations";
import { repoChoices, repoName, typedRepo, type RepoRef } from "@/lib/pr-review";
import { T3 } from "./parts";
import { inputClass } from "../ui";

export type PickerStatus = "loading" | "ready" | "error" | "connect";

/** "pushed 3h ago", "pushed yesterday", "pushed 12 Sep". */
export function pushedText(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const text = formatAgo(iso, now);
  return `pushed ${text === "Yesterday" ? "yesterday" : text}`;
}

const sameRepo = (a: RepoRef | null, b: RepoRef) => a !== null && repoName(a).toLowerCase() === repoName(b).toLowerCase();
const asRef = (repo: GithubRepo): RepoRef => ({ owner: repo.owner, repo: repo.name });
const ROW = "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] transition-colors";

export function RepoPicker({
  id,
  status,
  repos,
  reviewed,
  query,
  onQuery,
  chosen,
  onChoose,
  disabled,
  invalid,
  now,
}: {
  id: string;
  status: PickerStatus;
  repos: readonly GithubRepo[];
  /** The repos review is already on for. */
  reviewed: readonly RepoRef[];
  query: string;
  onQuery: (text: string) => void;
  chosen: RepoRef | null;
  onChoose: (repo: RepoRef) => void;
  disabled?: boolean;
  invalid?: boolean;
  now?: Date;
}) {
  const choices = useMemo(() => repoChoices(repos, query, reviewed), [repos, query, reviewed]);
  const typed = typedRepo(repos, query);
  const typedOn = typed ? reviewed.some((ref) => repoName(ref).toLowerCase() === repoName(typed).toLowerCase()) : false;

  return (
    <div className="flex flex-col gap-2">
      <input
        id={`${id}-repo`}
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search your repos, or type owner/repo"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(inputClass, "h-10 font-mono text-[12px]")}
      />
      {status === "error" && <p className={cn(T3, "text-muted")}>Couldn’t load your repos right now — type owner/repo instead.</p>}
      {status === "connect" && (
        <p className={cn(T3, "text-muted")}>
          GitHub isn’t connected.{" "}
          <Link href={INTEGRATIONS_APPS_PATH} className="font-medium text-accent-dark hover:text-fg">
            Connect GitHub
          </Link>
        </p>
      )}
      {(status === "loading" || status === "ready" || typed) && (
        <ul aria-label="Your GitHub repos" className="flex max-h-[280px] flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl border border-fg/10 bg-surface p-1">
          {status === "loading" &&
            [0, 1, 2].map((row) => (
              <li key={row} aria-hidden className="flex min-h-11 items-center gap-2 px-3">
                <span className="h-3 w-3/5 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          {typed && (
            <li>
              <button
                type="button"
                disabled={disabled || typedOn}
                aria-pressed={sameRepo(chosen, typed)}
                onClick={() => onChoose(typed)}
                className={cn(ROW, "min-w-0 font-mono", sameRepo(chosen, typed) ? "bg-accent-soft" : "hover:bg-surface-2", typedOn && "cursor-not-allowed opacity-60")}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-sans text-muted">Use </span>
                  {repoName(typed)}
                </span>
                {typedOn && <span className={cn(T3, "shrink-0 font-sans font-medium text-success")}>Review on</span>}
              </button>
            </li>
          )}
          {status === "ready" && choices.length === 0 && !typed && (
            <li className={cn(T3, "px-3 py-3 text-muted")}>{repos.length === 0 ? "No repos found on this GitHub account." : "No repo matches. Type owner/repo to use one that isn’t listed."}</li>
          )}
          {status === "ready" &&
            choices.map(({ repo, reviewed: on }) => {
              const picked = sameRepo(chosen, asRef(repo));
              return (
                <li key={repo.fullName}>
                  <button
                    type="button"
                    disabled={disabled || on}
                    aria-pressed={picked}
                    onClick={() => onChoose(asRef(repo))}
                    className={cn(ROW, picked ? "bg-accent-soft" : "hover:bg-surface-2", on && "cursor-not-allowed opacity-60")}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono">
                      <span className="text-muted">{repo.owner}/</span>
                      {repo.name}
                    </span>
                    {repo.private && <span className={cn(T3, "shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-sans font-medium text-fg-2")}>Private</span>}
                    {on ? (
                      <span className={cn(T3, "shrink-0 font-sans font-medium text-success")}>Review on</span>
                    ) : (
                      repo.pushedAt && <span className={cn(T3, "hidden shrink-0 font-sans text-muted min-[420px]:inline")}>{pushedText(repo.pushedAt, now)}</span>
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
