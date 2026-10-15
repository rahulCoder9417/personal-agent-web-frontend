"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEventStream } from "@/lib/api/stream";
import { BrowserTimezone } from "../browser-timezone";
import { CheckoutWatcher } from "../checkout-watcher";
import { WelcomeGate } from "../onboarding/welcome-gate";
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
 * On the chat, someone who hasn't finished or skipped the welcome flow is sent there first, and
 * none of this is drawn before it (`WelcomeGate`).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const home = usePathname() === "/";
  return (
    <WelcomeGate home={home}>
      <div className="flex h-dvh flex-col overflow-hidden bg-chrome md:flex-row">
        <LiveSync />
        <CheckoutWatcher />
        <BrowserTimezone />
        <MobileTopBar />
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface max-md:border-t max-md:border-line md:my-2 md:mr-2 md:rounded-[14px] md:shadow-[var(--shadow-raised)]">
          {children}
        </main>
        <MobileTabBar />
      </div>
    </WelcomeGate>
  );
}
