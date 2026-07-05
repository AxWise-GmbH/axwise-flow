/**
 * UnifiedDashboard Component
 *
 * ARCHITECTURAL NOTE: This is now the main dashboard overview page showing
 * statistics and quick actions across all user activities.
 */

import { Suspense } from 'react';
import DashboardOverview from '@/components/dashboard/DashboardOverview';
import { Loader2 } from 'lucide-react';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

export default function UnifiedDashboard(): JSX.Element {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center py-12">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardOverview />
    </Suspense>
  );
}
