"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useApps } from "@/lib/api/hooks";
import { titleCase } from "@/lib/format";
import { toast } from "../toast";

/**
 * After a provider's sign-in screen, the backend sends the browser to /apps?connected=<slug>.
 * Confirm it, look the catalog up again and tidy the address.
 */
export function ConnectedNotice() {
  const router = useRouter();
  const slug = useSearchParams().get("connected");
  const { data: apps, refetch } = useApps();

  useEffect(() => {
    if (!slug) return;
    void refetch();
    toast({ title: `${apps?.find((app) => app.slug === slug)?.name ?? titleCase(slug)} connected`, body: "Tex can use it from now on." });
    router.replace("/apps");
    // Only when the address carries a new slug; `apps` is read for its name if already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return null;
}
