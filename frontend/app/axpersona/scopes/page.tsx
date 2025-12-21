'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ScopeSelector } from '@/components/axpersona/ScopeSelector';
import { ScopeCreationForm } from '@/components/axpersona/ScopeCreationForm';
import { ScopeMainView } from '@/components/axpersona/ScopeMainView';
import { AnalysisPanel } from '@/components/axpersona/AnalysisPanel';
import { Button } from '@/components/ui/button';
import { useStartPipeline, usePipelineRunDetail } from '@/lib/axpersona/hooks';
import { useToast } from '@/components/providers/toast-provider';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import type {
  BusinessContext,
  ScopeSummary,
  PipelineExecutionResult,
  PersonaDatasetSummary,
} from '@/lib/axpersona/types';

function ScopeDetailPage() {
  const [isCreationOpen, setIsCreationOpen] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [selectedRunJobId, setSelectedRunJobId] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [isAnalysisPanelVisible, setIsAnalysisPanelVisible] = useState(false);

  const queryClient = useQueryClient();
  const startPipeline = useStartPipeline();
  const { showToast } = useToast();

  // Fetch detailed pipeline run data when a run is selected
  const { data: pipelineRunDetail, isLoading: isLoadingRunDetail } = usePipelineRunDetail(
    selectedRunJobId
  );

  // Watch for job completion when we have a pending job
  useEffect(() => {
    if (pendingJobId && pipelineRunDetail?.job_id === pendingJobId) {
      if (pipelineRunDetail.status === 'completed') {
        showToast('Dataset generated successfully!', { variant: 'success' });
        setPendingJobId(null);
      } else if (pipelineRunDetail.status === 'failed') {
        showToast(`Pipeline failed: ${pipelineRunDetail.error || 'Unknown error'}`, { variant: 'error' });
        setPendingJobId(null);
      }
    }
  }, [pendingJobId, pipelineRunDetail, showToast]);

  // Convert pipeline run detail to PipelineExecutionResult format
  const pipelineRunResult: PipelineExecutionResult | undefined = useMemo(() => {
    if (!pipelineRunDetail) return undefined;

    return {
      dataset: pipelineRunDetail.dataset,
      execution_trace: pipelineRunDetail.execution_trace,
      total_duration_seconds: pipelineRunDetail.total_duration_seconds || 0,
      status: pipelineRunDetail.status === 'completed'
        ? 'completed'
        : pipelineRunDetail.status === 'failed'
        ? 'failed'
        : 'partial',
    };
  }, [pipelineRunDetail]);

  // Convert pipeline run to scope summary for display
  const pipelineRunScope: ScopeSummary | undefined = useMemo(() => {
    if (!pipelineRunDetail) return undefined;

    return {
      id: pipelineRunDetail.job_id,
      name: pipelineRunDetail.business_context.business_idea || 'Untitled Run',
      description: `${pipelineRunDetail.business_context.industry} – ${pipelineRunDetail.business_context.target_customer}`,
      status: pipelineRunDetail.status === 'completed'
        ? 'completed'
        : pipelineRunDetail.status === 'running'
        ? 'running'
        : pipelineRunDetail.status === 'failed'
        ? 'failed'
        : 'partial',
      createdAt: pipelineRunDetail.created_at,
      lastRunAt: pipelineRunDetail.completed_at || pipelineRunDetail.started_at,
      businessContext: pipelineRunDetail.business_context,
    };
  }, [pipelineRunDetail]);

  // Display data from pipeline run
  const displayScope = pipelineRunScope;
  const displayResult = pipelineRunResult;
  // Show loading when starting pipeline OR when we have a pending job that's still running
  const isLoading = startPipeline.isPending || isLoadingRunDetail ||
    (pendingJobId !== null && pipelineRunDetail?.status === 'running');

  const handleSelectDataset = (dataset: PersonaDatasetSummary) => {
    // Set selected run job ID to fetch details
    setSelectedRunJobId(dataset.jobId);
  };

  const handleCreateScope = async (context: BusinessContext) => {
    setFormError(undefined);
    try {
      // Start the pipeline - returns immediately with job_id
      const result = await startPipeline.mutateAsync(context);

      const jobId = result.job_id;

      if (jobId) {
        // Track this job as pending and auto-select it
        setPendingJobId(jobId);
        setSelectedRunJobId(jobId);
      }

      // Close the form immediately - polling will track progress
      setIsCreationOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to start AxPersona pipeline';
      setFormError(message);
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Persona Datasets
          </h1>
          <p className="text-sm text-muted-foreground">
            Canonical synthetic personas for downstream applications (CV matching, recommenders, marketing).
          </p>
        </div>
        {/* Toggle button for Analysis Panel */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAnalysisPanelVisible(!isAnalysisPanelVisible)}
          className="flex items-center gap-2"
        >
          {isAnalysisPanelVisible ? (
            <>
              <PanelRightClose className="h-4 w-4" />
              <span className="hidden sm:inline">Hide Panel</span>
            </>
          ) : (
            <>
              <PanelRightOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Show Panel</span>
            </>
          )}
        </Button>
      </div>
      <div className="flex flex-1 gap-4 min-h-0">
        <div className="w-72 flex-shrink-0 flex flex-col min-h-0">
          <ScopeSelector
            onCreateScope={() => setIsCreationOpen(true)}
            isCreating={startPipeline.isPending || pendingJobId !== null}
            onSelectDataset={handleSelectDataset}
            selectedJobId={selectedRunJobId}
          />
        </div>
        <div className="flex-1 min-w-0">
          <ScopeMainView
            scope={displayScope}
            result={displayResult}
            pipelineRunDetail={pipelineRunDetail}
            isLoading={isLoading}
          />
        </div>
        {/* Collapsible Analysis Panel */}
        {isAnalysisPanelVisible && (
          <div className="w-96 flex-shrink-0 transition-all duration-300">
            <AnalysisPanel
              result={displayResult}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
      <ScopeCreationForm
        open={isCreationOpen}
        onClose={() => {
          if (!startPipeline.isPending) {
            setFormError(undefined);
            setIsCreationOpen(false);
          }
        }}
        onSubmit={handleCreateScope}
        isSubmitting={startPipeline.isPending}
        errorMessage={formError}
      />
    </div>
  );
}

export default function Page() {
  return <ScopeDetailPage />;
}

