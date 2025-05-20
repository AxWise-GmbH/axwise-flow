'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Impressum page that redirects to the static HTML file
 */
export default function ImpressumPage(): JSX.Element {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the static HTML file
    window.location.href = '/impressum.html';
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <p className="text-muted-foreground">Loading impressum page...</p>
    </div>
  );
}
