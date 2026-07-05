import { redirect } from 'next/navigation';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

interface VisualizePageProps {
  searchParams: {
    analysisId?: string;
    visualizationTab?: string;
  };
}

/**
 * VisualizePage Component
 *
 * This page redirects to the main dashboard with the analysisId parameter when an ID is provided.
 * If no analysisId is provided, it redirects to the analysis history page for selection.
 */
export default function VisualizePage({ searchParams }: VisualizePageProps): never {
  const analysisId = searchParams.analysisId;
  const visualizationTab = searchParams.visualizationTab || 'themes';

  if (analysisId) {
    // Redirect to the main dashboard with the analysisId parameter
    const timestamp = Date.now();
    const redirectUrl = `/unified-dashboard?analysisId=${analysisId}&visualizationTab=${visualizationTab}&timestamp=${timestamp}`;
    return redirect(redirectUrl);
  } else {
    // No analysis ID provided, redirect to analysis history for selection
    return redirect('/unified-dashboard/analysis-history');
  }
}
