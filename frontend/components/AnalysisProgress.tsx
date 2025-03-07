'use client';

import React, { useEffect, useState } from 'react';
import ProcessingStepsLoader, { ProcessingStep } from '@/components/ProcessingStepsLoader';
import { startProcessingStatusPolling } from '@/lib/api/processingStatusService';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, RefreshCcw, AlertTriangle } from 'lucide-react';

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
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [elapsedTime, setElapsedTime] = useState<number>(0);

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

    // Set the start time when the component mounts
    setStartTime(new Date());

    // Clean up polling when component unmounts
    return () => {
      stopPolling();
    };
  }, [analysisId, onComplete]);

  // Update elapsed time every second
  useEffect(() => {
    if (isComplete) return;

    const timer = setInterval(() => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [startTime, isComplete]);

  // Format elapsed time as MM:SS
  const formatElapsedTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleViewResults = () => {
    window.location.href = `/results/${analysisId}`;
  };

  const handleRetry = () => {
    // Reset error state and restart polling
    setError(undefined);
    setStartTime(new Date());
    startProcessingStatusPolling(
      analysisId,
      ({ steps, overallProgress, error }) => {
        setSteps(steps);
        setOverallProgress(overallProgress);
        setError(error);
        
        if (overallProgress >= 1) {
          setIsComplete(true);
          onComplete?.();
        }
      }
    );
  };

  return (
    <Card className={`w-full max-w-3xl mx-auto shadow-lg ${className}`}>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle>Analysis Progress</CardTitle>
          {!isComplete && (
            <div className="text-sm text-muted-foreground">
              Elapsed: <span className="font-mono">{formatElapsedTime(elapsedTime)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <ProcessingStepsLoader
          steps={steps}
          overallProgress={overallProgress}
          error={error}
        />
      </CardContent>
      <CardFooter className="border-t p-4 flex justify-between">
        {error ? (
          <>
            <div className="flex items-center text-destructive">
              <AlertTriangle className="w-4 h-4 mr-2" />
              <span className="text-sm">An error occurred during processing</span>
            </div>
            <Button variant="outline" onClick={handleRetry}>
              Retry
            </Button>
          </>
        ) : isComplete ? (
          <>
            <div className="text-sm text-muted-foreground">
              Processing completed in {formatElapsedTime(elapsedTime)}
            </div>
            <Button onClick={handleViewResults}>
              View Results <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Please wait while we process your data...
            </div>
            <Button variant="outline" disabled>
              <RefreshCcw className="mr-2 w-4 h-4 animate-spin" /> Processing...
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default AnalysisProgress; 