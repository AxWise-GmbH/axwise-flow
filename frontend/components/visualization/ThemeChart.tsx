'use client';

/**
 * ThemeChart Component
 *
 * ARCHITECTURAL NOTE: This is the canonical ThemeChart component used throughout the application.
 * It displays themes from both basic and enhanced analysis processes without distinguishing
 * between them. The backend always runs enhanced theme analysis, and this component
 * displays all themes regardless of their process type.
 *
 * This component focuses on displaying themes, their definitions, supporting statements,
 * and related metadata like reliability scores and codes when available.
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

export function ThemeChart({ themes }: ThemeChartProps): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter themes based on search term
  const getFilteredThemes = (): AnalyzedTheme[] => {
    // Filter by search term if provided
    if (searchTerm.trim()) {
      return themes.filter(theme => {
        const searchLower = searchTerm.toLowerCase();
        return (
          theme.name.toLowerCase().includes(searchLower) ||
          (theme.definition && theme.definition.toLowerCase().includes(searchLower)) ||
          (theme.keywords && theme.keywords.some(k => k.toLowerCase().includes(searchLower))) ||
          (theme.codes && theme.codes.some(c => c.toLowerCase().includes(searchLower)))
        );
      });
    }
    return themes;
  };

  // Sort themes by frequency for list view
  const sortedThemes = [...getFilteredThemes()].sort((a, b) => (b.frequency || 0) - (a.frequency || 0));

  // Helper function to format frequency as percentage
  const formatFrequency = (frequency: number): string => {
    return `${Math.round(frequency * 100)}%`;
  };

  // Helper function to format reliability score as percentage
  const formatReliability = (reliability: number | undefined): string => {
    if (reliability === undefined || reliability === null) return 'N/A';
    return `${Math.round(reliability * 100)}%`;
  };

  // Helper function to get reliability description
  const getReliabilityDescription = (reliability: number | undefined): string => {
    if (reliability === undefined || reliability === null) return 'Not available';
    if (reliability >= 0.8) return 'High agreement between raters';
    if (reliability >= 0.6) return 'Good agreement between raters';
    if (reliability >= 0.4) return 'Moderate agreement between raters';
    return 'Low agreement between raters';
  };

  // Helper function for rendering theme values with better handling of missing data
  const renderThemeValue = (value: string | string[] | undefined | null, fallback: string = "Not available"): React.ReactNode => {
    if (value === undefined || value === null) {
      return <span className="text-muted-foreground text-sm italic">{fallback}</span>;
    }
    return <span className="text-sm">{value}</span>;
  };



  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-auto">
          <Input
            type="text"
            placeholder="Search themes or keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full"
              onClick={() => setSearchTerm('')}
            >
              Clear
            </Button>
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
                      </span>
                      <div className="flex items-center gap-2">
                        {theme.reliability !== undefined && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 cursor-help">
                                  Reliability: {formatReliability(theme.reliability)}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs">
                                  <h4 className="font-semibold text-sm">Reliability Score</h4>
                                  <p className="text-xs text-muted-foreground">{getReliabilityDescription(theme.reliability)}</p>
                                  <p className="text-xs text-muted-foreground mt-1">This score represents the level of agreement between multiple AI raters when identifying this theme.</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 cursor-help">
                                Frequency: {formatFrequency(theme.frequency || 0)}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="max-w-xs">
                                <h4 className="font-semibold text-sm">Theme Frequency</h4>
                                <p className="text-xs text-muted-foreground">This percentage represents how often this theme appears in the analyzed text relative to other themes.</p>
                                <p className="text-xs text-muted-foreground mt-1">Higher percentages indicate themes that are more prominent in the discussion.</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium">Definition:</h4>
                        <div className="p-2 bg-muted dark:bg-muted/30 rounded-md">
                          {renderThemeValue(theme.definition, "No definition available")}
                        </div>
                      </div>

                      {/* Theme Codes */}
                      {theme.codes && theme.codes.length > 0 && (
                        <div className="mt-2">
                          <h5 className="text-xs font-medium">Theme Codes:</h5>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {theme.codes.map((code, index) => (
                              <Badge key={`code-${index}`} variant="secondary" className="text-xs">
                                {code}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Keywords */}
                      {theme.keywords && theme.keywords.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Keywords:</h4>
                          <div className="flex flex-wrap gap-1">
                            {theme.keywords.map((keyword, index) => (
                              <Badge key={`keyword-${index}`} variant="secondary" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Supporting Statements */}
                      <div>
                        <span className="text-xs font-semibold uppercase text-muted-foreground bg-muted dark:bg-muted/30 px-2 py-1 rounded-sm inline-block mb-2">
                          Supporting Statements
                        </span>
                        <div className="rounded-md border dark:border-slate-700 p-4">
                          {theme.statements && theme.statements.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                              {theme.statements.map((statement, i) => (
                                <li key={`${theme.id || theme.name}-statement-${i}`} className="relative bg-muted/30 dark:bg-slate-800/50 p-3 rounded-md">
                                  <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 dark:bg-primary/40 rounded-l-md"></div>
                                  <p className="italic text-muted-foreground text-sm">&quot;{statement}&quot;</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-2 bg-muted/50 dark:bg-slate-800/50 rounded-md">
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
            <div className="text-center p-6">
              <p className="text-muted-foreground">No themes found matching your search criteria.</p>
              {searchTerm && (
                <Button variant="outline" className="mt-2" onClick={() => setSearchTerm('')}>
                  Clear Search
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>


    </div>
  );
}
