import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/e2e',
  distDir: '/website',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
