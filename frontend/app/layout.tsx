import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'AxWise Flow — Self-Hosted Headless REST API Engine',
  description: 'Instantiate psychologically grounded Sovereign Digital Twins that execute operational processes inside secure, containerized environments. Built on Orqaly’s Agentic OS.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' }
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'AxWise Flow — Self-Hosted Headless REST API Engine',
    description: 'Instantiate psychologically grounded Sovereign Digital Twins that execute operational processes inside secure, containerized environments. Built on Orqaly’s Agentic OS.',
    url: 'https://axwise.de',
    siteName: 'AxWise Flow',
    images: [
      {
        url: 'https://axwise.de/og_preview.png',
        width: 1200,
        height: 630,
        alt: 'AxWise Flow — Real-World Digital Twin Chats',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AxWise Flow — Self-Hosted Headless REST API Engine',
    description: 'Instantiate psychologically grounded Sovereign Digital Twins that execute operational processes inside secure, containerized environments. Built on Orqaly’s Agentic OS.',
    images: ['https://axwise.de/orqaly-axwise/assets/simple_mode_home.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevents zoom on input focus
  viewportFit: 'cover', // Handles notched devices
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#000' },
  ],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
      </head>
      <body className="font-sans">
        <ErrorBoundary>
          <Providers>
            <AppLayout>
              {children}
            </AppLayout>
            <Toaster />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
