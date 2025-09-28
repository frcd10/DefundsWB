import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/products',
        destination: '/Funds',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
