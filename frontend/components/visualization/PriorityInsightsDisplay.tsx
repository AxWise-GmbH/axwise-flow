'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import type { DetailedAnalysisResult } from '@/types/api';

interface PriorityInsightsDisplayProps {
  analysis: DetailedAnalysisResult;
}

interface PriorityInsight {
  type: 'theme' | 'pattern' | 'insight';
  name: string;
  description: string;
  priority_score: number;
  urgency: 'high' | 'medium' | 'low';
  sentiment: number;
  frequency: number;
  category?: string;
  statements?: string[];
  evidence?: string[];
  // Additional fields for insights
  implication?: string;
  recommendation?: string;
  originalPriority?: 'High' | 'Medium' | 'Low';
}

// Constants for priority calculation (same as backend)
const THEME_SENTIMENT_WEIGHT = 0.7;
const THEME_FREQUENCY_WEIGHT = 0.3;
const PATTERN_SENTIMENT_WEIGHT = 0.6;
const PATTERN_FREQUENCY_WEIGHT = 0.3;
const PATTERN_EVIDENCE_WEIGHT = 0.1;
const HIGH_URGENCY_THRESHOLD = 0.6;
const MEDIUM_URGENCY_THRESHOLD = 0.3;
const DEFAULT_MAX_EVIDENCE_COUNT = 5;

