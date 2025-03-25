/**
 * UnifiedDashboard Component (Server Component)
 * 
 * ARCHITECTURAL NOTE: This is the server component implementation of the dashboard.
 * It redirects to the appropriate tab based on URL parameters, eliminating the need 
 * for Zustand state management.
 */

import { redirect } from 'next/navigation';

interface PageProps {
  searchParams?: {
    tab?: string;
    analysisId?: string;
  };
}

export default function UnifiedDashboard({ searchParams }: PageProps) {
  // Get the requested tab from URL parameters
  const tab = searchParams?.tab || 'upload';
  const analysisId = searchParams?.analysisId || '';
  
  // Redirect to the appropriate tab page
  if (tab === 'visualize') {
    if (analysisId) {
      redirect(`/unified-dashboard/visualize?analysisId=${analysisId}`);
    } else {
      redirect('/unified-dashboard/visualize');
    }
  } else if (tab === 'history') {
    redirect('/unified-dashboard/history');
  } else if (tab === 'documentation') {
    redirect('/unified-dashboard/documentation');
  } else {
    // Default to upload tab
    redirect('/unified-dashboard/upload');
  }
} 