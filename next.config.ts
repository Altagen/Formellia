import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pino", "pino-pretty"],
};

export default nextConfig;
