'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Terms of Service page that redirects to the static HTML file
 */
export default function TermsOfServicePage(): JSX.Element {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the static HTML file
    window.location.href = '/terms-of-service.html';
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <p className="text-muted-foreground">Loading terms of service...</p>
    </div>
  );
}
