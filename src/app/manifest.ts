import type { MetadataRoute } from "next";
import { APP_BACKGROUND, APP_DESCRIPTION, APP_NAME } from "@/lib/app-meta";

const icon = (file: string, size: number, purpose: "any" | "maskable") => ({
  src: `/icons/${file}`,
  sizes: `${size}x${size}`,
  type: "image/png",
  purpose,
});

/**
 * Served at /manifest.webmanifest and linked from every page. It is what lets a phone's browser
 * offer "Add to Home Screen" and open the app in its own window, without the browser's bars.
 * Installing is all it does: there is no service worker, so nothing is cached and nothing is pushed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      icon("icon-192.png", 192, "any"),
      icon("icon-512.png", 512, "any"),
      // Android crops these to its own shape, so the face sits inside the middle 80%.
      icon("icon-maskable-192.png", 192, "maskable"),
      icon("icon-maskable-512.png", 512, "maskable"),
    ],
  };
}
