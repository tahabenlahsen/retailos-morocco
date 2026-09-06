import type { NextConfig } from "next"

const isProd = process.env.NODE_ENV === "production"

/**
 * Content-Security-Policy.
 * - 'unsafe-inline' for styles is required by Tailwind/Radix inline style attributes.
 * - 'unsafe-eval' is only allowed in development for React Fast Refresh.
 * - connect-src allows same-origin API calls only (the OpenAI call happens server-side).
 * - img-src allows https for product image URLs entered by merchants.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `BUILD_DIST_DIR=.next-build npm run build` lets a production build run while `next dev` keeps using .next
  distDir: process.env.BUILD_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ]
  },
}

export default nextConfig
