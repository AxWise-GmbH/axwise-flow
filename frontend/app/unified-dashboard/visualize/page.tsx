import VisualizationTabs from '@/components/visualization/VisualizationTabs';
import { Suspense } from 'react';
import Loading from './loading';
import { getServerSideAnalysis } from '@/app/actions';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

interface VisualizePageProps {
  searchParams: { 
    analysisId?: string;
    visualizationTab?: string;
  };
}

export default async function VisualizePage({ searchParams }: VisualizePageProps): Promise<JSX.Element> { // Add return type
  const analysisId = searchParams.analysisId || '';
  
  // Fetch analysis data server-side
  const analysisData = analysisId ? await getServerSideAnalysis(analysisId) : null;
  
  return (
    <Suspense fallback={<Loading />}>
      <VisualizationTabs 
        analysisId={analysisId} 
        analysisData={analysisData}
      />
    </Suspense>
  );
} 