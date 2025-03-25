import VisualizationTabs from '@/components/visualization/VisualizationTabs';
import { Suspense } from 'react';
import Loading from './loading';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

interface VisualizePageProps {
  searchParams: { 
    analysisId?: string;
    visualizationTab?: string;
  };
}

export default function VisualizePage({ searchParams }: VisualizePageProps) {
  const analysisId = searchParams.analysisId || '';
  
  return (
    <Suspense fallback={<Loading />}>
      <VisualizationTabs analysisId={analysisId} />
    </Suspense>
  );
} 