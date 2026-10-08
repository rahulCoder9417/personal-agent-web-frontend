import type { NextConfig } from "next";
import { decideAuthMode } from "./src/lib/auth-mode";

const nextConfig: NextConfig = {
  // The dev badge sits bottom-left by default, on top of the sidebar's account row.
  devIndicators: { position: "bottom-right" },
  // Sign-in or demo is decided once, when the app is built, and written into the code: the pages
  // don't read the environment per request, so they can be prerendered and served from the CDN.
  // The proxy still checks the session on every request. See builtAuthMode() in src/lib/auth-mode.ts.
  env: { NEXT_PUBLIC_TEXTCREW_AUTH_MODE: decideAuthMode(process.env) },
};

export default nextConfig;
