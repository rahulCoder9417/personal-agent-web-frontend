import { type InfiniteData, MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Message } from "./client";
import { isLocalMessage, localMessage, qk, type SendInput, sendMessageOptions, withMessage } from "./hooks";
import { applyStreamEvent } from "./stream";

// The person's message shows the moment it is sent ("sending"), and the saved one takes its place,
// whichever comes first: the API's answer or the live stream. Never both, and gone if the send fails.

type Thread = InfiniteData<{ items: Message[]; nextCursor: string | null }, string | undefined>;

/** The send's own steps (`onMutate`, then the request) run a moment after `mutate`. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const at = (hhmm: string) => `2026-10-16T${hhmm}:00.000Z`;
const ID = "4b0e8f0a-2a43-4c1f-9d55-0e7f1c1b9a01";

function saved(rest: Partial<Message> = {}): Message {
  return {
    id: "msg_saved",
    conversationId: "cnv_open",
    channel: "web",
    direction: "in",
    text: "check my email",
    status: "queued",
    approvalId: null,
    clientMessageId: ID,
    createdAt: at("10:00"),
    ...rest,
  };
}

/** A query cache with the open conversation's thread in it, and a send whose answer the test gives. */
function chat() {
  const qc = new QueryClient();
  qc.setQueryData<Thread>(qk.thread("cnv_open"), {
    pages: [{ items: [saved({ id: "msg_old", text: "earlier", clientMessageId: undefined, status: "delivered", createdAt: at("09:00") })], nextCursor: null }],
    pageParams: [undefined],
  });
  let answer!: { resolve: (message: Message) => void; reject: (error: Error) => void };
  const send = new MutationObserver(
    qc,
    sendMessageOptions(qc, () => new Promise<Message>((resolve, reject) => (answer = { resolve, reject }))),
  );
  const input: SendInput = { text: "check my email", clientMessageId: ID, conversationId: "cnv_open" };
  const thread = () => (qc.getQueryData<Thread>(qk.thread("cnv_open"))?.pages ?? []).flatMap((page) => page.items);
  const ids = () => thread().map((message) => message.id);
  return { qc, send, input, thread, ids, answer: () => answer };
}

describe("sending a message", () => {
  it("shows it at once as sending, then the saved message from the API's answer takes its place", async () => {
    const c = chat();
    const done = c.send.mutate(c.input);
    expect(c.ids()).toEqual([`local:${ID}`, "msg_old"]);
    expect(c.thread()[0]).toMatchObject({ direction: "in", status: "queued", text: "check my email", clientMessageId: ID });
    await tick();
    c.answer().resolve(saved());
    await done;
    expect(c.ids()).toEqual(["msg_saved", "msg_old"]);
  });

  it("puts the saved message in its place when the live stream brings it first, and the API's answer adds nothing", async () => {
    const c = chat();
    const done = c.send.mutate(c.input);
    applyStreamEvent(c.qc, { type: "message.created", data: saved() } as never);
    expect(c.ids()).toEqual(["msg_saved", "msg_old"]);
    await tick();
    c.answer().resolve(saved({ status: "processing" }));
    await done;
    expect(c.ids()).toEqual(["msg_saved", "msg_old"]);
    expect(c.thread()[0].status).toBe("processing");
  });

  it("takes the sending bubble away when the send fails", async () => {
    const c = chat();
    const done = c.send.mutate(c.input).catch(() => "failed");
    expect(c.ids()).toHaveLength(2);
    await tick();
    c.answer().reject(new Error("You seem to be offline."));
    expect(await done).toBe("failed");
    expect(c.ids()).toEqual(["msg_old"]);
  });

  it("matches a saved message without its clientMessageId (an older backend) by its words", () => {
    const local = localMessage({ clientMessageId: ID, conversationId: "cnv_open", text: "check my email" }, new Date(at("10:00")));
    const thread: Thread = { pages: [{ items: [local], nextCursor: null }], pageParams: [undefined] };
    const plain = saved({ clientMessageId: undefined });
    expect(withMessage(thread, plain).pages[0].items.map((m) => m.id)).toEqual(["msg_saved"]);
    // Tex's answer is never taken for the person's message, and other words are another message.
    expect(withMessage(thread, saved({ id: "msg_tex", direction: "out", clientMessageId: undefined })).pages[0].items).toHaveLength(2);
    expect(withMessage(thread, saved({ id: "msg_x", text: "other words", clientMessageId: undefined })).pages[0].items).toHaveLength(2);
    // A different clientMessageId is a different message.
    expect(withMessage(thread, saved({ id: "msg_y", clientMessageId: "another" })).pages[0].items).toHaveLength(2);
  });

  it("keeps two sends on their way apart", async () => {
    const c = chat();
    const second = new MutationObserver(c.qc, sendMessageOptions(c.qc, async () => saved({ id: "msg_2", text: "and my calendar", clientMessageId: "id-2" })));
    void c.send.mutate(c.input);
    await second.mutate({ text: "and my calendar", clientMessageId: "id-2", conversationId: "cnv_open" });
    expect(c.ids()).toEqual(["msg_2", `local:${ID}`, "msg_old"]);
    expect(isLocalMessage({ id: c.ids()[1] })).toBe(true);
  });

  it("shows nothing before the API answers when no conversation is open yet, then the message with its new conversation", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.conversations, { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });
    const send = new MutationObserver(qc, sendMessageOptions(qc, async () => saved({ conversationId: "cnv_new" })));
    const done = send.mutate({ text: "check my email", clientMessageId: ID });
    expect(qc.getQueryCache().findAll({ queryKey: ["messages"] })).toHaveLength(0);
    await done;
    expect(qc.getQueryData<Thread>(qk.thread("cnv_new"))?.pages[0].items.map((m) => m.id)).toEqual(["msg_saved"]);
  });
});
