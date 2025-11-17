'use client';

import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ExecutionTracePanel } from './ExecutionTracePanel';
import type { PipelineExecutionResult } from '@/lib/axpersona/types';

interface AnalysisPanelProps {
  result?: PipelineExecutionResult;
  isLoading?: boolean;
}

export function AnalysisPanel({ result, isLoading }: AnalysisPanelProps) {
  const dataset = result?.dataset;
  const analysis = dataset?.analysis;
  const quality = dataset?.quality;

  return (
    <Tabs defaultValue="trace" className="flex flex-col">
      <TabsList className="grid grid-cols-3 w-full">
        <TabsTrigger value="trace" className="text-xs">
          Execution
        </TabsTrigger>
        <TabsTrigger value="analysis" className="text-xs">
          Analysis
        </TabsTrigger>
        <TabsTrigger value="quality" className="text-xs">
          Quality
        </TabsTrigger>
      </TabsList>
      <TabsContent value="trace" className="mt-2">
        <ExecutionTracePanel
          trace={result?.execution_trace}
          status={result?.status}
          isLoading={isLoading}
        />
      </TabsContent>
      <TabsContent
        value="analysis"
        className="mt-2"
      >
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Analysis summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!analysis ? (
              <p className="text-xs text-muted-foreground">
                No analysis data available yet for this scope.
              </p>
            ) : (
              <div className="space-y-2 pr-2 text-xs">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Themes: {analysis.themes.length}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Patterns: {analysis.patterns.length}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Personas: {analysis.personas?.length ?? 0}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Insights: {analysis.insights?.length ?? 0}
                  </Badge>
                </div>
                {analysis.error && (
                  <p className="text-[10px] text-destructive">
                    Error: {analysis.error}
                  </p>
                )}
                <div className="mt-2 text-[10px] text-muted-foreground space-y-1">
                  <p>
                    Analysis created at {new Date(analysis.createdAt).toLocaleString()}
                  </p>
                  <p className="truncate">
                    File: {analysis.fileName}
                  </p>
                  {analysis.industry && (
                    <p>
                      Industry: {analysis.industry}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent
        value="quality"
        className="mt-2"
      >
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Data quality</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!quality || Object.keys(quality).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No quality metrics available yet for this scope.
              </p>
            ) : (
              <div className="space-y-1.5 pr-2 text-xs">
                {Object.entries(quality).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-2 rounded-md border bg-muted/20 p-1.5"
                  >
                    <span className="text-[10px] font-medium truncate">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-muted-foreground text-right">
                      {typeof value === 'number'
                        ? value.toFixed(2)
                        : typeof value === 'string'
                        ? value
                        : JSON.stringify(value).slice(0, 50)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

