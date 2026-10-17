import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Message } from "./client";
import { prefetchThread, qk } from "./hooks";

type Thread = InfiniteData<{ items: Message[]; nextCursor: string | null }, string | undefined>;

describe("asking for the remembered chat's messages beside the list", () => {
  it("asks nothing for a thread already on hand (opened earlier in this visit)", async () => {
    const qc = new QueryClient();
    const known: Thread = { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] };
    qc.setQueryData<Thread>(qk.thread("cnv_1"), known);
    await prefetchThread(qc, "cnv_1");
    expect(qc.getQueryData(qk.thread("cnv_1"))).toBe(known);
    expect(qc.getQueryCache().find({ queryKey: qk.thread("cnv_1") })?.state.fetchStatus).toBe("idle");
  });
});
