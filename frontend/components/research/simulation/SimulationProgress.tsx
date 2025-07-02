/**
 * Progress tracking component for simulation.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  MessageSquare, 
  Brain, 
  BarChart3, 
  CheckCircle2, 
  XCircle,
  Clock,
  Zap
} from 'lucide-react';

import { 
  SimulationProgress as SimulationProgressType, 
  SimulationConfig,
  getSimulationProgress,
  cancelSimulation 
} from '@/lib/api/simulation';

interface SimulationProgressProps {
  isVisible: boolean;
  simulationId?: string;
  onCancel: () => void;
  onComplete: (simulationId: string) => void;
  simulationConfig?: SimulationConfig;
}

export function SimulationProgress({
  isVisible,
  simulationId,
  onCancel,
  onComplete,
  simulationConfig
}: SimulationProgressProps) {
  const [progress, setProgress] = useState<SimulationProgressType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Poll for progress updates
  useEffect(() => {
    if (!isVisible || !simulationId) return;

    const pollProgress = async () => {
      try {
        const progressData = await getSimulationProgress(simulationId);
        setProgress(progressData);

        // Check if completed
        if (progressData.stage === 'completed') {
          onComplete(simulationId);
        } else if (progressData.stage === 'failed') {
          setError('Simulation failed. Please try again.');
        }
      } catch (err) {
        console.error('Failed to get progress:', err);
        setError('Failed to get simulation progress');
      }
    };

    // Initial poll
    pollProgress();

    // Set up polling interval
    const interval = setInterval(pollProgress, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [isVisible, simulationId, onComplete]);

  const handleCancel = async () => {
    if (!simulationId) return;

    setCancelling(true);
    try {
      await cancelSimulation(simulationId);
      onCancel();
    } catch (err) {
      console.error('Failed to cancel simulation:', err);
      setError('Failed to cancel simulation');
    } finally {
      setCancelling(false);
    }
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'initializing':
        return <Zap className="h-4 w-4" />;
      case 'generating_personas':
        return <Users className="h-4 w-4" />;
      case 'simulating_interviews':
        return <MessageSquare className="h-4 w-4" />;
      case 'generating_insights':
        return <Brain className="h-4 w-4" />;
      case 'formatting_data':
        return <BarChart3 className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'initializing':
        return 'Initializing';
      case 'generating_personas':
        return 'Generating AI Personas';
      case 'simulating_interviews':
        return 'Simulating Interviews';
      case 'generating_insights':
        return 'Analyzing Results';
      case 'formatting_data':
        return 'Preparing Data';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Processing';
    }
  };

  const formatTime = (minutes: number) => {
    if (minutes < 1) return 'Less than 1 minute';
    if (minutes === 1) return '1 minute';
    return `${Math.round(minutes)} minutes`;
  };

  if (!isVisible) return null;

  return (
    <Dialog open={isVisible} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            Running AI Simulation
          </DialogTitle>
          <DialogDescription>
            Generating personas and conducting simulated interviews...
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {error ? (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Error</span>
                </div>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </CardContent>
            </Card>
          ) : progress ? (
            <>
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStageIcon(progress.stage)}
                    <span className="text-sm font-medium">{getStageLabel(progress.stage)}</span>
                  </div>
                  <Badge variant="secondary">{progress.progress_percentage}%</Badge>
                </div>
                <Progress value={progress.progress_percentage} className="w-full" />
                <p className="text-xs text-muted-foreground">{progress.current_task}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">
                        {progress.completed_personas}/{progress.total_personas}
                      </div>
                      <div className="text-xs text-muted-foreground">Personas</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">
                        {progress.completed_interviews}/{progress.total_interviews}
                      </div>
                      <div className="text-xs text-muted-foreground">Interviews</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Time Estimate */}
              {progress.estimated_time_remaining && (
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">
                    Estimated time remaining: {formatTime(progress.estimated_time_remaining)}
                  </div>
                </div>
              )}

              {/* Configuration Summary */}
              {simulationConfig && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Depth: {simulationConfig.depth}</div>
                      <div>Style: {simulationConfig.response_style}</div>
                      <div>Personas per stakeholder: {simulationConfig.personas_per_stakeholder}</div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Starting simulation...</p>
            </div>
          )}

          {/* Cancel Button */}
          <div className="flex justify-center">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              disabled={cancelling || progress?.stage === 'completed'}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Simulation'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
