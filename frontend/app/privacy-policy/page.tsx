'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Privacy Policy page that redirects to the static HTML file
 */
export default function PrivacyPolicyPage(): JSX.Element {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the static HTML file
    window.location.href = '/privacy-policy.html';
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <p className="text-muted-foreground">Loading privacy policy...</p>
    </div>
  );
}
