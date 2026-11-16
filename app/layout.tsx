import type { Metadata, Viewport } from 'next'
import './globals.css'
import { WORLD } from '@/lib/world'

export const metadata: Metadata = {
  title: `${WORLD.name} — ${WORLD.title}`,
  description: WORLD.vibe,
  icons: { icon: '/android-chrome-192x192.png', apple: '/android-chrome-192x192.png' },
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#04060B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
