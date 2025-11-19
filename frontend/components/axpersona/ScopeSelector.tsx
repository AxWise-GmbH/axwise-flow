'use client';

import React, { useMemo, useState } from 'react';
import { usePipelineRuns } from '@/lib/axpersona/hooks';
import { buildDatasetSummaryFromRunDetail } from '@/lib/axpersona/datasetUtils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PipelineRunSummary, PersonaDatasetSummary } from '@/lib/axpersona/types';

interface ScopeSelectorProps {
  onCreateScope: () => void;
  isCreating?: boolean;
  onSelectDataset?: (dataset: PersonaDatasetSummary) => void;
  selectedJobId?: string | null;
}

export function ScopeSelector({
  onCreateScope,
  isCreating,
  onSelectDataset,
  selectedJobId,
}: ScopeSelectorProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 20;

  // Fetch pipeline runs from database
  const { data: pipelineRunsData, isLoading, refetch } = usePipelineRuns({
    status: statusFilter === 'all' ? undefined : (statusFilter as any),
    limit: pageSize,
    offset: currentPage * pageSize,
  });

  const pipelineRuns = pipelineRunsData?.runs || [];
  const totalRuns = pipelineRunsData?.total || 0;
  const totalPages = Math.ceil(totalRuns / pageSize);

  // Convert pipeline runs to dataset summaries (simplified version without full details)
  const datasetSummaries = useMemo(() => {
    return pipelineRuns.map((run): PersonaDatasetSummary => {
      // Build a simplified dataset summary from the run summary
      const titleParts: string[] = [];
      if (run.location) titleParts.push(run.location);
      if (run.industry) titleParts.push(run.industry);
      if (run.target_customer) titleParts.push(run.target_customer);
      const title = titleParts.join(' – ') || run.business_idea || 'Untitled Dataset';

      const subtitle = run.business_idea || 'No description';

      // Determine status from pipeline status
      let status: 'draft' | 'validated' | 'live' = 'draft';
      if (run.status === 'completed' && run.persona_count && run.persona_count > 0) {
        status = 'validated';
      }

      // Generate tags
      const tags: string[] = [];
      if (run.industry) tags.push(run.industry);
      if (run.location) tags.push(run.location);
      tags.push('CV', 'Recommender', 'Marketing');

      // Build search text
      const searchText = [
        run.business_idea,
        run.target_customer,
        run.industry,
        run.location,
      ].filter(Boolean).join('\n');

      return {
        datasetId: run.job_id, // Use job_id as dataset ID for now
        version: 'v1',
        title,
        subtitle,
        status,
        tags,
        personasCount: run.persona_count || 0,
        interviewsCount: run.interview_count || 0,
        qualityScore: undefined,
        createdAt: run.created_at,
        searchText,
        jobId: run.job_id,
      };
    });
  }, [pipelineRuns]);

  // Filter datasets by search query
  const filteredDatasets = useMemo(() => {
    if (!query) return datasetSummaries;

    const q = query.toLowerCase();
    return datasetSummaries.filter((dataset) => {
      return (
        dataset.title.toLowerCase().includes(q) ||
        dataset.subtitle.toLowerCase().includes(q) ||
        dataset.tags.some(tag => tag.toLowerCase().includes(q)) ||
        dataset.searchText.toLowerCase().includes(q)
      );
    });
  }, [datasetSummaries, query]);

  const renderStatusBadge = (status: 'draft' | 'validated' | 'live') => {
    let variant: 'default' | 'secondary' | 'outline' | 'destructive' = 'secondary';
    let label = status;

    if (status === 'draft') {
      variant = 'secondary';
      label = 'Draft';
    } else if (status === 'validated') {
      variant = 'default';
      label = 'Validated';
    } else if (status === 'live') {
      variant = 'default';
      label = 'Live';
    }

    return (
      <Badge variant={variant} className="text-[10px] px-1.5 py-0">
        {label}
      </Badge>
    );
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Persona Datasets</CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              onClick={onCreateScope}
              disabled={isCreating}
              className="h-7"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-3 w-3" />
                  New
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-3 pt-0">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search datasets (market, industry, location...)"
            className="pl-8 h-8 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(value) => {
          setStatusFilter(value);
          setCurrentPage(0); // Reset to first page when filter changes
        }}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {/* Dataset List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2 pr-1">
            {isLoading && filteredDatasets.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDatasets.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No persona datasets found. Create one to generate synthetic personas.
              </p>
            ) : (
              filteredDatasets.map((dataset) => {
                const isSelected = selectedJobId === dataset.jobId;
                return (
                  <button
                    key={dataset.datasetId}
                    type="button"
                    onClick={() => onSelectDataset?.(dataset)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors overflow-hidden ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                  {/* Title and Status */}
                  <div className="flex items-start justify-between gap-2 mb-1 min-w-0">
                    <span className="font-medium text-[11px] leading-snug flex-1 min-w-0 line-clamp-2 break-words">
                      {dataset.title}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                      {renderStatusBadge(dataset.status)}
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {dataset.version}
                      </Badge>
                    </div>
                  </div>

                  {/* Subtitle */}
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mb-1.5">
                    {dataset.subtitle}
                  </p>

                  {/* Tags */}
                  {dataset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {dataset.tags.slice(0, 5).map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                    {dataset.personasCount > 0 && (
                      <span className="bg-muted px-1.5 py-0.5 rounded">
                        {dataset.personasCount} personas
                      </span>
                    )}
                    {dataset.interviewsCount > 0 && (
                      <span className="bg-muted px-1.5 py-0.5 rounded">
                        {dataset.interviewsCount} interviews
                      </span>
                    )}
                    {dataset.qualityScore !== undefined && (
                      <span className="bg-muted px-1.5 py-0.5 rounded">
                        Quality: {dataset.qualityScore.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <p className="text-[9px] text-muted-foreground mt-1">
                    {formatTimestamp(dataset.createdAt)}
                  </p>
                </button>
              );
              })
            )}
          </div>
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-[10px] text-muted-foreground">
              Page {currentPage + 1} of {totalPages} ({totalRuns} total)
            </p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0 || isLoading}
                className="h-6 w-6 p-0"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1 || isLoading}
                className="h-6 w-6 p-0"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

