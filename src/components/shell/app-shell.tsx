"use client";

import type { ReactNode } from "react";
import { useEventStream } from "@/lib/api/stream";
import { CheckoutWatcher } from "../checkout-watcher";
import { MobileTabBar, MobileTopBar } from "./mobile-nav";
import { Sidebar } from "./sidebar";

/** Keeps the live connection open, so every screen updates as things happen. */
function LiveSync() {
  useEventStream();
  return null;
}

/**
 * The signed-in app. On a wide screen: a sidebar on warm paper and the current screen on a white
 * sheet beside it. On a phone: a top bar, the screen edge to edge, and tabs along the bottom.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-chrome md:flex-row">
      <LiveSync />
      <CheckoutWatcher />
      <MobileTopBar />
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface max-md:border-t max-md:border-line md:my-2 md:mr-2 md:rounded-[14px] md:shadow-[var(--shadow-raised)]">
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}
