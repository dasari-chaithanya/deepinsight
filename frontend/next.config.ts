import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow all local IP addresses for testing on local network
  allowedDevOrigins: [
    "http://192.168.1.5:3000",
    "http://192.168.1.5",
    "http://localhost:3000",
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/:path*", // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
