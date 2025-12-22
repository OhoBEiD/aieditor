import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly tell Next.js to use src directory
  experimental: {
    // Helps with path resolution
  },
  // Disable strict mode for production builds
  typescript: {
    // Don't fail build on type errors (since we use src directory)
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
