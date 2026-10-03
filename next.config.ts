import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  async headers() {
    // Public build metadata distinguishes the new deployment from the old one.
    const revision = process.env.VERCEL_GIT_COMMIT_SHA;
    if (!revision || !/^[a-f0-9]{40}$/.test(revision)) return [];
    return [
      {
        source: "/login",
        headers: [{ key: "x-cappy-hub-revision", value: revision }],
      },
    ];
  },
};

export default nextConfig;
