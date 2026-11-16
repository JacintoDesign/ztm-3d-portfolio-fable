import type { NextConfig } from 'next'

// No splitChunks block on purpose: Next builds with Turbopack, which does not
// expose webpack's splitChunks. The engine chunk split comes from the
// next/dynamic({ ssr: false }) boundary around the Canvas.
const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
