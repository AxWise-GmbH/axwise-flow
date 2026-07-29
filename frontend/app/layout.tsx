import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'AxWise — Cognitive Decision Layer for Agentic Work',
  description: 'Turn vague goals into evidence-aware context and trusted agent or team recommendations. Host systems authorize and execute; Orqaly is the reference integration.',
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
    description: 'Turn vague goals into evidence-aware context and trusted agent or team recommendations. Host systems authorize and execute; Orqaly is the reference integration.',
    url: 'https://axwise.de',
    siteName: 'AxWise Flow',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'AxWise — Cognitive Decision Layer for Agentic Work',
    description: 'Turn vague goals into evidence-aware context and trusted agent or team recommendations. Host systems authorize and execute; Orqaly is the reference integration.',
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
