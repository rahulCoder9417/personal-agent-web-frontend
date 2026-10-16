// The Approvals screen's tabs, one per status, and what each says when it is empty.

import type { ApprovalStatus } from "./api/client";
import type { Mood } from "@/components/tex";

export type ApprovalTab = ApprovalStatus;

/**
 * In order. "Replaced" holds the requests Tex asked again with corrected details: nothing was done
 * with them, and the newer request is in Pending or wherever its answer took it.
 */
export const APPROVAL_TABS: { value: ApprovalTab; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Denied" },
  { value: "expired", label: "Expired" },
  { value: "replaced", label: "Replaced" },
];

export const APPROVAL_EMPTY: Record<ApprovalTab, { mood: Mood; title: string; body: string }> = {
  pending: {
    mood: "done",
    title: "All caught up",
    body: "Nothing is waiting on you. Tex will ask here and in your chat when something needs an OK.",
  },
  approved: {
    mood: "ready",
    title: "Nothing approved yet",
    body: "Actions you approve are kept here with what happened next.",
  },
  rejected: {
    mood: "ready",
    title: "Nothing rejected",
    body: "Actions you reject are kept here so you can see what Tex didn’t do.",
  },
  expired: {
    mood: "asleep",
    title: "Nothing expired",
    body: "An approval expires if you don’t answer in time. Tex does nothing when that happens.",
  },
  replaced: {
    mood: "ready",
    title: "Nothing replaced",
    body: "When an app can’t take a request as you approved it, Tex asks again with corrected details. The earlier request is kept here. Nothing was done with it.",
  },
};
