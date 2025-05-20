'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Contact page that redirects to the static HTML file
 */
export default function ContactPage(): JSX.Element {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the static HTML file
    window.location.href = '/contact.html';
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <p className="text-muted-foreground">Loading contact page...</p>
    </div>
  );
}
