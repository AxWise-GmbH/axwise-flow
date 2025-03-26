'use client';

import React, { useMemo, useState } from 'react';
import { SentimentOverview, SentimentData, Theme } from '@/types/api';
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * Props for the SentimentGraph component
 */
interface SentimentGraphProps {
  /** The sentiment overview data to visualize */
  data: SentimentOverview;
  /** Detailed sentiment data (optional) - used for showing sentiment trends */
  detailedData?: SentimentData[];
  /** Supporting statements for each sentiment category */
  supportingStatements?: {
    positive: string[];
    neutral: string[];
    negative: string[];
    industry?: string;
  };
  /** The height of the chart (default: 300) */
  height?: number;
  /** Whether to show the legend (default: false) */
  showLegend?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Whether to show statements (default: true) */
  showStatements?: boolean;
  /** Alternative prop name for data to match VisualizationTabs component */
  sentimentData?: SentimentOverview;
  /** Industry context detected for the analysis */
  industry?: string;
  /** Themes for connecting sentiment to topics */
  themes?: Theme[];
}

/**
 * Color scale for sentiment values
 */
const SENTIMENT_COLORS = {
  positive: '#22c55e', // green-500
  neutral: '#64748b', // slate-500
  negative: '#ef4444', // red-500
};

/**
 * Default sentiment values
 */
const DEFAULT_SENTIMENT = {
  positive: 0.33,
  neutral: 0.34,
  negative: 0.33,
};

/**
 * Simplified component for visualizing sentiment data with a focus on actionable insights
 */
