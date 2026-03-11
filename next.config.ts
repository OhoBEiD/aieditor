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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/material-extensions/vscode-material-icon-theme/main/icons/**'
      }
    ]
  },
  // Required headers for WebContainer (SharedArrayBuffer support)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
