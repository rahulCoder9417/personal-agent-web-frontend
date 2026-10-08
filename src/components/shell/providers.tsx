"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import type { AuthMode } from "@/lib/auth-mode";

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

export function Providers({ mode, children }: { mode: AuthMode; children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  const [config] = useState<AppConfig>(() => ({ mode, demo: mode === "demo", clerk: mode === "clerk" }));
  return (
    <AppConfigContext.Provider value={config}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AppConfigContext.Provider>
  );
}