export const SentimentGraph: React.FC<SentimentGraphProps> = ({
  data,
  detailedData = [],
  supportingStatements = { positive: [], neutral: [], negative: [] },
  height = 300,
  showLegend = false,
  showStatements = true,
  className,
  sentimentData,
  industry,
  themes = [],
}) => {
  // Use sentimentData prop if provided, otherwise fall back to data prop
  const actualData = sentimentData || data;
  
  // Get industry from props or from supporting statements
  const detectedIndustry = industry || supportingStatements?.industry;
  
  // State for currently selected sentiment filter and search
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Validate and normalize sentiment data
  const sentimentValues = useMemo(() => {
    try {
      // Check if data is undefined or has invalid values
      if (!actualData || 
          typeof actualData.positive !== 'number' || 
          typeof actualData.neutral !== 'number' || 
          typeof actualData.negative !== 'number') {
        return DEFAULT_SENTIMENT;
      }

      // Normalize values to ensure they sum to 1
      const total = actualData.positive + actualData.neutral + actualData.negative;
      if (total === 0) {
        return DEFAULT_SENTIMENT;
      }

      if (Math.abs(total - 1) > 0.01) { // Allow for small floating-point differences
        return {
          positive: actualData.positive / total,
          neutral: actualData.neutral / total,
          negative: actualData.negative / total,
        };
      }

      return actualData;
    } catch (error) {
      console.error('Error processing sentiment data:', error);
      return DEFAULT_SENTIMENT;
    }
  }, [actualData]);
  
  // Calculate percentages for display
  const positivePercent = Math.round(sentimentValues.positive * 100);
  const neutralPercent = Math.round(sentimentValues.neutral * 100);
  const negativePercent = Math.round(sentimentValues.negative * 100);

  // Format data for horizontal bar chart
  const barData = useMemo(() => [
    { name: 'Sentiment Distribution', positive: positivePercent, neutral: neutralPercent, negative: negativePercent }
  ], [positivePercent, neutralPercent, negativePercent]);

  // Group statements by topic if themes are available
  const topicGroupedStatements = useMemo(() => {
    if (!themes || themes.length === 0) {
      return {
        positive: supportingStatements.positive.map(s => ({ statement: s, topic: 'General', intensity: 1 })),
        neutral: supportingStatements.neutral.map(s => ({ statement: s, topic: 'General', intensity: 0 })),
        negative: supportingStatements.negative.map(s => ({ statement: s, topic: 'General', intensity: -1 })),
      };
    }
    
    // Try to match statements to themes
    const matchStatementToTheme = (statement: string) => {
      // First try exact keyword matches
      for (const theme of themes) {
        if (!theme.keywords) continue;
        
        for (const keyword of theme.keywords) {
          if (statement.toLowerCase().includes(keyword.toLowerCase())) {
            return theme.name;
          }
        }
      }
      
      // If no keyword match, try fuzzy matching with the theme name
      for (const theme of themes) {
        if (statement.toLowerCase().includes(theme.name.toLowerCase())) {
          return theme.name;
        }
      }
      
      return 'General';
    };
    
    return {
      positive: supportingStatements.positive.map(s => ({ 
        statement: s, 
        topic: matchStatementToTheme(s),
        intensity: 1,
      })),
      neutral: supportingStatements.neutral.map(s => ({ 
        statement: s, 
        topic: matchStatementToTheme(s),
        intensity: 0,
      })),
      negative: supportingStatements.negative.map(s => ({ 
        statement: s, 
        topic: matchStatementToTheme(s),
        intensity: -1,
      })),
    };
  }, [supportingStatements, themes]);
  
  // Filter statements based on search term and sentiment filter
  const filteredStatements = useMemo(() => {
    type StatementWithType = {
      statement: string;
      topic: string;
      intensity: number;
      type: 'positive' | 'neutral' | 'negative';
    };
    
    let statements: StatementWithType[] = [];
    
    if (sentimentFilter === 'all' || sentimentFilter === 'positive') {
      statements = [...statements, ...topicGroupedStatements.positive.map(s => ({
        ...s,
        type: 'positive' as const
      }))];
    }
    
    if (sentimentFilter === 'all' || sentimentFilter === 'neutral') {
      statements = [...statements, ...topicGroupedStatements.neutral.map(s => ({
        ...s,
        type: 'neutral' as const
      }))];
    }
    
    if (sentimentFilter === 'all' || sentimentFilter === 'negative') {
      statements = [...statements, ...topicGroupedStatements.negative.map(s => ({
        ...s,
        type: 'negative' as const
      }))];
    }
    
    if (searchTerm.trim() === '') return statements;
    
    return statements.filter(s => 
      s.statement.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.topic.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [topicGroupedStatements, sentimentFilter, searchTerm]);
  
  // Group the filtered statements by topic
  const statementsByTopic = useMemo(() => {
    const topics: Record<string, typeof filteredStatements> = {};
    
    for (const statement of filteredStatements) {
      if (!topics[statement.topic]) {
        topics[statement.topic] = [];
      }
      
      topics[statement.topic].push(statement);
    }
    
    // Sort topics by number of statements
    return Object.entries(topics)
      .sort(([_, statementsA], [__, statementsB]) => statementsB.length - statementsA.length)
      .map(([topic, statements]) => ({
        topic,
        statements,
        count: statements.length,
      }));
  }, [filteredStatements]);
  
  // Generate key insights based on sentiment analysis
  const keyInsights = useMemo(() => {
    const insights: string[] = [];
    
    // Overall sentiment distribution
    insights.push(`Overall sentiment is ${positivePercent}% positive, ${neutralPercent}% neutral, and ${negativePercent}% negative.`);
    
    // Most prevalent topics in positive statements
    const positiveTopics = [...new Set(topicGroupedStatements.positive.map(s => s.topic))];
    if (positiveTopics.length > 0 && positiveTopics[0] !== 'General') {
      insights.push(`Positive sentiment is most associated with: ${positiveTopics.slice(0, 3).join(', ')}.`);
    }
    
    // Most prevalent topics in negative statements
    const negativeTopics = [...new Set(topicGroupedStatements.negative.map(s => s.topic))];
    if (negativeTopics.length > 0 && negativeTopics[0] !== 'General') {
      insights.push(`Negative sentiment is most associated with: ${negativeTopics.slice(0, 3).join(', ')}.`);
    }
    
    // If we have an industry context
    if (detectedIndustry) {
      insights.push(`Analysis was performed with ${detectedIndustry} industry context.`);
    }
    
    return insights;
  }, [positivePercent, neutralPercent, negativePercent, topicGroupedStatements, detectedIndustry]);
  
  // Render the copy button for a statement
  const renderCopyButton = (text: string) => {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          navigator.clipboard.writeText(text);
          // Could add a toast notification here
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-copy">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
      </Button>
    );
  };
  
  // Add helper methods for statement filtering and grouping
  const isLowQualityStatement = (statement: string): boolean => {
    // Filter out statements that are likely meaningless
    if (statement.length < 10) return true; // Too short
    
    // Filter out statements ending with ellipsis
    if (statement.trim().endsWith('...')) return true;
    
    // Filter common conversation fillers
    const fillers = [
      'yeah', 'like', 'so', 'you know', 'I mean', 'basically', 'just', 
      'and...', 'or...', 'whatnot', 'blah', 'etc', 'yeah yeah'
    ];
    
    if (fillers.some(filler => 
      statement.toLowerCase().trim() === filler || 
      statement.toLowerCase().startsWith(`${filler}.`) ||
      statement.toLowerCase().startsWith(`${filler},`)
    )) return true;
    
    // Filter statements that are just acknowledgments
    const acknowledgments = [
      'uh-huh', 'mhm', 'right', 'okay', 'sure', 'nice', 'cool', 'great', 'exactly',
      'yeah you\'re right', 'yeah, right', 'you\'re right', 'that\'s right',
      'sounds good', 'that sounds good', 'sounds nice', 'for sure'
    ];
    
    if (acknowledgments.some(ack => statement.toLowerCase().trim() === ack)) return true;
    
    // Sentence fragments that don't convey complete thoughts
    if (statement.split(' ').length <= 3 && !statement.includes('.')) return true;
    
    return false;
  };
  
  const getHighQualityStatements = () => {
    // Only keep statements that pass quality filters
    return filteredStatements.filter(s => !isLowQualityStatement(s.statement));
  };
  
  const getHighQualityStatementsForType = (type: 'positive' | 'neutral' | 'negative') => {
    // Return filtered statements by sentiment type
    return filteredStatements
      .filter(s => s.type === type && !isLowQualityStatement(s.statement))
      .slice(0, 10); // Limit to 10 per category
  };
  
  return (
    <div className={className}>
      {/* Industry Context Badge */}
      {detectedIndustry && (
        <div className="flex items-center mb-4">
          <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-800 hover:bg-blue-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-building-2">
              <path d="M6 22V2a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v20"/>
              <path d="M2 11V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9"/>
              <path d="M18 22V6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v16"/>
              <path d="M4 22H2"/>
              <path d="M10 22H8"/>
              <path d="M16 22h-2"/>
              <path d="M22 22h-2"/>
            </svg>
            Industry: {detectedIndustry.charAt(0).toUpperCase() + detectedIndustry.slice(1)}
          </Badge>
        </div>
      )}
      
      {/* Sentiment Distribution Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Key Insights Section */}
            <div className="mb-2">
              <h3 className="text-sm font-medium mb-2">Key Insights</h3>
              <ul className="space-y-1 list-disc pl-5">
                {keyInsights.map((insight, idx) => (
                  <li key={`insight-${idx}`} className="text-sm text-muted-foreground">{insight}</li>
                ))}
              </ul>
            </div>
            
            {/* Horizontal Stacked Bar Chart */}
            <div className="mt-2">
              <h3 className="text-sm font-medium mb-2">Sentiment Distribution</h3>
              <div className="h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={barData}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    barSize={24}
                  >
                    <XAxis type="number" domain={[0, 100]} hide />
                    <Tooltip
                      formatter={(value: any, name: any) => [`${value}%`, typeof name === 'string' ? name.charAt(0).toUpperCase() + name.slice(1) : name]}
                      cursor={false}
                    />
                    <Bar
                      dataKey="positive"
                      stackId="sentiment"
                      fill={SENTIMENT_COLORS.positive}
                      radius={[4, 0, 0, 4]}
                    >
                      <LabelList 
                        dataKey="positive" 
                        position="center" 
                        fill="#fff" 
                        formatter={(value: number) => (value >= 15 ? `${value}%` : '')} 
                      />
                    </Bar>
                    <Bar 
                      dataKey="neutral" 
                      stackId="sentiment" 
                      fill={SENTIMENT_COLORS.neutral}
                    >
                      <LabelList 
                        dataKey="neutral" 
                        position="center" 
                        fill="#fff" 
                        formatter={(value: number) => (value >= 15 ? `${value}%` : '')} 
                      />
                    </Bar>
                    <Bar 
                      dataKey="negative" 
                      stackId="sentiment" 
                      fill={SENTIMENT_COLORS.negative}
                      radius={[0, 4, 4, 0]}
                    >
                      <LabelList 
                        dataKey="negative" 
                        position="center" 
                        fill="#fff" 
                        formatter={(value: number) => (value >= 15 ? `${value}%` : '')} 
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-2">
                <div className="flex items-center text-xs">
                  <div className="w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: SENTIMENT_COLORS.positive }}></div>
                  <span>Positive ({positivePercent}%)</span>
                </div>
                <div className="flex items-center text-xs">
                  <div className="w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: SENTIMENT_COLORS.neutral }}></div>
                  <span>Neutral ({neutralPercent}%)</span>
                </div>
                <div className="flex items-center text-xs">
                  <div className="w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: SENTIMENT_COLORS.negative }}></div>
                  <span>Negative ({negativePercent}%)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Statements Section */}
      {showStatements && (
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row justify-between mb-4 gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search statements..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Tabs 
              defaultValue="all" 
              className="w-full sm:w-auto"
              onValueChange={(value) => setSentimentFilter(value as any)}
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="positive" className="text-green-600">Positive</TabsTrigger>
                <TabsTrigger value="neutral" className="text-slate-600">Neutral</TabsTrigger>
                <TabsTrigger value="negative" className="text-red-600">Negative</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* Results summary */}
          <div className="text-sm text-muted-foreground mb-3">
            {searchTerm && filteredStatements.length > 0 ? (
              <span>Found {filteredStatements.length} statements matching "{searchTerm}"</span>
            ) : searchTerm ? (
              <span>No statements found matching "{searchTerm}"</span>
            ) : (
              <span>Showing {getHighQualityStatements().length} meaningful statements {sentimentFilter !== 'all' ? `(${sentimentFilter} only)` : ''}</span>
            )}
          </div>
          
          {/* 3-Column Layout for Statements */}
          {sentimentFilter === 'all' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Positive Statements */}
              <div className="border rounded-md p-4" style={{ borderColor: SENTIMENT_COLORS.positive, backgroundColor: `${SENTIMENT_COLORS.positive}10` }}>
                <h3 className="font-medium mb-3" style={{ color: SENTIMENT_COLORS.positive }}>
                  Positive Statements
                </h3>
                <div className="space-y-2">
                  {getHighQualityStatementsForType('positive').map((item, index) => (
                    <div 
                      key={`positive-statement-${index}`}
                      className="flex gap-2 items-start p-2 rounded-sm"
                    >
                      <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0 bg-green-500" />
                      <div className="flex-1 text-sm">{item.statement}</div>
                      <div className="flex-shrink-0">
                        {renderCopyButton(item.statement)}
                      </div>
                    </div>
                  ))}
                  {getHighQualityStatementsForType('positive').length === 0 && (
                    <div className="text-sm text-muted-foreground italic">No positive statements found</div>
                  )}
                </div>
              </div>
              
              {/* Neutral Statements */}
              <div className="border rounded-md p-4" style={{ borderColor: SENTIMENT_COLORS.neutral, backgroundColor: `${SENTIMENT_COLORS.neutral}10` }}>
                <h3 className="font-medium mb-3" style={{ color: SENTIMENT_COLORS.neutral }}>
                  Neutral Statements
                </h3>
                <div className="space-y-2">
                  {getHighQualityStatementsForType('neutral').map((item, index) => (
                    <div 
                      key={`neutral-statement-${index}`}
                      className="flex gap-2 items-start p-2 rounded-sm"
                    >
                      <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0 bg-slate-500" />
                      <div className="flex-1 text-sm">{item.statement}</div>
                      <div className="flex-shrink-0">
                        {renderCopyButton(item.statement)}
                      </div>
                    </div>
                  ))}
                  {getHighQualityStatementsForType('neutral').length === 0 && (
                    <div className="text-sm text-muted-foreground italic">No neutral statements found</div>
                  )}
                </div>
              </div>
              
              {/* Negative Statements */}
              <div className="border rounded-md p-4" style={{ borderColor: SENTIMENT_COLORS.negative, backgroundColor: `${SENTIMENT_COLORS.negative}10` }}>
                <h3 className="font-medium mb-3" style={{ color: SENTIMENT_COLORS.negative }}>
                  Negative Statements
                </h3>
                <div className="space-y-2">
                  {getHighQualityStatementsForType('negative').map((item, index) => (
                    <div 
                      key={`negative-statement-${index}`}
                      className="flex gap-2 items-start p-2 rounded-sm"
                    >
                      <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0 bg-red-500" />
                      <div className="flex-1 text-sm">{item.statement}</div>
                      <div className="flex-shrink-0">
                        {renderCopyButton(item.statement)}
                      </div>
                    </div>
                  ))}
                  {getHighQualityStatementsForType('negative').length === 0 && (
                    <div className="text-sm text-muted-foreground italic">No negative statements found</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // When a specific sentiment is selected, show it in the topic-grouped view
            <div className="space-y-4 mb-6">
              {statementsByTopic.length > 0 ? (
                statementsByTopic.map((topicGroup) => (
                  <Collapsible key={topicGroup.topic} defaultOpen={true}>
                    <div className="border rounded-md">
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{topicGroup.topic}</h3>
                          <Badge variant="outline">{topicGroup.count}</Badge>
                        </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="chevron"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 space-y-1">
                          {topicGroup.statements.map((item, index) => (
                            <div 
                              key={`${topicGroup.topic}-statement-${index}`}
                              className={`p-2 rounded-sm flex gap-2 items-start ${
                                item.type === 'positive' 
                                  ? 'bg-green-50' 
                                  : item.type === 'negative' 
                                    ? 'bg-red-50' 
                                    : 'bg-slate-50'
                              }`}
                            >
                              <div 
                                className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                                  item.type === 'positive' 
                                    ? 'bg-green-500' 
                                    : item.type === 'negative' 
                                      ? 'bg-red-500' 
                                      : 'bg-slate-500'
                                }`}
                              />
                              <div className="flex-1 text-sm">{item.statement}</div>
                              <div className="flex-shrink-0">
                                {renderCopyButton(item.statement)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))
              ) : (
                <div className="text-center p-6 border border-dashed rounded-md">
                  <p className="text-muted-foreground">No statements found</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SentimentGraph;