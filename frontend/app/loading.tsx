import { LoadingSpinner } from '@/components/loading-spinner';

/**
 * Global loading page displayed during route transitions and initial page loads
 */
export default function Loading(): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <LoadingSpinner 
          size="lg"
          label="Loading..."
          className="mx-auto"
        />
        <p className="text-muted-foreground animate-pulse">
          Processing your request...
        </p>
      </div>
    </div>
  );
}