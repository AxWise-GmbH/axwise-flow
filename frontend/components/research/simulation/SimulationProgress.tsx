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
      case 'creating_files':
        return 'Creating Files';
      case 'saving_results':
        return 'Saving Results';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Processing';
    }
  };

  const getStageDescription = (stage: string, progress?: SimulationProgressType) => {
    switch (stage) {
      case 'initializing':
        return 'Setting up simulation parameters and validating data';
      case 'generating_personas':
        return `Creating realistic AI personas for ${progress?.total_personas || 'multiple'} stakeholders`;
      case 'simulating_interviews':
        return `Conducting parallel interviews with ${progress?.total_interviews || 'multiple'} personas`;
      case 'generating_insights':
        return 'Analyzing interview responses and extracting key insights';
      case 'formatting_data':
        return 'Preparing data for analysis and visualization';
      case 'creating_files':
        return 'Creating individual stakeholder interview files';
      case 'saving_results':
        return 'Saving simulation results to database';
      case 'completed':
        return 'Simulation completed successfully';
      case 'failed':
        return 'Simulation encountered an error';
      default:
        return 'Processing simulation data';
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStageIcon(progress.stage)}
                    <span className="text-sm font-medium">{getStageLabel(progress.stage)}</span>
                  </div>
                  <Badge variant="secondary">{progress.progress_percentage}%</Badge>
                </div>
                <Progress value={progress.progress_percentage} className="w-full h-2" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">{progress.current_task}</p>
                  <p className="text-xs text-muted-foreground">{getStageDescription(progress.stage, progress)}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-3 pb-3">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Users className="h-3 w-3 text-blue-600" />
                        <span className="text-xs font-medium text-blue-800">Personas</span>
                      </div>
                      <div className="text-lg font-bold text-blue-600">
                        {progress.completed_personas || progress.completed_people || 0}/{progress.total_personas || progress.total_people || 0}
                      </div>
                      {progress.stage === 'generating_personas' && (
                        <div className="text-xs text-blue-600 mt-1">
                          {progress.completed_personas === progress.total_personas ? '✓ Complete' : 'In Progress...'}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50/50">
                  <CardContent className="pt-3 pb-3">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <MessageSquare className="h-3 w-3 text-green-600" />
                        <span className="text-xs font-medium text-green-800">Interviews</span>
                      </div>
                      <div className="text-lg font-bold text-green-600">
                        {progress.completed_interviews}/{progress.total_interviews}
                      </div>
                      {progress.stage === 'simulating_interviews' && (
                        <div className="text-xs text-green-600 mt-1">
                          {progress.completed_interviews === progress.total_interviews ? '✓ Complete' : 'Running...'}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Progress for Interview Stage */}
              {progress.stage === 'simulating_interviews' && progress.total_interviews > 0 && (
                <Card className="bg-amber-50/50 border-amber-200">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-amber-800">Interview Progress</span>
                        <span className="text-xs text-amber-600">
                          {Math.round((progress.completed_interviews / progress.total_interviews) * 100)}%
                        </span>
                      </div>
                      <Progress
                        value={(progress.completed_interviews / progress.total_interviews) * 100}
                        className="w-full h-1"
                      />
                      <div className="flex justify-between text-xs text-amber-700">
                        <span>Completed: {progress.completed_interviews}</span>
                        <span>Remaining: {progress.total_interviews - progress.completed_interviews}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Time Estimate */}
              {progress.estimated_time_remaining && progress.estimated_time_remaining > 0 && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>~{formatTime(progress.estimated_time_remaining)} remaining</span>
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
                      <div>People per stakeholder: {simulationConfig.people_per_stakeholder}</div>
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
