import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Interview Analysis',
  description: 'Analyze interview data with AI'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1
};

export const themeColor = [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#000' },
];

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Fix for vendor.js message channel error */}
        <Script src="/fix-vendor-error.js" strategy="beforeInteractive" />
      </head>
      <body className={inter.className}>
        <ErrorBoundary>
          <Providers>
            <AppLayout>
              {children}
            </AppLayout>
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}