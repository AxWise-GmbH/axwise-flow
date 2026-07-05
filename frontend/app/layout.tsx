import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AxWise Flow — Self-Hosted Headless REST API Engine',
  description: 'Instantiate psychologically grounded Sovereign Digital Twins that execute operational processes inside secure, containerized environments. Built on Orqaly’s Agentic OS.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevents zoom on input focus
  viewportFit: 'cover' // Handles notched devices
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
      </head>
      <body className={inter.className}>
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
