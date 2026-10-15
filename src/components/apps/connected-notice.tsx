"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useApps } from "@/lib/api/hooks";
import { titleCase } from "@/lib/format";
import { toast, toastError } from "../toast";
import { connectOutcome } from "./apps-logic";

/**
 * After a provider's sign-in screen, the browser comes back to /integrations/apps?connected=<slug>
 * (or the older /apps?connected=<slug>, which leads there), with Composio's `status` added. Say how
 * it went, look the catalog up again and tidy the address.
 */
export function ConnectedNotice() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const outcome = connectOutcome(params);
  const { data: apps, refetch } = useApps();
  const key = outcome ? `${outcome.slug}:${outcome.ok}` : null;

  useEffect(() => {
    if (!outcome) return;
    void refetch();
    const name = apps?.find((app) => app.slug === outcome.slug)?.name ?? titleCase(outcome.slug);
    if (outcome.ok) toast({ title: `${name} connected`, body: "Tex can use it from now on." });
    else toastError(`${name} didn’t connect`, "Nothing was changed. Try again when you’re ready.");
    router.replace(pathname);
    // Only when the address carries a new outcome; `apps` is read for its name if already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
