import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: 250 * 1024 * 1024, // 250MB
  },
};

export default nextConfig;
