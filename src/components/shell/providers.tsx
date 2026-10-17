"use client";

import { useClerk } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import type { AuthMode } from "@/lib/auth-mode";
import { setRenewer } from "@/lib/fresh-session";
import { Toaster } from "../toast";

export type { AuthMode } from "@/lib/auth-mode";

type AppConfig = {
  mode: AuthMode;
  /** The proxy is serving the built-in demo account (no backend, no sign-in). */
  demo: boolean;
  /** Clerk is in the tree, so its hooks and components may be used. */
  clerk: boolean;
};

const AppConfigContext = createContext<AppConfig>({ mode: "clerk", demo: false, clerk: true });

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext);
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Retrying a 4xx never helps; a dropped connection or a 5xx might.
        retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
      },
    },
  });
}

/**
 * Lets every call through the proxy renew the sign-in token first when it ran out (`freshSession`):
 * Clerk's script gives the token it has while it is good, a new one (written to the cookie)
 * otherwise. Before the script has loaded there is nothing to ask, and the cookie is the page's own.
 */
function RenewSessionFirst() {
  const clerk = useClerk();
  useEffect(() => {
    setRenewer(async () => {
      if (clerk.loaded && clerk.session) await clerk.session.getToken();
    });
    return () => setRenewer(null);
  }, [clerk]);
  return null;
}

export function Providers({ mode, children }: { mode: AuthMode; children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  const [config] = useState<AppConfig>(() => ({ mode, demo: mode === "demo", clerk: mode === "clerk" }));
  return (
    <AppConfigContext.Provider value={config}>
      <QueryClientProvider client={client}>
        {/* Only where Clerk is in the tree: its hooks need its provider. */}
        {config.clerk && <RenewSessionFirst />}
        {children}
        {/* Once, for every page: the signed-in screens, setup and sign-in all raise toasts. */}
        <Toaster />
      </QueryClientProvider>
    </AppConfigContext.Provider>
  );
}
