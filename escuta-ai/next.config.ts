import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Desabilitar para prevenir remontagem durante upload
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
  allowedDevOrigins: ["177.129.9.194:8565", "devilai.cid-uff.net"],
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
