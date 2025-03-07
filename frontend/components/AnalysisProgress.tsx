'use client';

import React, { useEffect, useState } from 'react';
import ProcessingStepsLoader, { ProcessingStep } from '@/components/ProcessingStepsLoader';
import { startProcessingStatusPolling } from '@/lib/api/processingStatusService';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, RefreshCcw } from 'lucide-react';

interface AnalysisProgressProps {
  analysisId: string;
  onComplete?: () => void;
  className?: string;
}

const AnalysisProgress: React.FC<AnalysisProgressProps> = ({
  analysisId,
  onComplete,
  className = ''
}) => {
  const [steps, setSteps] = useState<ProcessingStep[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    // Start polling for processing status
    const { stopPolling } = startProcessingStatusPolling(
      analysisId,
      ({ steps, overallProgress, error }) => {
        setSteps(steps);
        setOverallProgress(overallProgress);
        setError(error);
        
        // Check if processing is complete
        if (overallProgress >= 1) {
          setIsComplete(true);
          onComplete?.();
        }
      }
    );

    // Clean up polling when component unmounts
    return () => {
      stopPolling();
    };
  }, [analysisId, onComplete]);

  const handleViewResults = () => {
    window.location.href = `/results/${analysisId}`;
  };

  return (
    <Card className={`w-full max-w-2xl mx-auto ${className}`}>
      <CardHeader>
        <CardTitle>Analysis Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ProcessingStepsLoader
          steps={steps}
          overallProgress={overallProgress}
          error={error}
        />
      </CardContent>
      <CardFooter className="justify-between">
        {isComplete ? (
          <Button className="ml-auto" onClick={handleViewResults}>
            View Results <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        ) : (
          <Button className="ml-auto" variant="outline" disabled>
            <RefreshCcw className="mr-2 w-4 h-4 animate-spin" /> Processing...
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default AnalysisProgress; 