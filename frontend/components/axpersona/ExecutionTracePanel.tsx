'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, Circle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  PipelineExecutionResult,
  PipelineStageTrace,
} from '@/lib/axpersona/types';

interface ExecutionTracePanelProps {
  trace?: PipelineStageTrace[];
  status?: PipelineExecutionResult['status'];
  isLoading?: boolean;
  defaultExpanded?: boolean;
}

export function ExecutionTracePanel({
  trace,
  status,
  isLoading,
  defaultExpanded = false,
}: ExecutionTracePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const stages = trace ?? [];

  const renderStageStatus = (stageStatus: string) => {
    if (stageStatus === 'completed') {
      return (
        <Badge variant="default" className="flex items-center gap-1 text-[10px] px-1.5 py-0">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Completed
        </Badge>
      );
    }
    if (stageStatus === 'failed') {
      return (
        <Badge variant="outline" className="flex items-center gap-1 text-destructive text-[10px] px-1.5 py-0">
          <XCircle className="h-2.5 w-2.5" />
          Failed
        </Badge>
      );
    }
    if (stageStatus === 'running' || stageStatus === 'in_progress') {
      return (
        <Badge variant="secondary" className="flex items-center gap-1 text-[10px] px-1.5 py-0">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Running
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="flex items-center gap-1 text-[10px] px-1.5 py-0">
        <Circle className="h-2.5 w-2.5" />
        {stageStatus}
      </Badge>
    );
  };

  // Calculate total duration for summary
  const totalDuration = stages.reduce((sum, stage) => sum + stage.duration_seconds, 0);
  const completedStages = stages.filter(s => s.status === 'completed').length;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto hover:bg-transparent flex items-center gap-1"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <CardTitle className="text-sm">Execution trace</CardTitle>
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {/* Summary when collapsed */}
              {!isExpanded && stages.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {completedStages}/{stages.length} stages • {totalDuration.toFixed(1)}s
                </span>
              )}
              {status && (
                <Badge
                  variant={status === 'completed' ? 'default' : 'outline'}
                  className="text-[10px] px-1.5 py-0.5"
                >
                  Pipeline {status}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running AxPersona pipeline...
              </div>
            )}
            {stages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No execution trace yet. Run the pipeline to see stage-level progress.
              </p>
            ) : (
              <div className="space-y-2 pr-2">
                {stages.map((stage) => (
                  <div
                    key={stage.stage_name}
                    className="rounded-md border bg-muted/20 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="font-medium text-[11px] truncate">
                        {stage.stage_name}
                      </div>
                      {renderStageStatus(stage.status)}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        Duration: {stage.duration_seconds.toFixed(1)}s
                      </span>
                      {stage.started_at && (
                        <>
                          <Separator orientation="vertical" className="h-2.5" />
                          <span className="truncate">
                            Started: {new Date(stage.started_at).toLocaleTimeString()}
                          </span>
                        </>
                      )}
                    </div>
                    {stage.completed_at && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Completed: {new Date(stage.completed_at).toLocaleTimeString()}
                      </div>
                    )}
                    {stage.error && (
                      <p className="mt-1 text-[10px] text-destructive line-clamp-2">
                        {stage.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

