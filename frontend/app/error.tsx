'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorProps {
  error: Error;
  reset: () => void;
}

/**
 * Global error page that catches and displays runtime errors
 */
export default function Error({ error, reset }: ErrorProps): JSX.Element {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 bg-background rounded-lg shadow-lg">
        <div className="flex items-center space-x-2 text-destructive mb-4">
          <AlertCircle className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Something went wrong!</h1>
        </div>
        
        <div className="space-y-4">
          <p className="text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="p-4 bg-muted/50 rounded-md">
              <p className="font-mono text-sm break-all">
                {error.message}
              </p>
            </div>
          )}

          <div className="flex items-center space-x-4">
            <Button onClick={reset} variant="default">
              Try again
            </Button>
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
            >
              Go home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}