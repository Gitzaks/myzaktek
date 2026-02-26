import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  middlewareClientMaxBodySize: 209715200, // 200MB in bytes
};

export default nextConfig;
