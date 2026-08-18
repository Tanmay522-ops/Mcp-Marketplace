import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin requests to dev-only assets/endpoints
  // (including the HMR websocket at /_next/webpack-hmr) unless the
  // requesting origin is localhost or explicitly allowlisted here. The
  // ngrok tunnel domain used to expose this app to Claude for OAuth
  // testing needs to be listed, or the HMR socket gets a 403 and (per
  // observed behavior) the client bundle never completes hydration —
  // every button on the page silently does nothing, not just Sign In.
  allowedDevOrigins: ["unpluralistic-unabasing-inocencia.ngrok-free.dev"],
};

export default nextConfig;
