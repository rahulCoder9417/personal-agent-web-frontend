import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge sits bottom-left by default, on top of the sidebar's account row.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
