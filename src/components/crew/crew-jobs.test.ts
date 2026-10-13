import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The crew jobs section of the Crew screen, drawn from the demo account's data, and hidden on a
// server that has no crew jobs yet.

vi.mock("next/navigation", () => ({
  usePathname: () => "/crew",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ApiError, type CrewMember } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { handleDemoRequest, resetDemoStore } from "@/lib/demo";
import { CrewJobsSection } from "./crew-jobs";

async function demo<T>(path: string): Promise<T> {
  const response = await handleDemoRequest(new Request(`http://localhost/api/v1/${path}`), path.split("/"));
  return (await response.json()) as T;
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

async function draw(setup: (client: QueryClient) => unknown, crew?: CrewMember[]) {
  // A failed query stays failed when drawn (no retry on mount), as it is after its own retries.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false } } });
  client.setQueryData(qk.channels, await demo("channels"));
  await setup(client);
  const members = crew ?? (await demo<{ items: CrewMember[] }>("crew")).items;
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(CrewJobsSection, { crew: members })));
}

beforeEach(() => resetDemoStore(new Date("2026-10-01T14:30:00")));

describe("crew jobs on the Crew screen", () => {
  it("offers a review and a job, and lists the jobs with their state", async () => {
    const html = await draw(async (client) => client.setQueryData(qk.crewJobs, await demo("crew-jobs")));
    const words = text(html);
    expect(words).toContain("Give the crew a job");
    expect(words).toContain("Give Patch a review");
    expect(words).toContain("Give Byte a job");
    expect(words).toContain("Review northwind/website#131 Done");
    expect(words).toContain("Patch · PR #131 · Report to web chat · on the pull request");
    expect(words).toContain("Failed");
    expect(words).toContain("The agent couldn't finish the job.");
    expect(html).toMatch(/aria-expanded="false"[^>]*>Report</);
  });

  it("offers only the members that work here", async () => {
    const crew = (await demo<{ items: CrewMember[] }>("crew")).items.map((member) => (member.id === "byte" ? { ...member, available: false } : member));
    const words = text(await draw(async (client) => client.setQueryData(qk.crewJobs, await demo("crew-jobs")), crew));
    expect(words).toContain("Give Patch a review");
    expect(words).not.toContain("Give Byte a job");
  });

  it("is not there at all when the server has no crew jobs (404)", async () => {
    const html = await draw((client) => {
      client
        .getQueryCache()
        .build(client, { queryKey: qk.crewJobs })
        .setState({ status: "error", error: new ApiError(404, "not_found", "Not found"), fetchStatus: "idle" });
    });
    expect(html).toBe("");
  });

  it("says so when the list didn't load for another reason", async () => {
    const html = await draw((client) => {
      client
        .getQueryCache()
        .build(client, { queryKey: qk.crewJobs })
        .setState({ status: "error", error: new ApiError(503, "unavailable", "Down for a moment"), fetchStatus: "idle" });
    });
    expect(text(html)).toContain("The jobs didn’t load. Down for a moment");
  });
});
