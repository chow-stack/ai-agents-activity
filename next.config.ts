import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Rehearsing on one computer: each team uses its own origin (separate localStorage), e.g. http://team1.localhost:3001.
  allowedDevOrigins: ["127.0.0.1", "*.localhost"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
