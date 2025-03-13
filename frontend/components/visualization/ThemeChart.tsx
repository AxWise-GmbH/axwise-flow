'use client';

/**
 * ThemeChart Component
 * 
 * ARCHITECTURAL NOTE: This component is the canonical source for Theme Analysis visualization.
 * It is responsible for rendering:
 * 1. The Key Insights section at the top (including theme insights & recommendations)
 * 2. The searchable list of identified themes
 * 3. The theme details with supporting statements
 * 
 * This component should be used directly by VisualizationTabs.tsx and NOT wrapped by UnifiedVisualization.
 * If using UnifiedVisualization in the future, modify this component to accept a `showKeyInsights` prop.
 */

import React, { useState, useMemo } from 'react';
import { Theme } from '@/types/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface ThemeChartProps {
  themes: Theme[];
  showKeyInsights?: boolean;
}

export function ThemeChart({ themes, showKeyInsights = true }: ThemeChartProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);

  // Filter themes based on search term
  const filteredThemes = themes.filter(theme => 
    theme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (theme.keywords && theme.keywords.some(keyword => 
      keyword.toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );

  // Sort themes by frequency for list view
  const sortedThemes = [...filteredThemes].sort((a, b) => (b.frequency || 0) - (a.frequency || 0));

  // Get sentiment label
  const getSentimentLabel = (sentiment: number | undefined) => {
    if (typeof sentiment !== 'number') return 'Neutral';
    if (sentiment >= 0.1) return 'Positive';
    if (sentiment <= -0.1) return 'Negative';
    return 'Neutral';
  };

  // Generate key insights based on theme analysis
  const getKeyInsights = useMemo(() => {
    if (!themes || themes.length === 0) {
      return ['No themes available for analysis'];
    }

    const insights = [];
    
    // Prepare theme insights with more depth and context
    const sortedTopThemes = [...themes].sort((a, b) => b.frequency - a.frequency);
    const topThemes = sortedTopThemes.slice(0, 3);
    
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
    const totalThemes = themes.length;
    const posThemes = themes.filter(t => typeof t.sentiment === 'number' && t.sentiment >= 0.1).length;
    const neuThemes = themes.filter(t => typeof t.sentiment === 'number' && t.sentiment > -0.1 && t.sentiment < 0.1).length;
    const negThemes = themes.filter(t => typeof t.sentiment === 'number' && t.sentiment <= -0.1).length;
    
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
    const topPosTheme = themes
      .filter(t => typeof t.sentiment === 'number' && t.sentiment >= 0.1)
      .sort((a, b) => b.frequency - a.frequency)[0];
      
    const topNegTheme = themes
      .filter(t => typeof t.sentiment === 'number' && t.sentiment <= -0.1)
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
    
    return insights;
  }, [themes]);

  const getSentimentDescription = (sentiment: number | undefined) => {
    if (typeof sentiment !== 'number') return 'Neutral sentiment in discussions';
    if (sentiment >= 0.1) return 'Positive sentiment in discussions';
    if (sentiment <= -0.1) return 'Negative sentiment in discussions';
    return 'Neutral sentiment in discussions';
  };

  // Get sentiment variant for badge
  const getSentimentVariant = (sentiment: number | undefined) => {
    if (typeof sentiment !== 'number') return 'secondary';
    if (sentiment >= 0.1) return 'secondary';
    if (sentiment <= -0.1) return 'destructive';
    return 'secondary';
  };

  return (
    <div className="space-y-6">
      {/* Key Insights Section */}
      {showKeyInsights && (
        <Card>
          <CardHeader>
            <CardTitle>Key Insights</CardTitle>
            <CardDescription>Significant findings from the theme analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="mb-2">
                <h3 className="text-sm font-medium mb-2">Key Themes</h3>
                <div className="space-y-3">
                  {sortedThemes.slice(0, 3).map((theme, idx) => (
                    <div key={`theme-${theme.id || theme.name}-${idx}`} className="flex gap-3 relative">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium absolute left-0 top-1/2 -translate-y-1/2">
                        {idx + 1}
                      </div>
                      <div className="flex-1 pl-9">
                        <div className={`border rounded-lg p-4 relative ${
                          (typeof theme.sentiment === 'number' && theme.sentiment >= 0.1) ? 'border-green-300 bg-green-50' : 
                          (typeof theme.sentiment === 'number' && theme.sentiment <= -0.1) ? 'border-red-300 bg-red-50' :
                          'border-slate-300 bg-slate-50'
                        } transition-all duration-150`}>
                          <TooltipProvider key={theme.id} delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline"
                                  className="absolute top-3 right-3 cursor-default"
                                >
                                  {Math.round((theme.frequency || 0) * 100)}%
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent 
                                side="left" 
                                className="bg-white dark:bg-slate-900 border shadow-lg p-3"
                                align="center"
                              >
                                <div className="space-y-1">
                                  <h4 className="font-semibold">Theme Frequency</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Appears in {Math.round((theme.frequency || 0) * 100)}% of analyzed content
                                  </p>
                                </div>
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
                              <Badge key={`${theme.id || theme.name}-keyword-${kidx}-${keyword}`} variant="secondary" className="text-xs">
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
              
              <div>
                <h3 className="text-sm font-medium mb-2">Theme Insights</h3>
                <ul className="space-y-2 list-disc pl-5">
                  {getKeyInsights.map((insight, idx) => (
                    <li key={`theme-insight-${idx}`} className="text-sm">{insight}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search themes or keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
          {searchTerm && (
            <p className="text-xs text-muted-foreground mt-1">
              Showing {filteredThemes.length} of {themes.length} themes
            </p>
          )}
        </div>
      </div>

      {/* List View of Themes */}
      <Card>
        <CardHeader>
          <CardTitle>Identified Themes</CardTitle>
          <CardDescription>
            {sortedThemes.length} theme{sortedThemes.length !== 1 ? 's' : ''} found in the analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedThemes.length > 0 ? (
            <Accordion type="multiple" className="w-full">
              {sortedThemes.map((theme) => (
                <AccordionItem key={`theme-${theme.id || theme.name}`} value={`theme-${theme.id || theme.name}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="font-medium text-left flex items-center">
                        {theme.name}
                        {theme.process === 'enhanced' && (
                          <Badge variant="outline" className="ml-2 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 text-xs">
                            Enhanced
                          </Badge>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge 
                                variant={getSentimentVariant(theme.sentiment)}
                                className="cursor-default"
                              >
                                {getSentimentLabel(theme.sentiment)}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent 
                              side="right" 
                              className="bg-white dark:bg-slate-900 border shadow-lg p-3"
                              align="center"
                            >
                              <div className="space-y-1">
                                <h4 className="font-semibold">Sentiment Analysis</h4>
                                <p className="text-sm text-muted-foreground">
                                  {getSentimentDescription(theme.sentiment)}
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          {Math.round((theme.frequency || 0) * 100)}%
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {theme.definition && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Definition:</h4>
                          <p className="text-sm p-2 bg-muted rounded-md">{theme.definition}</p>
                        </div>
                      )}
                    
                      {theme.keywords && theme.keywords.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Keywords:</h4>
                          <div className="flex flex-wrap gap-1">
                            {theme.keywords.map((keyword, i) => (
                              <Badge key={`${theme.id || theme.name}-keyword-${i}-${keyword}`} variant="secondary" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {theme.codes && theme.codes.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Associated Codes:</h4>
                          <div className="flex flex-wrap gap-1">
                            {theme.codes.map((code, i) => (
                              <Badge key={`${theme.id || theme.name}-code-${i}-${code}`} variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                {code}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {theme.reliability !== undefined && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Reliability Score:</h4>
                          <div className="flex items-center">
                            <span className={`text-sm ${
                              theme.reliability >= 0.7 ? 'text-green-600' : 
                              theme.reliability >= 0.5 ? 'text-amber-600' : 
                              'text-red-600'
                            }`}>
                              {(theme.reliability * 100).toFixed(0)}%
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({theme.reliability >= 0.7 ? 'High' : theme.reliability >= 0.5 ? 'Moderate' : 'Low'} agreement between raters)
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {(theme.statements && theme.statements.length > 0) || (theme.examples && theme.examples.length > 0) ? (
                        <div>
                          <span className="text-xs font-semibold uppercase text-muted-foreground bg-muted px-2 py-1 rounded-sm inline-block mb-2">Supporting Statements</span>
                          <div className="rounded-md border p-4">
                            <ul className="space-y-2 text-sm">
                              {theme.statements && theme.statements.map((statement, i) => (
                                <li key={`${theme.id || theme.name}-statement-${i}`} className="relative bg-muted/30 p-3 rounded-md">
                                  <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 rounded-l-md"></div>
                                  <p className="italic text-muted-foreground text-sm">"{statement}"</p>
                                </li>
                              ))}
                              {!theme.statements && theme.examples && theme.examples.map((example, i) => (
                                <li key={`${theme.id || theme.name}-example-${i}`} className="relative bg-muted/30 p-3 rounded-md">
                                  <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 rounded-l-md"></div>
                                  <p className="italic text-muted-foreground text-sm">"{example}"</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No supporting statements available.</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <p className="text-muted-foreground text-center py-4">No themes found</p>
          )}
        </CardContent>
      </Card>

      {/* Theme Details Modal */}
      {selectedTheme && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTheme(null)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="flex items-center">
                      {selectedTheme.name}
                      {selectedTheme.process === 'enhanced' && (
                        <Badge variant="outline" className="ml-2 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                          Enhanced Analysis
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Theme details and supporting evidence</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="percent" 
                    className={`${(selectedTheme.sentiment || 0) > 0.1 
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' 
                      : (selectedTheme.sentiment || 0) < -0.1 
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' 
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'}`}
                  >
                    {(selectedTheme.sentiment || 0) > 0.1 
                      ? 'Positive' 
                      : (selectedTheme.sentiment || 0) < -0.1 
                        ? 'Negative' 
                        : 'Neutral'}
                  </Badge>
                  <Badge variant="percent">
                    Frequency: {Math.round((selectedTheme.frequency || 0) * 100)}%
                  </Badge>
                  {selectedTheme.reliability !== undefined && (
                    <Badge 
                      variant="percent"
                      className={selectedTheme.reliability >= 0.7 
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' 
                        : selectedTheme.reliability >= 0.5 
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' 
                          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}
                    >
                      Reliability: {(selectedTheme.reliability * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
                
                {selectedTheme.definition && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Definition</h4>
                    <p className="text-sm p-2 bg-muted rounded-md">{selectedTheme.definition}</p>
                  </div>
                )}
                
                {selectedTheme.keywords && selectedTheme.keywords.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Keywords</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedTheme.keywords.map((keyword, i) => (
                        <Badge key={`modal-${selectedTheme.id || selectedTheme.name}-keyword-${i}-${keyword}`} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedTheme.codes && selectedTheme.codes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Associated Codes</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedTheme.codes.map((code, i) => (
                        <Badge key={`modal-${selectedTheme.id || selectedTheme.name}-code-${i}-${code}`} variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {(selectedTheme.statements && selectedTheme.statements.length > 0) || (selectedTheme.examples && selectedTheme.examples.length > 0) ? (
                  <div>
                    <span className="text-xs font-semibold uppercase text-muted-foreground bg-muted px-2 py-1 rounded-sm inline-block mb-2">Supporting Statements</span>
                    <div className="rounded-md border p-4">
                      <ul className="space-y-2">
                        {selectedTheme.statements && selectedTheme.statements.map((statement, i) => (
                          <li key={`modal-${selectedTheme.id || selectedTheme.name}-statement-${i}`} className="relative bg-muted/30 p-3 rounded-md">
                            <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 rounded-l-md"></div>
                            <p className="italic text-muted-foreground text-sm">"{statement}"</p>
                          </li>
                        ))}
                        {!selectedTheme.statements && selectedTheme.examples && selectedTheme.examples.map((example, i) => (
                          <li key={`modal-${selectedTheme.id || selectedTheme.name}-example-${i}`} className="relative bg-muted/30 p-3 rounded-md">
                            <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 rounded-l-md"></div>
                            <p className="italic text-muted-foreground text-sm">"{example}"</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No supporting statements available.</p>
                )}
                
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" onClick={() => setSelectedTheme(null)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThemeChart;