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

import React, { useState } from 'react';
import { AnalyzedTheme } from '@/types/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ThemeChartProps {
  themes: AnalyzedTheme[];
}

export function ThemeChart({ themes }: ThemeChartProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<AnalyzedTheme | null>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Focus the modal when it opens
  React.useEffect(() => {
    if (selectedTheme && modalRef.current) {
      modalRef.current.focus();
    }
  }, [selectedTheme]);

  // Themes data received via props

  // Filter themes based on search term
  const filteredThemes = themes.filter(theme =>
    theme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (theme.keywords && theme.keywords.some((keyword: string) =>
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

  // Helper function for rendering theme values with better handling of missing data
  const renderThemeValue = (value: any, fallback: string = "Not available"): React.ReactNode => {
    if (value === undefined || value === null) {
      return <span className="text-muted-foreground text-sm italic">{fallback}</span>;
    }

    if (typeof value === 'string') {
      // Split string into sentences for list items if it contains periods
      // Only split if there are multiple sentences ending with a period followed by a space
      const sentences = value.split('. ').filter(s => s.trim().length > 0);
      if (sentences.length > 1) {
        return (
          <ul className="list-disc pl-5 text-sm space-y-1">
            {sentences.map((sentence, i) => (
              // Add the period back unless it's the last sentence and already has punctuation
              <li key={i}>{sentence.trim()}{/[.!?]$/.test(sentence.trim()) || i === sentences.length - 1 ? '' : '.'}</li>
            ))}
          </ul>
        );
      } else {
        // Render as single text if no periods or only one sentence
        return <span className="text-sm">{value}</span>;
      }
    }

    if (typeof value === 'number') {
      return <span className="text-sm">{value.toString()}</span>;
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? (
        <ul className="list-disc pl-5 text-sm space-y-1">
          {value.filter(item => typeof item === 'string' || typeof item === 'number').map((item, i) => (
            <li key={i}>{String(item)}</li>
          ))}
        </ul>
      ) : (
        <span className="text-muted-foreground text-sm italic">{fallback}</span>
      );
    }

    if (typeof value === 'object' && value !== null) {
      // Try to render simple key-value pairs from a dict
      try {
        const entries = Object.entries(value);
        // Limit the number of key-value pairs shown initially for brevity
        const displayLimit = 5;

        if (entries.length === 0) {
          return <span className="text-muted-foreground text-sm italic">{fallback}</span>;
        }

        return (
          <ul className="list-disc pl-5 text-sm space-y-1">
            {entries.slice(0, displayLimit).map(([key, val]) => (
              // Format key nicely (e.g., 'experience_years' -> 'Experience Years')
              <li key={key}>
                <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {String(val)}
              </li>
            ))}
            {entries.length > displayLimit && (
              <li key="more" className="text-muted-foreground italic">...and {entries.length - displayLimit} more</li>
            )}
          </ul>
        );
      } catch (e) {
        // Fallback for complex objects that can't be easily rendered
        return <span className="text-muted-foreground text-sm italic">[Complex Object Data]</span>;
      }
    }

    // Render other primitive types (boolean) as a string
    if (value !== null && value !== undefined) {
      return <span className="text-sm">{String(value)}</span>;
    }

    // Default fallback
    return <span className="text-muted-foreground text-sm italic">{fallback}</span>;
  };

  // Helper function for consistent tooltip rendering
  const renderTooltip = (trigger: React.ReactNode, title: string, description: string) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {trigger}
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="bg-white dark:bg-slate-900 border shadow-lg p-3"
          align="center"
        >
          <div className="space-y-1">
            <h4 className="font-semibold">{title}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="space-y-6">
      {/* Key Insights Section */}
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
                        {renderTooltip(
                          <Badge
                            variant="outline"
                            className="absolute top-3 right-3 cursor-default"
                          >
                            {Math.round((theme.frequency || 0) * 100)}%
                          </Badge>,
                          "Theme Frequency",
                          `Appears in ${Math.round((theme.frequency || 0) * 100)}% of analyzed content`
                        )}
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


          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search themes or keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            aria-label="Search themes"
            id="theme-search"
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
                          <Badge variant="outline" className="ml-2 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                            Enhanced
                          </Badge>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {renderTooltip(
                          <Badge
                            variant={getSentimentVariant(theme.sentiment)}
                            className="cursor-default"
                          >
                            {getSentimentLabel(theme.sentiment)}
                          </Badge>,
                          "Sentiment Analysis",
                          getSentimentDescription(theme.sentiment)
                        )}
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          {Math.round((theme.frequency || 0) * 100)}%
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium">Definition:</h4>
                        <div className="p-2 bg-muted rounded-md">
                          {renderThemeValue(theme.definition, "No definition available")}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-sm font-medium">Keywords:</h4>
                        {theme.keywords && theme.keywords.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {theme.keywords.map((keyword, i) => (
                              <Badge key={`${theme.id || theme.name}-keyword-${i}-${keyword}`} variant="secondary" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="p-2 bg-muted/50 rounded-md">
                            {renderThemeValue(null, "No keywords available")}
                          </div>
                        )}
                      </div>

                      <div className="mt-3">
                        <h4 className="text-sm font-semibold mb-1">Associated Codes</h4>
                        {theme.codes && theme.codes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {theme.codes.map((code: string, i: number) => (
                              <Badge key={`code-${i}`} variant="outline" className="text-xs">
                                {code}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="p-2 bg-muted/50 rounded-md">
                            {renderThemeValue(null, "No associated codes available")}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-sm font-medium">Reliability Score:</h4>
                        {theme.reliability !== undefined ? (
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
                        ) : (
                          <div className="p-2 bg-muted/50 rounded-md">
                            {renderThemeValue(null, "No reliability score available")}
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-xs font-semibold uppercase text-muted-foreground bg-muted px-2 py-1 rounded-sm inline-block mb-2">Supporting Statements</span>
                        <div className="rounded-md border p-4">
                          {/* Handle both statements and examples fields for backward compatibility */}
                          {(theme.statements && theme.statements.length > 0) || (theme.examples && theme.examples.length > 0) ? (
                            <ul className="space-y-2 text-sm">
                              {theme.statements && theme.statements.map((statement, i) => (
                                <li key={`${theme.id || theme.name}-statement-${i}`} className="relative bg-muted/30 p-3 rounded-md">
                                  <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 rounded-l-md"></div>
                                  <p className="italic text-muted-foreground text-sm">&quot;{statement}&quot;</p> {/* Escape quotes */}
                                </li>
                              ))}
                              {!theme.statements && theme.examples && theme.examples.map((example, i) => (
                                <li key={`${theme.id || theme.name}-example-${i}`} className="relative bg-muted/30 p-3 rounded-md">
                                  <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 rounded-l-md"></div>
                                  <p className="italic text-muted-foreground text-sm">&quot;{example}&quot;</p> {/* Escape quotes */}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-2 bg-muted/50 rounded-md">
                              {renderThemeValue(null, "No supporting statements available")}
                            </div>
                          )}
                        </div>
                      </div>
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
        <div
          ref={modalRef}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTheme(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="theme-detail-title"
          onKeyDown={(e) => {
            // Close modal on Escape key press
            if (e.key === 'Escape') {
              setSelectedTheme(null);
            }
          }}
          tabIndex={0} // Make div focusable for keyboard navigation
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="flex items-center" id="theme-detail-title">
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

                <div>
                  <h4 className="text-sm font-medium mb-2">Definition</h4>
                  <div className="p-2 bg-muted rounded-md">
                    {renderThemeValue(selectedTheme.definition, "No definition available")}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Keywords</h4>
                  {selectedTheme.keywords && selectedTheme.keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedTheme.keywords.map((keyword, i) => (
                        <Badge key={`modal-${selectedTheme.id || selectedTheme.name}-keyword-${i}-${keyword}`} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 bg-muted/50 rounded-md">
                      {renderThemeValue(null, "No keywords available")}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <h4 className="text-sm font-semibold mb-1">Associated Codes</h4>
                  {selectedTheme.codes && selectedTheme.codes.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedTheme.codes.map((code: string, i: number) => (
                        <Badge key={`code-${i}`} variant="outline" className="text-xs">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 bg-muted/50 rounded-md">
                      {renderThemeValue(null, "No associated codes available")}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <h4 className="text-sm font-semibold mb-1">Supporting Statements</h4>
                  {/* Handle statements field */}
                  {selectedTheme.statements && selectedTheme.statements.length > 0 ? (
                    <div className="space-y-1 mt-1 text-sm">
                      {selectedTheme.statements.map((statement: string, i: number) => (
                        <div key={`statement-${i}`} className="p-2 bg-muted/50 rounded text-xs">
                          &quot;{statement}&quot; {/* Escape quotes */}
                        </div>
                      ))}
                    </div>
                  ) : selectedTheme.examples && selectedTheme.examples.length > 0 ? (
                    <div className="space-y-1 mt-1 text-sm">
                      {/* Handle examples field for backward compatibility */}
                      {selectedTheme.examples.map((example: string, i: number) => (
                        <div key={`example-${i}`} className="p-2 bg-muted/50 rounded text-xs">
                          &quot;{example}&quot; {/* Escape quotes */}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 bg-muted/50 rounded-md">
                      {renderThemeValue(null, "No supporting statements or examples available")}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedTheme(null)}
                    aria-label="Close theme details"
                  >
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