/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lean, self-contained server bundle for Docker (.next/standalone).
  output: "standalone",
};

export default nextConfig;
