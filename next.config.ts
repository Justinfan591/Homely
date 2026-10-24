import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: process.cwd(),
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
