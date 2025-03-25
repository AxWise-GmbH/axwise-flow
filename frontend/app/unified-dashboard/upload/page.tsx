/**
 * Upload Tab Server Component
 * 
 * ARCHITECTURAL NOTE: This is the server component implementation of the upload tab.
 * It eliminates the Zustand store dependency by using server components and URL params.
 */

import EmergencyUploadPanel from '@/components/upload/EmergencyUploadPanel';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/loading-spinner';

export const dynamic = 'force-dynamic';

export default function UploadPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EmergencyUploadPanel />
    </Suspense>
  );
} 