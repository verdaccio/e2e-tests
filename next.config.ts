import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/e2e',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
