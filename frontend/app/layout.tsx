import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AxWise - Your AI Co-Pilot for Product Development',
  description: 'Transform your raw ideas into validated, actionable plans with AxWise\'s powerful AI co-pilot',
  // The icons are now handled by the app/favicon.ico, app/icon.tsx, and app/apple-icon.tsx files
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
