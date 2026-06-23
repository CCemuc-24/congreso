/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monolith runs on the Next.js server runtime (serverless on Vercel).
  // Do NOT set output: 'export' — server actions + route handlers require the server runtime.
  reactStrictMode: true,
};

export default nextConfig;
