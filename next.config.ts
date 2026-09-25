import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // The local dev server is accessed through the workspace proxy as well as
  // directly by the headless browser. Permit those origins to load Next's dev
  // client assets so the page can hydrate.
  allowedDevOrigins: ["127.0.0.1", "10.20.30.105"],
};

export default nextConfig;
