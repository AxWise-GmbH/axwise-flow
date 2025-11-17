'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, UserCircle2, Download } from 'lucide-react';
import type {
  AxPersonaDataset,
  PipelineExecutionResult,
  ScopeSummary,
  PipelineRunDetail,
} from '@/lib/axpersona/types';

interface ScopeMainViewProps {
  scope?: ScopeSummary;
  result?: PipelineExecutionResult;
  pipelineRunDetail?: PipelineRunDetail;
  isLoading?: boolean;
}

function getDatasetSummary(dataset: AxPersonaDataset | undefined) {
  if (!dataset) {
    return {
      personaCount: 0,
      interviewCount: 0,
    };
  }
  return {
    personaCount: dataset.personas.length,
    interviewCount: dataset.interviews.length,
  };
}

export function ScopeMainView({
  scope,
  result,
  pipelineRunDetail,
  isLoading,
}: ScopeMainViewProps) {
  const dataset = pipelineRunDetail?.dataset ?? result?.dataset;
  const { personaCount, interviewCount } = getDatasetSummary(dataset);

  const personas = Array.isArray(dataset?.personas)
    ? (dataset!.personas as Record<string, unknown>[])
    : [];

  const interviewsByRole = !dataset || !Array.isArray(dataset.interviews)
    ? []
    : (() => {
        const groups = new Map<string, any[]>();
        (dataset.interviews as any[]).forEach((interview) => {
          const rawRole = (interview as any)['stakeholder_type'];
          const role = typeof rawRole === 'string' ? rawRole : 'Stakeholder';
          const existing = groups.get(role) ?? [];
          existing.push(interview);
          groups.set(role, existing);
        });
        return Array.from(groups.entries());
      })();

  const canExport = !!(pipelineRunDetail?.dataset || result?.dataset);

  const handleExport = () => {
    const detail = pipelineRunDetail;
    const baseResult = result;

    if (!detail && !baseResult) {
      return;
    }

    const exportPayload =
      detail ?? {
        status: baseResult!.status,
        total_duration_seconds: baseResult!.total_duration_seconds,
        dataset: baseResult!.dataset,
        execution_trace: baseResult!.execution_trace,
      };

    const rawName =
      detail?.business_context.business_idea ||
      scope?.name ||
      detail?.job_id ||
      'axpersona-dataset';

    const fileBaseName = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBaseName || 'axpersona-dataset'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {scope ? scope.name : 'AxPersona scope'}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {scope
                ? scope.description || 'Persona dataset for this business scope.'
                : 'Create a scope to generate synthetic interviews and personas.'}
            </p>
          </div>
          {(result || canExport) && (
            <div className="flex items-center gap-2">
              {result && (
                <Badge
                  variant={result.status === 'completed' ? 'default' : 'outline'}
                  className="text-[11px]"
                >
                  {result.status === 'completed'
                    ? 'Completed'
                    : result.status === 'partial'
                      ? 'Partial'
                      : 'Failed'}
                </Badge>
              )}
              {canExport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={handleExport}
                >
                  <Download className="mr-1 h-3 w-3" />
                  Export JSON
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0 flex flex-col gap-2 min-h-0">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating AxPersona dataset for this scope...
          </div>
        )}

        {!scope && !isLoading && (
          <p className="text-xs text-muted-foreground">
            No scope selected. Use the sidebar to create a new scope and run the
            AxPersona pipeline.
          </p>
        )}

        {scope && (
          <>
            <div className="flex flex-wrap gap-3 text-xs">
              <Badge variant="secondary">Industry: {scope.businessContext.industry}</Badge>
              <Badge variant="secondary">Location: {scope.businessContext.location}</Badge>
              <Badge variant="outline">Personas: {personaCount}</Badge>
              <Badge variant="outline">Interviews: {interviewCount}</Badge>
            </div>

            <Tabs defaultValue="personas" className="mt-1 flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-2 w-full max-w-xs">
            <TabsTrigger value="personas" className="text-xs">
              Personas (debug)
            </TabsTrigger>
            <TabsTrigger value="interviews" className="text-xs">
              Interviews
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="personas"
            className="flex-1 mt-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
          >
            {personas.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">
                  No personas generated yet for this scope.
                </p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-4 pb-4">
                  {personas.map((persona, index) => {
                    const rawName = persona['name'];
                    const name =
                      typeof rawName === 'string'
                        ? rawName
                        : `Persona ${index + 1}`;
                    return (
                      <div
                        key={dataset?.scope_id + '-persona-' + index}
                        className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs"
                      >
                        <UserCircle2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{name}</div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            Synthetic persona derived from AxPersona analysis.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
          <TabsContent
            value="interviews"
            className="flex-1 mt-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
          >
            {interviewsByRole.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-muted-foreground">
                  No interviews available for this scope.
                </p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-3 pr-4 pb-4">
                  {interviewsByRole.map(([role, interviewsForRole]) => (
                    <div
                      key={role as string}
                      className="rounded-md border bg-muted/30 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-xs">{role}</div>
                        <span className="text-[10px] text-muted-foreground">
                          {(interviewsForRole as any[]).length} interview
                          {(interviewsForRole as any[]).length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {(interviewsForRole as any[]).map((interview, index) => {
                          const responses = (interview as any)['responses'] as Array<{
                            question: string;
                            response: string;
                            sentiment?: string;
                            key_insights?: string[];
                          }> || [];
                          const overallSentiment = (interview as any)['overall_sentiment'];
                          const keyThemes = ((interview as any)['key_themes'] as string[]) || [];

                          return (
                            <div
                              key={dataset?.scope_id + '-interview-' + String(role) + '-' + index}
                              className="pb-3 border-b last:border-b-0"
                            >
                              {/* Interview Header */}
                              <div className="flex items-start gap-2 mb-2">
                                <MessageCircle className="mt-0.5 h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1">
                                  <div className="font-medium">
                                    Interview {index + 1}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {overallSentiment && (
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 ${
                                          typeof overallSentiment === 'string' && overallSentiment.toLowerCase().includes('positive')
                                            ? 'border-green-500 text-green-700'
                                            : typeof overallSentiment === 'string' && overallSentiment.toLowerCase().includes('negative')
                                            ? 'border-red-500 text-red-700'
                                            : 'border-yellow-500 text-yellow-700'
                                        }`}
                                      >
                                        {String(overallSentiment)}
                                      </Badge>
                                    )}
                                    <span className="text-[10px] text-muted-foreground">
                                      {responses.length} Q&A
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Key Themes */}
                              {keyThemes.length > 0 && (
                                <div className="mb-2 pb-2 border-b">
                                  <div className="text-[10px] font-medium text-muted-foreground mb-1">
                                    Key Themes
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {keyThemes.slice(0, 3).map((theme, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                                      >
                                        {theme}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Q&A Responses */}
                              <div className="space-y-2">
                                {responses.map((resp, respIdx) => (
                                  <div key={respIdx} className="text-[11px]">
                                    <div className="font-medium text-foreground mb-0.5">
                                      Q: {resp.question}
                                    </div>
                                    <div className="text-muted-foreground">
                                      A: {resp.response}
                                    </div>
                                    {resp.key_insights && resp.key_insights.length > 0 && (
                                      <div className="mt-1 text-[10px] text-primary">
                                        💡 {resp.key_insights[0]}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}

