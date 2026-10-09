"use client";

import { Component, lazy, Suspense, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { hasMarkdown } from "@/lib/markdown";

// The renderer and its libraries are a chunk of their own, fetched the first time a reply has
// something for Markdown to draw. A chat of plain replies never asks for it.
const Markdown = lazy(() => import("./markdown"));

/**
 * Shows the reply as typed if the renderer can't be loaded (the connection dropped, or the app was
 * deployed again since the page was opened) or can't draw it. Without this, one reply would take
 * the whole screen down.
 */
class PlainIfItFails extends Component<{ plain: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.plain : this.props.children;
  }
}

/**
 * The bubble for something Tex wrote. `children` go above the text (a message's files).
 *
 * A reply with nothing for Markdown to draw is shown as typed, line breaks and spaces kept, as
 * every reply was before replies were drawn as Markdown. One with Markdown is drawn from it; until
 * the renderer has arrived, it too reads as typed.
 *
 * A bubble is 560px wide at most, a comfortable line to read. A reply with a table or a block of
 * code may take the thread's whole width instead, so that less of it has to scroll sideways.
 */
export function AgentBubble({ text, children }: { text: string; children?: ReactNode }) {
  const drawn = hasMarkdown(text);
  const plain = <div className="whitespace-pre-wrap">{text}</div>;
  return (
    <div
      className={cn(
        "max-w-[min(560px,100%)] rounded-[18px] rounded-bl-[6px] bg-surface-2 px-4 py-2.5 text-[14.5px] leading-[1.45] break-words",
        drawn ? "has-[pre]:max-w-full has-[table]:max-w-full" : "whitespace-pre-wrap",
      )}
    >
      {children}
      {drawn ? (
        <PlainIfItFails plain={plain}>
          <Suspense fallback={plain}>
            <Markdown text={text} />
          </Suspense>
        </PlainIfItFails>
      ) : (
        text
      )}
    </div>
  );
}
