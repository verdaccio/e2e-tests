import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/website',
  distDir: '/website',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
