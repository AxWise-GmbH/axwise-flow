'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageCircle, UserCircle2, Download, Newspaper, RefreshCw, ExternalLink, Users, Video } from 'lucide-react';
import { VideoSimulationPanel } from './VideoSimulationPanel';
import type {
  AxPersonaDataset,
  PipelineExecutionResult,
  ScopeSummary,
  PipelineRunDetail,
  StakeholderNewsItem,
  StakeholderNewsSource,
} from '@/lib/axpersona/types';
import { pipelineService } from '@/lib/axpersona/pipelineService';

interface StakeholderNewsState {
  isLoading: boolean;
  newsItems: StakeholderNewsItem[];
  sources: StakeholderNewsSource[];
  error: string | null;
  year: number | null;
}

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

function getStakeholderRoleLabel(stakeholderType?: string): string {
  switch (stakeholderType) {
    case 'primary_customer':
      return 'Primary customer';
    case 'secondary_user':
      return 'Secondary user';
    case 'decision_maker':
      return 'Decision maker';
    case 'influencer':
      return 'Influencer';
    default:
      return stakeholderType ? stakeholderType.replace(/_/g, ' ') : 'Unknown stakeholder role';
  }
}

export function ScopeMainView({
  scope,
  result,
  pipelineRunDetail,
  isLoading,
}: ScopeMainViewProps) {
  const dataset = pipelineRunDetail?.dataset ?? result?.dataset;
  const { personaCount, interviewCount } = getDatasetSummary(dataset);

  // Stakeholder news state
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [stakeholderNews, setStakeholderNews] = useState<StakeholderNewsState>({
    isLoading: false,
    newsItems: [],
    sources: [],
    error: null,
    year: null,
  });
  const [hasSearchedNews, setHasSearchedNews] = useState(false);

  const handleFetchStakeholderNews = useCallback(async () => {
    if (!scope?.businessContext) return;

    setStakeholderNews({
      isLoading: true,
      newsItems: [],
      sources: [],
      error: null,
      year: selectedYear,
    });

    try {
      const result = await pipelineService.searchStakeholderNews({
        industry: scope.businessContext.industry,
        location: scope.businessContext.location,
        year: selectedYear,
        max_items: 5,
      });

      if (result.success) {
        setStakeholderNews({
          isLoading: false,
          newsItems: result.news_items || [],
          sources: result.sources || [],
          error: null,
          year: selectedYear,
        });
      } else {
        setStakeholderNews({
          isLoading: false,
          newsItems: [],
          sources: [],
          error: result.error || 'Failed to fetch news',
          year: selectedYear,
        });
      }
    } catch (err) {
      setStakeholderNews({
        isLoading: false,
        newsItems: [],
        sources: [],
        error: err instanceof Error ? err.message : 'Unknown error',
        year: selectedYear,
      });
    }
    setHasSearchedNews(true);
  }, [scope?.businessContext, selectedYear]);

  const personas = Array.isArray(dataset?.personas)
    ? (dataset!.personas as Record<string, unknown>[])
    : [];

  const interviews = Array.isArray(dataset?.interviews)
    ? (dataset!.interviews as Record<string, unknown>[])
    : [];

  const simulationPeople = Array.isArray((dataset as any)?.simulation_people)
    ? (((dataset as any).simulation_people as Record<string, unknown>[]))
    : [];

  const analysis: any = dataset?.analysis;
  const analysisPersonas: any[] =
    (analysis?.enhanced_personas as any[]) ??
    (analysis?.personas as any[]) ??
    [];

  const personaSections = personas.map((persona, index) => {
    const personaRecord = persona as Record<string, any>;
    const rawName = personaRecord['name'];
    const name =
      typeof rawName === 'string' ? rawName : `Persona ${index + 1}`;

    let analysisPersona: any = analysisPersonas[index];
    if (!analysisPersona && analysisPersonas.length > 0) {
      const matchByName = analysisPersonas.find(
        (p: any) => p && typeof p.name === 'string' && p.name === name,
      );
      if (matchByName) {
        analysisPersona = matchByName;
      }
    }

    const stakeholderType: string | undefined =
      analysisPersona?.stakeholder_intelligence?.stakeholder_type ??
      analysisPersona?.stakeholder_type ??
      undefined;

    const interviewsForPersona = stakeholderType
      ? interviews.filter(
          (interview: any) =>
            interview &&
            typeof interview.stakeholder_type === 'string' &&
            interview.stakeholder_type === stakeholderType,
        )
      : interviews;

    const simulationProfilesForPersona = stakeholderType
      ? simulationPeople.filter(
          (person: any) =>
            person &&
            typeof person.stakeholder_type === 'string' &&
            person.stakeholder_type === stakeholderType,
        )
      : simulationPeople;

    return {
      persona: personaRecord,
      index,
      name,
      stakeholderType,
      interviewsForPersona,
      simulationProfilesForPersona,
    };
  });

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

            <Tabs defaultValue="dataset" className="flex-1 flex flex-col min-h-0 mt-3">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="dataset" className="text-xs flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Dataset
                </TabsTrigger>
                <TabsTrigger value="video" className="text-xs flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  Video Simulation
                </TabsTrigger>
                <TabsTrigger value="news" className="text-xs flex items-center gap-1.5">
                  <Newspaper className="h-3.5 w-3.5" />
                  Industry News
                  {stakeholderNews.newsItems.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">
                      {stakeholderNews.newsItems.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Dataset Tab */}
              <TabsContent value="dataset" className="flex-1 min-h-0 overflow-hidden mt-2">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 pr-4 pb-4">
                  {personas.length === 0 ? (
                    <p className='text-xs text-muted-foreground'>
                      No personas generated yet for this scope.
                    </p>
                  ) : (
                    <Accordion type='single' collapsible className='w-full'>
                      {personaSections.map(
                        ({ persona, index, name, stakeholderType, interviewsForPersona, simulationProfilesForPersona }) => {
                          const personaKey = `${dataset?.scope_id ?? 'scope'}-persona-${index}`;
                          const description =
                            typeof persona['description'] === 'string'
                              ? (persona['description'] as string)
                              : undefined;
                          const archetype =
                            typeof persona['archetype'] === 'string'
                              ? (persona['archetype'] as string)
                              : undefined;
                          const demographicsValue =
                            (persona['demographics'] as any)?.value;
                          const goalsValue =
                            (persona['goals_and_motivations'] as any)?.value;
                          const challengesValue =
                            (persona['challenges_and_frustrations'] as any)?.value;
                          const keyQuoteValue =
                            (persona['key_quotes'] as any)?.value;
                          const overallConfidence =
                            typeof persona['overall_confidence'] === 'number'
                              ? (persona['overall_confidence'] as number)
                              : typeof persona['confidence'] === 'number'
                                ? (persona['confidence'] as number)
                                : undefined;
                          const patterns = Array.isArray(persona['patterns'])
                            ? (persona['patterns'] as string[])
                            : [];
                          const primarySimulationProfile =
                            Array.isArray(simulationProfilesForPersona) &&
                            simulationProfilesForPersona.length > 0
                              ? (simulationProfilesForPersona[0] as any)
                              : undefined;
                          const primarySimDemo =
                            (primarySimulationProfile?.demographic_details as any) || undefined;
                          const primarySimAge =
                            typeof primarySimulationProfile?.age === 'number'
                              ? (primarySimulationProfile.age as number)
                              : undefined;
                          const primarySimBackground =
                            typeof primarySimulationProfile?.background === 'string'
                              ? (primarySimulationProfile.background as string)
                              : undefined;
                          const stakeholderLabel = getStakeholderRoleLabel(stakeholderType);

                          return (
                            <AccordionItem key={personaKey} value={personaKey}>
                              <AccordionTrigger className='px-2'>
                                <div className='flex flex-col items-start gap-1'>
                                  <div className='flex items-center gap-2'>
                                    <UserCircle2 className='h-4 w-4 text-muted-foreground' />
                                    <span className='text-sm font-medium'>{name}</span>
                                  </div>
                                  <div className='flex flex-wrap gap-1 text-[10px] text-muted-foreground'>
                                    <span>{stakeholderLabel}</span>
                                    {archetype && (
                                      <>
                                        <span className='mx-1'>•</span>
                                        <span>Archetype: {archetype}</span>
                                      </>
                                    )}
                                    {typeof overallConfidence === 'number' && (
                                      <>
                                        <span className='mx-1'>•</span>
                                        <span>
                                          Confidence: {Math.round(overallConfidence * 100)}%
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className='space-y-3 text-xs'>
                                  {description && (
                                    <p className='text-muted-foreground'>{description}</p>
                                  )}
                                  <div className='flex flex-col gap-1'>
                                    {demographicsValue && (
                                      <div>
                                        <span className='font-medium'>Demographics: </span>
                                        <span className='text-muted-foreground'>
                                          {demographicsValue}
                                        </span>
                                      </div>
                                    )}
                                    {goalsValue && (
                                      <div>
                                        <span className='font-medium'>Goals &amp; motivations: </span>
                                        <span className='text-muted-foreground'>
                                          {goalsValue}
                                        </span>
                                      </div>
                                    )}
                                    {challengesValue && (
                                      <div>
                                        <span className='font-medium'>
                                          Challenges &amp; frustrations:{' '}
                                        </span>
                                        <span className='text-muted-foreground'>
                                          {challengesValue}
                                        </span>
                                      </div>
                                    )}
                                    {keyQuoteValue && (
                                      <div>
                                        <span className='font-medium'>Key quote: </span>
                                        <span className='italic text-muted-foreground'>
                                          "{keyQuoteValue}"
                                        </span>
                                      </div>
                                    )}
                                    {patterns.length > 0 && (
                                      <div>
                                        <span className='font-medium text-[11px]'>Patterns: </span>
                                        <div className='mt-1 flex flex-wrap gap-1'>
                                          {patterns.slice(0, 4).map((pattern, idx) => (
                                            <span
                                              key={idx}
                                              className='text-[9px] bg-muted px-1.5 py-0.5 rounded'
                                            >
                                              {pattern}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {primarySimulationProfile && (
                                    <div className='mt-2 p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800'>
                                      <div className='space-y-2'>
                                        <div className='text-[11px] font-semibold text-green-900 dark:text-green-100'>
                                          Simulation persona profile
                                        </div>
                                        <div className='grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]'>
                                          {primarySimAge !== undefined && (
                                            <div>
                                              <span className='font-medium text-muted-foreground'>Age:</span>{' '}
                                              <span className='text-muted-foreground'>{primarySimAge}</span>
                                            </div>
                                          )}
                                          {primarySimDemo?.age_range && (
                                            <div>
                                              <span className='font-medium text-muted-foreground'>Age Range:</span>{' '}
                                              <span className='text-muted-foreground'>{primarySimDemo.age_range}</span>
                                            </div>
                                          )}
                                          {primarySimDemo?.education && (
                                            <div>
                                              <span className='font-medium text-muted-foreground'>Education:</span>{' '}
                                              <span className='text-muted-foreground'>{primarySimDemo.education}</span>
                                            </div>
                                          )}
                                          {primarySimDemo?.location && (
                                            <div>
                                              <span className='font-medium text-muted-foreground'>Location:</span>{' '}
                                              <span className='text-muted-foreground'>{primarySimDemo.location}</span>
                                            </div>
                                          )}
                                          {primarySimDemo?.income_level && (
                                            <div>
                                              <span className='font-medium text-muted-foreground'>Income Level:</span>{' '}
                                              <span className='text-muted-foreground'>{primarySimDemo.income_level}</span>
                                            </div>
                                          )}
                                          {primarySimDemo?.industry_experience && (
                                            <div>
                                              <span className='font-medium text-muted-foreground'>Industry Experience:</span>{' '}
                                              <span className='text-muted-foreground'>{primarySimDemo.industry_experience}</span>
                                            </div>
                                          )}
                                          {primarySimDemo?.company_size && (
                                            <div>
                                              <span className='font-medium text-muted-foreground'>Company Size:</span>{' '}
                                              <span className='text-muted-foreground'>{primarySimDemo.company_size}</span>
                                            </div>
                                          )}
                                        </div>
                                        {primarySimBackground && (
                                          <div className='text-[11px]'>
                                            <span className='font-medium text-muted-foreground'>Background:</span>{' '}
                                            <span className='text-muted-foreground'>{primarySimBackground}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className='mt-2'>
                                    <div className='flex items-center justify-between mb-1'>
                                      <h4 className='text-[11px] font-semibold text-muted-foreground uppercase'>
                                        Interviews that informed this persona
                                      </h4>
                                      <span className='text-[10px] text-muted-foreground'>
                                        {interviewsForPersona.length} interview
                                        {interviewsForPersona.length === 1 ? '' : 's'}
                                      </span>
                                    </div>

                                    {interviewsForPersona.length === 0 ? (
                                      <p className='text-[11px] text-muted-foreground'>
                                        No interviews available for this persona.
                                      </p>
                                    ) : (
                                      <div className='space-y-3'>
                                        {interviewsForPersona.map(
                                          (interview: any, interviewIndex: number) => {
                                            const responses =
                                              (interview['responses'] as Array<{
                                                question: string;
                                                response: string;
                                                sentiment?: string;
                                                key_insights?: string[];
                                              }>) || [];
                                            const overallSentiment = interview['overall_sentiment'];
                                            const keyThemes =
                                              (interview['key_themes'] as string[]) || [];

                                            return (
                                              <div
                                                key={`${personaKey}-interview-${interviewIndex}`}
                                                className='pb-3 border-b last:border-b-0'
                                              >
                                                <div className='flex items-start gap-2 mb-2'>
                                                  <MessageCircle className='mt-0.5 h-4 w-4 text-muted-foreground flex-shrink-0' />
                                                  <div className='flex-1'>
                                                    <div className='font-medium'>
                                                      Interview {interviewIndex + 1}
                                                    </div>
                                                    <div className='flex items-center gap-2 mt-1'>
                                                      {overallSentiment && (
                                                        <Badge
                                                          variant='outline'
                                                          className={`text-[10px] px-1.5 py-0 ${
                                                            typeof overallSentiment === 'string' &&
                                                            overallSentiment
                                                              .toLowerCase()
                                                              .includes('positive')
                                                              ? 'border-green-500 text-green-700'
                                                              : typeof overallSentiment === 'string' &&
                                                                overallSentiment
                                                                  .toLowerCase()
                                                                  .includes('negative')
                                                              ? 'border-red-500 text-red-700'
                                                              : 'border-yellow-500 text-yellow-700'
                                                          }`}
                                                        >
                                                          {String(overallSentiment)}
                                                        </Badge>
                                                      )}
                                                      <span className='text-[10px] text-muted-foreground'>
                                                        {responses.length} Q&amp;A
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>

                                                {keyThemes.length > 0 && (
                                                  <div className='mb-2 pb-2 border-b'>
                                                    <div className='text-[10px] font-medium text-muted-foreground mb-1'>
                                                      Key Themes
                                                    </div>
                                                    <div className='flex flex-wrap gap-1'>
                                                      {keyThemes.slice(0, 3).map((theme, idx) => (
                                                        <span
                                                          key={idx}
                                                          className='text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded'
                                                        >
                                                          {theme}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}

                                                <div className='space-y-2'>
                                                  {responses.map((resp, respIdx) => (
                                                    <div key={respIdx} className='text-[11px]'>
                                                      <div className='font-medium text-foreground mb-0.5'>
                                                        Q: {resp.question}
                                                      </div>
                                                      <div className='text-muted-foreground'>
                                                        A: {resp.response}
                                                      </div>
                                                      {resp.key_insights &&
                                                        resp.key_insights.length > 0 && (
                                                          <div className='mt-1 text-[10px] text-primary'>
                                                            💡 {resp.key_insights[0]}
                                                          </div>
                                                        )}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        },
                      )}
                    </Accordion>
                  )}

                </div>
              </ScrollArea>
              </TabsContent>

              {/* Video Simulation Tab */}
              <TabsContent value="video" className="flex-1 min-h-0 overflow-hidden mt-2">
                <VideoSimulationPanel className="h-full" />
              </TabsContent>

              {/* Industry News Tab */}
              <TabsContent value="news" className="flex-1 min-h-0 overflow-hidden mt-2">
                <ScrollArea className="h-full">
                  <div className="space-y-4 pr-4 pb-4">
                    {/* News Controls */}
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedYear.toString()}
                        onValueChange={(value) => setSelectedYear(parseInt(value))}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 6 }, (_, i) => currentYear - i).map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handleFetchStakeholderNews}
                        disabled={stakeholderNews.isLoading}
                      >
                        <RefreshCw className={`h-3 w-3 mr-1.5 ${stakeholderNews.isLoading ? 'animate-spin' : ''}`} />
                        {hasSearchedNews ? 'Refresh' : 'Fetch News'}
                      </Button>
                    </div>

                    {/* Loading state */}
                    {stakeholderNews.isLoading && (
                      <div className="text-sm text-muted-foreground py-8 text-center">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                        Searching for {scope.businessContext.industry} news in {scope.businessContext.location} ({selectedYear})...
                      </div>
                    )}

                    {/* Error state */}
                    {stakeholderNews.error && (
                      <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                        ⚠️ {stakeholderNews.error}
                      </div>
                    )}

                    {/* News items */}
                    {!stakeholderNews.isLoading && stakeholderNews.newsItems.length > 0 && (
                      <div className="space-y-3">
                        {stakeholderNews.newsItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="text-sm bg-blue-50 p-3 rounded border border-blue-100"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {item.category}
                              </Badge>
                              {item.date && (
                                <span className="text-xs text-muted-foreground">{item.date}</span>
                              )}
                            </div>
                            <p className="font-medium">{item.headline}</p>
                            <p className="text-muted-foreground text-xs mt-1">{item.details}</p>
                          </div>
                        ))}

                        {/* Sources */}
                        {stakeholderNews.sources.length > 0 && (
                          <div className="pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-2">Sources:</p>
                            <div className="flex flex-wrap gap-2">
                              {stakeholderNews.sources.slice(0, 5).map((source, idx) =>
                                source.url ? (
                                  <a
                                    key={idx}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                  >
                                    {source.title}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span key={idx} className="text-xs text-muted-foreground">
                                    {source.title}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Empty state (not yet fetched) */}
                    {!stakeholderNews.isLoading && !hasSearchedNews && (
                      <div className="text-center py-8">
                        <Newspaper className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          Click "Fetch News" to get {scope.businessContext.industry} industry news from {scope.businessContext.location} for the selected year.
                        </p>
                      </div>
                    )}

                    {/* No results state */}
                    {!stakeholderNews.isLoading && hasSearchedNews && stakeholderNews.newsItems.length === 0 && !stakeholderNews.error && (
                      <div className="text-center py-8">
                        <Newspaper className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                          No news found for {scope.businessContext.industry} in {scope.businessContext.location} ({stakeholderNews.year}). Try a different year.
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}

