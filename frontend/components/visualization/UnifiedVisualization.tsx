'use client';

/**
 * UnifiedVisualization Component
 * 
 * DEPRECATION WARNING: This component is being phased out in favor of the VisualizationTabs approach.
 * It should NOT be used for new development. The current architectural decision is to use:
 * - VisualizationTabs component as the container
 * - Individual visualization components (ThemeChart, PatternList, etc.) directly
 * 
 * This component creates duplicate UI elements when used with the newer implementation
 * where each specific visualization component (e.g., ThemeChart) now includes its own
 * Key Insights section.
 * 
 * For new routes or features, please use VisualizationTabs instead.
 */

import React, { useMemo } from 'react';
import { Theme, Pattern, SentimentData, SentimentStatements, Persona } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeChart } from './ThemeChart';
import PatternList from './PatternList';
import PersonaList from './PersonaList';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface UnifiedVisualizationProps {
  type: 'themes' | 'patterns' | 'sentiment' | 'personas';
  themesData?: Theme[];
  patternsData?: Pattern[];
  personasData?: Persona[];
  sentimentData?: {
    overview: { positive: number; neutral: number; negative: number };
    details?: SentimentData[];
    statements?: SentimentStatements;
  };
  className?: string;
}

const UnifiedVisualization: React.FC<UnifiedVisualizationProps> = ({
  type,
  themesData = [],
  patternsData = [],
  personasData = [],
  sentimentData = { overview: { positive: 0.33, neutral: 0.34, negative: 0.33 } },
  className,
}) => {
  // Prepare sentiment data for SentimentGraph component
  const sentimentGraphData = useMemo(() => {
    return {
      data: sentimentData.overview,
      detailedData: sentimentData.details || [],
      supportingStatements: sentimentData.statements || { positive: [], neutral: [], negative: [] }
    };
  }, [sentimentData]);

  // Generate key insights based on visualization type
  const getKeyInsights = () => {
    const insights = [];
    
    if (type === 'themes' && themesData.length > 0) {
      // Prepare theme insights with more depth and context
      const sortedThemes = [...themesData].sort((a, b) => b.frequency - a.frequency);
      const topThemes = sortedThemes.slice(0, 3);
      
      // Add more descriptive top themes insight with percentages
      insights.push(`Top themes: ${topThemes.map(t => 
        `${t.name} (${Math.round(t.frequency * 100)}%)`).join(', ')}`);
      
      // Add theme clustering insight if applicable
      if (topThemes.length >= 2) {
        const topKeywords = topThemes.flatMap(t => t.keywords || []).slice(0, 5);
        if (topKeywords.length > 0) {
          insights.push(`Key topics discussed: ${topKeywords.join(', ')}`);
        }
      }
      
      // Add sentiment distribution of themes with percentages
      const totalThemes = themesData.length;
      const posThemes = themesData.filter(t => typeof t.sentiment === 'string' && t.sentiment === 'positive').length;
      const neuThemes = themesData.filter(t => typeof t.sentiment === 'string' && t.sentiment === 'neutral').length;
      const negThemes = themesData.filter(t => typeof t.sentiment === 'string' && t.sentiment === 'negative').length;
      
      if (totalThemes > 0) {
        const posPercent = Math.round((posThemes / totalThemes) * 100);
        const neuPercent = Math.round((neuThemes / totalThemes) * 100);
        const negPercent = Math.round((negThemes / totalThemes) * 100);
        
        // Add sentiment overview with a more insightful message
        if (posThemes > negThemes && posThemes > neuThemes) {
          insights.push(`Overall positive theme sentiment (${posPercent}% of themes)`);
        } else if (negThemes > posThemes && negThemes > neuThemes) {
          insights.push(`Overall negative theme sentiment (${negPercent}% of themes)`);
        } else if (neuThemes > posThemes && neuThemes > negThemes) {
          insights.push(`Overall neutral theme sentiment (${neuPercent}% of themes)`);
        } else {
          insights.push(`Mixed theme sentiment distribution`);
        }
      }
      
      // Add specific insights for top positive and negative themes if they exist
      const topPosTheme = themesData
        .filter(t => typeof t.sentiment === 'string' && t.sentiment === 'positive')
        .sort((a, b) => b.frequency - a.frequency)[0];
        
      const topNegTheme = themesData
        .filter(t => typeof t.sentiment === 'string' && t.sentiment === 'negative')
        .sort((a, b) => b.frequency - a.frequency)[0];
      
      if (topPosTheme) {
        insights.push(`Most prevalent positive theme: ${topPosTheme.name}`);
      }
      
      if (topNegTheme) {
        insights.push(`Most prevalent negative theme: ${topNegTheme.name}`);
      }
      
      // Add actionable recommendation based on theme analysis
      if (topNegTheme && topNegTheme.frequency > 0.2) {
        insights.push(`Recommended focus area: Address concerns related to "${topNegTheme.name}"`);
      } else if (topPosTheme && topPosTheme.frequency > 0.2) {
        insights.push(`Recommended strategy: Build upon strengths in "${topPosTheme.name}"`);
      }
    }
    
    if (type === 'patterns' && patternsData.length > 0) {
      // Prepare pattern insights
      const sortedPatterns = [...patternsData].sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
      const topPatterns = sortedPatterns.slice(0, 3);
      
      insights.push(`Top patterns: ${topPatterns.map(p => p.description).join(', ')}`);
      
      // Add sentiment distribution of patterns - fixing type checking
      const posPatterns = patternsData.filter(p => typeof p.sentiment === 'string' && p.sentiment === 'positive').length;
      const neuPatterns = patternsData.filter(p => typeof p.sentiment === 'string' && p.sentiment === 'neutral').length;
      const negPatterns = patternsData.filter(p => typeof p.sentiment === 'string' && p.sentiment === 'negative').length;
      
      if (posPatterns > 0) {
        insights.push(`${posPatterns} positive patterns identified`);
      }
      if (neuPatterns > 0) {
        insights.push(`${neuPatterns} neutral patterns identified`);
      }
      if (negPatterns > 0) {
        insights.push(`${negPatterns} negative patterns identified`);
      }
    }
    
    if (type === 'sentiment') {
      // Prepare sentiment insights
      const { positive, neutral, negative } = sentimentData.overview;
      const dominantSentiment = Math.max(positive, neutral, negative);
      
      if (dominantSentiment === positive) {
        insights.push('Overall positive sentiment in the interview');
      } else if (dominantSentiment === negative) {
        insights.push('Overall negative sentiment in the interview');
      } else {
        insights.push('Overall neutral sentiment in the interview');
      }
      
      insights.push(`${Math.round(positive * 100)}% positive expressions`);
      insights.push(`${Math.round(neutral * 100)}% neutral expressions`);
      insights.push(`${Math.round(negative * 100)}% negative expressions`);
      
      if (sentimentData.statements) {
        const { positive: posStmts, neutral: neuStmts, negative: negStmts } = sentimentData.statements;
        insights.push(`${posStmts.length} positive statements, ${neuStmts.length} neutral statements, ${negStmts.length} negative statements`);
      }
    }
    
    if (type === 'personas' && personasData.length > 0) {
      // Prepare persona insights
      insights.push(`${personasData.length} distinct personas identified`);
      
      // Add info about top responsibilities and pain points
      const allResponsibilities = personasData.flatMap(p => 
        p.key_responsibilities?.value ? [p.key_responsibilities.value] : []
      );
      
      const allPainPoints = personasData.flatMap(p => 
        p.pain_points?.value ? [p.pain_points.value] : []
      );
      
      if (allResponsibilities.length > 0) {
        insights.push(`Key responsibilities include: ${allResponsibilities[0]}`);
      }
      
      if (allPainPoints.length > 0) {
        insights.push(`Main pain points: ${allPainPoints[0]}`);
      }
    }
    
    return insights.length > 0 ? insights : ['No key insights available for this analysis'];
  };

  // Render the Key Insights component
  const KeyFindings = () => {
    const insights = getKeyInsights();
    
    // For patterns, we want to format top patterns differently
    if (type === 'patterns' && patternsData.length > 0) {
      const sortedPatterns = [...patternsData].sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
      const topPatterns = sortedPatterns.slice(0, 3);
      const otherInsights = insights.filter(insight => !insight.startsWith('Top patterns:'));

      return (
        <div className="space-y-4">
          <div className="mb-2">
            <h3 className="text-sm font-medium mb-2">Top Behavior Patterns</h3>
            <div className="space-y-3">
              {topPatterns.map((pattern, idx) => (
                <div key={idx} className="flex gap-3 relative">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium absolute left-0 top-1/2 -translate-y-1/2">
                    {idx + 1}
                  </div>
                  <div className="flex-1 pl-9">
                    <div className={`border rounded-lg p-4 relative ${
                      (pattern.sentiment !== undefined && pattern.sentiment >= 0.2) ? 'border-green-300 bg-green-50' : 
                      (pattern.sentiment !== undefined && pattern.sentiment <= -0.2) ? 'border-red-300 bg-red-50' :
                      'border-slate-300 bg-slate-50'
                    } transition-all duration-150`}>
                      {pattern.category && (
                        <Badge variant="outline" className="mb-1">
                          {pattern.category}
                        </Badge>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="absolute top-3 right-3 cursor-help">
                              {Math.round((pattern.frequency || 0) * 100)}%
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p>Confidence score: How strongly this pattern is represented in the interview</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <div className="relative pr-4">
                        {pattern.description !== pattern.name && (
                          <p className="text-sm leading-relaxed font-medium">
                            {pattern.name}
                          </p>
                        )}
                        {pattern.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {pattern.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {otherInsights.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Additional Insights</h3>
              <ul className="space-y-2 list-disc pl-5">
                {otherInsights.map((insight, idx) => (
                  <li key={idx} className="text-sm">{insight}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    
    // For theme visualization, use structured format similar to patterns
    if (type === 'themes' && themesData.length > 0) {
      const sortedThemes = [...themesData].sort((a, b) => b.frequency - a.frequency);
      const topThemes = sortedThemes.slice(0, 3);
      // Remove the top themes insight to display it differently
      const otherInsights = insights.filter(insight => !insight.startsWith('Top themes:'));
      
      return (
        <div className="space-y-4">
          <div className="mb-2">
            <h3 className="text-sm font-medium mb-2">Key Themes</h3>
            <div className="space-y-3">
              {topThemes.map((theme, idx) => (
                <div key={idx} className="flex gap-3 relative">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium absolute left-0 top-1/2 -translate-y-1/2">
                    {idx + 1}
                  </div>
                  <div className="flex-1 pl-9">
                    <div className={`border rounded-lg p-4 relative ${
                      (typeof theme.sentiment === 'string' && theme.sentiment === 'positive') ? 'border-green-300 bg-green-50' : 
                      (typeof theme.sentiment === 'string' && theme.sentiment === 'negative') ? 'border-red-300 bg-red-50' :
                      'border-slate-300 bg-slate-50'
                    } transition-all duration-150`}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="absolute top-3 right-3 cursor-help">
                              {Math.round(theme.frequency * 100)}%
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p>Frequency: How often this theme appears in the interview</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <div className="relative pr-4">
                        <p className="text-sm leading-relaxed font-medium">
                          {theme.name}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(theme.keywords || []).slice(0, 5).map((keyword, kidx) => (
                          <Badge key={kidx} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {otherInsights.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Theme Insights</h3>
              <ul className="space-y-2 list-disc pl-5">
                {otherInsights.map((insight, idx) => (
                  <li key={idx} className="text-sm">{insight}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    
    // For other visualization types, keep the existing format
    return (
      <ul className="space-y-2 list-disc pl-5">
        {insights.map((insight, idx) => (
          <li key={idx} className="text-sm">{insight}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header section with visualization type */}
      <div className="flex flex-col space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          {type === 'themes' 
            ? 'Theme Analysis' 
            : type === 'patterns' 
              ? 'Pattern Analysis' 
              : type === 'sentiment' 
                ? 'Sentiment Analysis' 
                : 'Persona Analysis'}
        </h2>
        <p className="text-muted-foreground">
          {type === 'themes' 
            ? 'Key themes and insights from the interview' 
            : type === 'patterns' 
              ? 'Recurring patterns in user responses' 
              : type === 'sentiment' 
                ? 'Sentiment analysis of interview responses' 
                : 'User personas derived from the interview'}
        </p>
      </div>

      {/* Key Insights Card at the top */}
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Key Insights</CardTitle>
          <CardDescription>
            Significant findings from the {
              type === 'themes' ? 'theme' : 
              type === 'patterns' ? 'pattern' : 
              type === 'sentiment' ? 'sentiment' : 'persona'
            } analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeyFindings />
        </CardContent>
      </Card>

      {/* Visualization Content Below */}
      <div className="w-full">
        {/* Render the appropriate visualization based on type */}
        {type === 'themes' ? (
          <ThemeChart themes={themesData} showKeyInsights={false} />
        ) : type === 'patterns' ? (
          <PatternList patterns={patternsData} />
        ) : type === 'sentiment' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Positive Sentiment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center text-2xl font-bold text-green-500">
                  {Math.round(sentimentGraphData.data.positive * 100)}%
                </div>
                {sentimentGraphData.supportingStatements.positive.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium">Supporting Statements:</h4>
                    <ul className="space-y-2 list-disc pl-5 mt-2">
                      {sentimentGraphData.supportingStatements.positive.slice(0, 3).map((stmt, idx) => (
                        <li key={idx} className="text-sm">{stmt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Neutral Sentiment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center text-2xl font-bold text-slate-500">
                  {Math.round(sentimentGraphData.data.neutral * 100)}%
                </div>
                {sentimentGraphData.supportingStatements.neutral.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium">Supporting Statements:</h4>
                    <ul className="space-y-2 list-disc pl-5 mt-2">
                      {sentimentGraphData.supportingStatements.neutral.slice(0, 3).map((stmt, idx) => (
                        <li key={idx} className="text-sm">{stmt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Negative Sentiment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center text-2xl font-bold text-red-500">
                  {Math.round(sentimentGraphData.data.negative * 100)}%
                </div>
                {sentimentGraphData.supportingStatements.negative.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium">Supporting Statements:</h4>
                    <ul className="space-y-2 list-disc pl-5 mt-2">
                      {sentimentGraphData.supportingStatements.negative.slice(0, 3).map((stmt, idx) => (
                        <li key={idx} className="text-sm">{stmt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">User Personas</CardTitle>
              <CardDescription>Detailed user profiles generated from interview data</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <PersonaList personas={personasData} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UnifiedVisualization;