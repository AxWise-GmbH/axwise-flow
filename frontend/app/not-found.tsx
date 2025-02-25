// Add 'use client' directive to enable client-side interactivity
'use client';

import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * Custom 404 Not Found page
 */
export default function NotFound(): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 text-center space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-muted p-4">
            <FileQuestion className="h-12 w-12 text-muted-foreground" />
          </div>
          <h1 className="text-4xl font-bold">404</h1>
          <h2 className="text-xl font-semibold text-muted-foreground">
            Page Not Found
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            The page you are looking for doesn't exist or has been moved.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              variant="default"
              asChild
              className="flex-1 sm:flex-initial"
            >
              <Link href="/">
                Go Home
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="flex-1 sm:flex-initial"
            >
              Go Back
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground/60">
          Error Code: 404 | Page Not Found
        </div>
      </div>
    </div>
  );
}