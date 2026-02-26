import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: 250 * 1024 * 1024, // 250MB
  },
};

export default nextConfig;
