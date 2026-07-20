import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'AxWise — Cognitive Decision Layer for Agentic Work',
  description: 'Turn vague goals into evidence-aware customer context, ideal executor profiles, and trusted agent or team recommendations. Orqaly authorizes and executes.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' }
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'AxWise — Cognitive Decision Layer for Agentic Work',
    description: 'Turn vague goals into evidence-aware customer context, ideal executor profiles, and trusted agent or team recommendations. Orqaly authorizes and executes.',
    url: 'https://axwise.de',
    siteName: 'AxWise Flow',
    images: [
      {
        url: 'https://axwise.de/og_preview.png',
        width: 1200,
        height: 630,
        alt: 'AxWise cognitive decision layer for agentic work',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AxWise — Cognitive Decision Layer for Agentic Work',
    description: 'Turn vague goals into evidence-aware customer context, ideal executor profiles, and trusted agent or team recommendations. Orqaly authorizes and executes.',
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
