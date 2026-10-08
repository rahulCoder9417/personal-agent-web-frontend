import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/shell/providers";
import { APP_BACKGROUND, APP_DESCRIPTION, APP_NAME } from "@/lib/app-meta";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth-flow";
import { authMode } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  // With src/app/manifest.ts and apple-icon.png, this is what makes "Add to Home Screen" open
  // the app in its own window on an iPhone, under its own name.
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  robots: { index: false, follow: false },
  // The app is designed light-only; tell the Dark Reader extension not to repaint it.
  other: { "darkreader-lock": "true" },
};

export const viewport: Viewport = {
  themeColor: APP_BACKGROUND,
  colorScheme: "only light",
  // Lets the page reach the screen's edges on a phone; the safe-area insets keep it clear of
  // the notch (globals.css) and the home indicator (the tab bar).
  viewportFit: "cover",
};

// The auth mode comes from the server's environment at request time, not from when the app is built.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  const mode = authMode();
  const page = (
    // suppressHydrationWarning: browser extensions add attributes to <html> before React loads.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">
        <Providers mode={mode}>{children}</Providers>
      </body>
    </html>
  );
  // Only Clerk mode has something to sign in to; otherwise the provider stays out of the tree.
  // Clerk is the sign-in service only: the pages at these two addresses are this app's own forms.
  return mode === "clerk" ? (
    <ClerkProvider signInUrl={SIGN_IN_PATH} signUpUrl={SIGN_UP_PATH}>
      {page}
    </ClerkProvider>
  ) : (
    page
  );
}
