/**
 * History Tab Server Component
 * 
 * ARCHITECTURAL NOTE: This is the server component implementation of the history tab.
 * It will eventually replace the Zustand-based history implementation.
 */

import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Card } from '@/components/ui/card';
import HistoryPanel from '@/components/history/HistoryPanel';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

export default function HistoryPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Card className="p-4">
        <HistoryPanel />
      </Card>
    </Suspense>
  );
} 