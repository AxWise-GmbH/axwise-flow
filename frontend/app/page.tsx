'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';

/**
 * Main application page that redirects to the unified dashboard
 */
export default function HomePage(): JSX.Element {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the unified dashboard
    router.push('/unified-dashboard');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-muted-foreground">Redirecting to dashboard...</p>
    </div>
  );
}