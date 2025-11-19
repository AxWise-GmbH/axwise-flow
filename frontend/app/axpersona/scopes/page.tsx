'use client';

import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ScopeSelector } from '@/components/axpersona/ScopeSelector';
import { ScopeCreationForm } from '@/components/axpersona/ScopeCreationForm';
import { ScopeMainView } from '@/components/axpersona/ScopeMainView';
import { AnalysisPanel } from '@/components/axpersona/AnalysisPanel';
import { useRunPipeline, usePipelineRunDetail } from '@/lib/axpersona/hooks';
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

  const queryClient = useQueryClient();
  const runPipeline = useRunPipeline();

  // Fetch detailed pipeline run data when a run is selected
  const { data: pipelineRunDetail, isLoading: isLoadingRunDetail } = usePipelineRunDetail(
    selectedRunJobId
  );

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
  const isLoading = runPipeline.isPending || isLoadingRunDetail;

  const handleSelectDataset = (dataset: PersonaDatasetSummary) => {
    // Set selected run job ID to fetch details
    setSelectedRunJobId(dataset.jobId);
  };

  const handleCreateScope = async (context: BusinessContext) => {
    setFormError(undefined);
    try {
      const result = await runPipeline.mutateAsync(context);

      // The backend has already persisted this pipeline run to the database
      // Now we need to:
      // 1. Invalidate the pipeline runs list to refetch from the database
      // 2. Auto-select the newly created run

      // Invalidate pipeline runs query to trigger refetch
      await queryClient.invalidateQueries({ queryKey: ['pipelineRuns'] });

      // Extract job_id from the result (added by the frontend proxy)
      const jobId = result.job_id;

      if (jobId) {
        // Auto-select the newly created run
        setSelectedRunJobId(jobId);
      }

      setIsCreationOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate AxPersona scope';
      setFormError(message);
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          Persona Datasets
        </h1>
        <p className="text-sm text-muted-foreground">
          Canonical synthetic personas for downstream applications (CV matching, recommenders, marketing).
        </p>
      </div>
      <div className="flex flex-1 gap-4 min-h-0">
        <div className="w-72 flex-shrink-0 flex flex-col min-h-0">
          <ScopeSelector
            onCreateScope={() => setIsCreationOpen(true)}
            isCreating={runPipeline.isPending}
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
        <div className="w-96 flex-shrink-0">
          <AnalysisPanel
            result={displayResult}
            isLoading={isLoading}
          />
        </div>
      </div>
      <ScopeCreationForm
        open={isCreationOpen}
        onClose={() => {
          if (!runPipeline.isPending) {
            setFormError(undefined);
            setIsCreationOpen(false);
          }
        }}
        onSubmit={handleCreateScope}
        isSubmitting={runPipeline.isPending}
        errorMessage={formError}
      />
    </div>
  );
}

export default function Page() {
  return <ScopeDetailPage />;
}

