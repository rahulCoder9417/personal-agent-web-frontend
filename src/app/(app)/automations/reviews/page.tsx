"use client";

import Link from "next/link";
import { AddReviewRepoForm, GitHubNotice, ReviewRepoRow } from "@/components/automations/review-repos";
import { PageBody } from "@/components/page";
import { AgentFigure } from "@/components/tex";
import { Card, EmptyState, ErrorState, Meta, SectionLabel, SkeletonRows } from "@/components/ui";
import { useCrew, usePrReviews } from "@/lib/api/hooks";

const NEEDS: { title: string; body: string; link?: { href: string; label: string } }[] = [
  {
    title: "GitHub connected",
    body: "with an account that has admin access to the repo. Patch needs that to be told when a pull request changes.",
    link: { href: "/apps", label: "Apps" },
  },
  {
    title: "Credits",
    body: "A review costs what any job costs, plus 1 credit for the review Patch posts, like any app action that changes something.",
  },
  { title: "Room in your plan", body: "Each repo with review on counts as one automation." },
];

/** Pull-request review: which GitHub repos Patch reviews, turned on and off per repo. */
export default function PrReviewsPage() {
  const reviews = usePrReviews();
  const patch = useCrew().data?.find((member) => member.id === "patch");
  const list = reviews.data ?? [];
  const on = list.filter((review) => review.enabled).length;

  return (
    <PageBody>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-[84px] w-[72px] shrink-0 place-items-center rounded-xl bg-[#FEF4E3]">
              <AgentFigure who="patch" mood="ready" size={74} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Patch reviews your pull requests</h2>
              <p className="max-w-xl text-[13.5px] text-muted">
                When a pull request opens or gets new commits, Patch reviews it, comments on the pull request and sends a short verdict to your Automations chat. It
                never merges.
              </p>
            </div>
          </div>

          <GitHubNotice />

          {patch && !patch.available && (
            <p role="status" className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[13px] text-nav">
              Patch isn’t on the crew here yet, so reviews may not run until it is.{" "}
              <Link href="/crew" className="font-medium text-accent hover:text-accent-dark">
                See the crew
              </Link>
            </p>
          )}

          <div className="flex items-center justify-between">
            <SectionLabel>Your repos</SectionLabel>
            {list.length > 0 && (
              <Meta className="text-[12px]">
                {on} of {list.length} on
              </Meta>
            )}
          </div>

          {reviews.isPending ? (
            <Card>
              <SkeletonRows rows={2} />
            </Card>
          ) : reviews.isError ? (
            <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState title="No repos yet">Turn review on for a repo with the form, and Patch reviews its next pull request.</EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((review) => (
                <ReviewRepoRow key={review.id} review={review} />
              ))}
            </div>
          )}

          <Meta className="text-[12px]">
            Pausing a repo stops its reviews and takes back the OK to comment there. Turning it off removes it.
          </Meta>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <AddReviewRepoForm />
          <Card role="group" aria-label="What review needs" className="flex flex-col gap-2.5 bg-chrome p-5 text-[13px] text-fg-2">
            <SectionLabel as="h3">What it needs</SectionLabel>
            <ul className="flex flex-col gap-2">
              {NEEDS.map((need) => (
                <li key={need.title} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
                  <span>
                    <strong className="font-semibold text-fg">{need.title}</strong>
                    {need.title === "GitHub connected" ? ", " : ". "}
                    {need.body}
                    {need.link && (
                      <>
                        {" "}
                        <Link href={need.link.href} className="font-medium text-accent hover:text-accent-dark">
                          {need.link.label}
                        </Link>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}