export function PriorityInsightsDisplay({ analysis }: PriorityInsightsDisplayProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Process themes and patterns into priority insights
  const priorityInsights = useMemo(() => {
    const insights: PriorityInsight[] = [];

    // Process themes
    if (analysis.themes) {
      analysis.themes.forEach((theme) => {
        const sentiment = theme.sentiment || 0;
        const frequency = theme.frequency || 0;

        // Calculate priority score for themes
        const sentiment_impact = Math.abs(sentiment) * THEME_SENTIMENT_WEIGHT;
        const frequency_impact = frequency * THEME_FREQUENCY_WEIGHT;
        const priority_score = sentiment_impact + frequency_impact;

        // Determine urgency level
        const urgency = priority_score > HIGH_URGENCY_THRESHOLD ? 'high' :
                       priority_score > MEDIUM_URGENCY_THRESHOLD ? 'medium' : 'low';

        insights.push({
          type: 'theme',
          name: theme.name,
          description: theme.definition || '',
          priority_score: Math.round(priority_score * 100) / 100,
          urgency: urgency as 'high' | 'medium' | 'low',
          sentiment,
          frequency,
          statements: theme.statements || []
        });
      });
    }

    // Process patterns
    if (analysis.patterns) {
      analysis.patterns.forEach((pattern) => {
        const sentiment = pattern.sentiment || 0;
        const frequency = pattern.frequency || 0;
        const evidence = pattern.evidence || [];

        // Calculate priority score for patterns
        const sentiment_impact = Math.abs(sentiment) * PATTERN_SENTIMENT_WEIGHT;
        const frequency_impact = frequency * PATTERN_FREQUENCY_WEIGHT;
        const evidence_impact = Math.min(evidence.length / DEFAULT_MAX_EVIDENCE_COUNT, 1) * PATTERN_EVIDENCE_WEIGHT;
        const priority_score = sentiment_impact + frequency_impact + evidence_impact;

        // Determine urgency level
        const urgency = priority_score > HIGH_URGENCY_THRESHOLD ? 'high' :
                       priority_score > MEDIUM_URGENCY_THRESHOLD ? 'medium' : 'low';

        insights.push({
          type: 'pattern',
          name: pattern.name,
          description: pattern.description || '',
          priority_score: Math.round(priority_score * 100) / 100,
          urgency: urgency as 'high' | 'medium' | 'low',
          sentiment,
          frequency,
          category: pattern.category,
          evidence
        });
      });
    }

    // Process insights
    if (analysis.insights) {
      analysis.insights.forEach((insight) => {
        // Map original priority to numeric score
        const priorityToScore = {
          'High': 0.8,
          'Medium': 0.5,
          'Low': 0.2
        };

        const priority_score = priorityToScore[insight.priority || 'Medium'];

        // Determine urgency level based on original priority
        const urgency = insight.priority === 'High' ? 'high' :
                       insight.priority === 'Medium' ? 'medium' : 'low';

        insights.push({
          type: 'insight',
          name: insight.topic,
          description: insight.observation,
          priority_score,
          urgency: urgency as 'high' | 'medium' | 'low',
          sentiment: 0, // Insights don't have sentiment scores
          frequency: 0, // Insights don't have frequency scores
          evidence: insight.evidence || [],
          implication: insight.implication,
          recommendation: insight.recommendation,
          originalPriority: insight.priority
        });
      });
    }

    // Sort by priority score (descending)
    return insights.sort((a, b) => b.priority_score - a.priority_score);
  }, [analysis]);

  // Filter insights based on active tab
  const filteredInsights = priorityInsights.filter(insight => {
    if (activeTab === 'all') return true;
    return insight.urgency === activeTab;
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const high_count = priorityInsights.filter(i => i.urgency === 'high').length;
    const medium_count = priorityInsights.filter(i => i.urgency === 'medium').length;
    const low_count = priorityInsights.filter(i => i.urgency === 'low').length;

    return { high_count, medium_count, low_count };
  }, [priorityInsights]);

  // Get urgency icon
  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'low':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return null;
    }
  };

  // Get urgency color class
  const getUrgencyColorClass = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
      case 'low':
        return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700';
    }
  };

  // Get type badge
  const getTypeBadge = (type: 'theme' | 'pattern' | 'insight') => {
    const colorClass = type === 'theme'
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'
      : type === 'pattern'
      ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800'
      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';

    return (
      <Badge variant="outline" className={colorClass}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  if (!priorityInsights.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No priority insights available for this analysis.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Priority Insights</CardTitle>
        <CardDescription>
          Actionable insights prioritized by sentiment impact and frequency
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'high' | 'medium' | 'low')}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              All ({priorityInsights.length})
            </TabsTrigger>
            <TabsTrigger value="high">
              High Priority ({metrics.high_count})
            </TabsTrigger>
            <TabsTrigger value="medium">
              Medium ({metrics.medium_count})
            </TabsTrigger>
            <TabsTrigger value="low">
              Low ({metrics.low_count})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {filteredInsights.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No {activeTab !== 'all' ? activeTab + ' priority' : ''} insights found
              </div>
            ) : (
              <div className="space-y-4">
                {filteredInsights.map((insight, index) => (
                  <div
                    key={`${insight.type}-${insight.name}-${index}`}
                    className={`border rounded-lg p-4 ${getUrgencyColorClass(insight.urgency)}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getUrgencyIcon(insight.urgency)}
                        <span className="font-medium capitalize">{insight.urgency} Priority</span>
                        {getTypeBadge(insight.type)}
                        {insight.category && (
                          <Badge variant="outline" className="bg-white dark:bg-slate-800 dark:border-slate-700">
                            {insight.category}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="bg-white dark:bg-slate-800 dark:border-slate-700">
                        Score: {insight.priority_score}
                      </Badge>
                    </div>

                    <h3 className="text-base font-semibold mb-1">{insight.name}</h3>

                    {insight.description && (
                      <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
                    )}

                    {/* Display supporting statements for themes */}
                    {insight.type === 'theme' && insight.statements && insight.statements.length > 0 && (
                      <div className="mt-2 mb-3 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Supporting Statements:</p>
                        <div className="space-y-2">
                          {insight.statements.slice(0, 3).map((statement, i) => (
                            <div key={i} className="relative bg-muted/30 dark:bg-slate-800/50 p-3 rounded-md">
                              <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 dark:bg-primary/40 rounded-l-md"></div>
                              <p className="text-sm text-muted-foreground italic">{statement}</p>
                            </div>
                          ))}
                          {insight.statements.length > 3 && (
                            <p className="text-xs text-muted-foreground">
                              +{insight.statements.length - 3} more statements
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Display evidence for patterns */}
                    {insight.type === 'pattern' && insight.evidence && insight.evidence.length > 0 && (
                      <div className="mt-2 mb-3 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Supporting Evidence:</p>
                        <div className="space-y-2">
                          {insight.evidence.slice(0, 3).map((evidence, i) => (
                            <div key={i} className="relative bg-muted/30 dark:bg-slate-800/50 p-3 rounded-md">
                              <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 dark:bg-primary/40 rounded-l-md"></div>
                              <p className="text-sm text-muted-foreground italic">{evidence}</p>
                            </div>
                          ))}
                          {insight.evidence.length > 3 && (
                            <p className="text-xs text-muted-foreground">
                              +{insight.evidence.length - 3} more evidence
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Display evidence and additional content for insights */}
                    {insight.type === 'insight' && (
                      <div className="mt-2 mb-3 space-y-3">
                        {/* Evidence */}
                        {insight.evidence && insight.evidence.length > 0 && (
                          <div className="pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Supporting Evidence:</p>
                            <div className="space-y-2">
                              {insight.evidence.slice(0, 3).map((evidence, i) => (
                                <div key={i} className="relative bg-muted/30 dark:bg-slate-800/50 p-3 rounded-md">
                                  <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 dark:bg-primary/40 rounded-l-md"></div>
                                  <p className="text-sm text-muted-foreground italic">{evidence}</p>
                                </div>
                              ))}
                              {insight.evidence.length > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  +{insight.evidence.length - 3} more evidence
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Implication */}
                        {insight.implication && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Implication:</p>
                            <p className="text-sm text-amber-800 dark:text-amber-200">{insight.implication}</p>
                          </div>
                        )}

                        {/* Recommendation */}
                        {insight.recommendation && (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                            <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Recommendation:</p>
                            <p className="text-sm text-green-800 dark:text-green-200">{insight.recommendation}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs">
                      {/* Show sentiment and frequency for themes and patterns */}
                      {insight.type !== 'insight' && (
                        <>
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Sentiment:</span>
                            <Badge variant="outline" className={
                              insight.sentiment > 0
                                ? 'bg-green-50 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
                                : (insight.sentiment < 0
                                    ? 'bg-red-50 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                                    : 'bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800')
                            }>
                              {insight.sentiment > 0 ? 'Positive' : (insight.sentiment < 0 ? 'Negative' : 'Neutral')}
                            </Badge>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Frequency:</span>
                            <Badge variant="outline" className="bg-white dark:bg-slate-800 dark:border-slate-700">
                              {Math.round(insight.frequency * 100)}%
                            </Badge>
                          </span>
                        </>
                      )}

                      {/* Show original priority for insights */}
                      {insight.type === 'insight' && insight.originalPriority && (
                        <span className="flex items-center gap-1">
                          <span className="font-medium">Original Priority:</span>
                          <Badge variant="outline" className={
                            insight.originalPriority === 'High'
                              ? 'bg-red-50 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                              : insight.originalPriority === 'Medium'
                              ? 'bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-green-50 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
                          }>
                            {insight.originalPriority}
                          </Badge>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default PriorityInsightsDisplay;
