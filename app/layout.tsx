import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'LinkPulse — Shorten smarter. Track everything.', template: '%s | LinkPulse' },
  description: 'Create secure short links, organize campaigns, and understand real click traffic with LinkPulse.',
  applicationName: 'LinkPulse',
  generator: 'LinkPulse',
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#101b28',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body className="antialiased">{children}<Toaster position="top-right" richColors />{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
