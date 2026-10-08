"use client";

import { chatStartedAtOf, useMessages, useStartNewChat } from "@/lib/api/hooks";
import { newChatError, webChatIsEmpty } from "@/lib/chat-thread";
import { useArmed } from "../confirm-button";
import { NewChatIcon } from "../icons";
import { toast } from "../toast";
import { Button } from "../ui";

/**
 * Starts a new web chat, after which Tex no longer sees what was said before in it. The messages
 * stay on screen above a "New chat" divider. An empty chat starts over at once; one with messages
 * asks once more first.
 */
export function NewChatButton() {
  const start = useStartNewChat();
  const [armed, setArmed] = useArmed(start.isPending);
  // The same thread the chat filters read, so this asks for nothing more.
  const thread = useMessages("all");
  const empty =
    thread.isSuccess &&
    webChatIsEmpty(
      thread.data.pages.flatMap((page) => page.items),
      chatStartedAtOf(thread.data),
      !thread.hasNextPage,
    );

  const startNow = () =>
    start.mutate(undefined, {
      onSettled: () => setArmed(false),
      onError: (error) => toast({ title: "Couldn’t start a new chat", body: newChatError(error) }),
    });

  if (!armed) {
    return (
      <Button size="sm" pending={start.isPending} onClick={() => (empty ? startNow() : setArmed(true))}>
        {!start.isPending && <NewChatIcon size={15} />}
        New chat
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[12.5px] text-muted max-md:hidden">Tex starts afresh; memories stay.</span>
      <Button size="sm" variant="primary" autoFocus pending={start.isPending} onClick={startNow}>
        Start a new chat
      </Button>
      {!start.isPending && (
        <button type="button" onClick={() => setArmed(false)} className="h-7 rounded px-1 text-[12.5px] text-muted hover:text-fg">
          Cancel
        </button>
      )}
    </span>
  );
}
