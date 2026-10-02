import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/shell/providers";
import { authMode } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Textcrew", template: "%s · Textcrew" },
  description: "Got a lot of work? Just text your crew.",
  robots: { index: false, follow: false },
  // The app is designed light-only; tell the Dark Reader extension not to repaint it.
  other: { "darkreader-lock": "true" },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f2",
  colorScheme: "only light",
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
  return mode === "clerk" ? <ClerkProvider signInUrl="/sign-in">{page}</ClerkProvider> : page;
}
