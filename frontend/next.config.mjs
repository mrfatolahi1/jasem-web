const nextConfig = {
  reactStrictMode: true,
  // Django's API routes end in a slash; avoid Next.js stripping it first.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const backend = process.env.JASEM_BACKEND_URL || "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*/` }];
  },
};

export default nextConfig;
