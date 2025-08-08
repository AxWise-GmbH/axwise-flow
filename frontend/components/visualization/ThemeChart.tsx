'use client';

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
  stakeholderIntelligence?: any;
}

export function ThemeChart({ themes, stakeholderIntelligence }: ThemeChartProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Extract consensus areas as theme-like items
  const getConsensusThemes = (): AnalyzedTheme[] => {
    if (!stakeholderIntelligence?.cross_stakeholder_patterns?.consensus_areas) {
      return [];
    }

    return stakeholderIntelligence.cross_stakeholder_patterns.consensus_areas.map((area: any, index: number) => {
      const consensusTheme: AnalyzedTheme = {
        id: `consensus-${index}`,
        name: area.topic,
        frequency: area.agreement_level || 0.8,
        sentiment: 0.5,
        statements: area.shared_insights || [],
        definition: `Multi-stakeholder consensus area: ${area.business_impact || 'Stakeholder agreement on this topic'}`,
        keywords: area.shared_insights || [],
        codes: ['Multi-Stakeholder', 'Consensus'],
        reliability: 0.9,
        process: 'enhanced' as const
      };

      // Add multi-stakeholder specific fields
      (consensusTheme as any).is_enhanced = true;
      (consensusTheme as any).source_stakeholders = area.participating_stakeholders || [];
      (consensusTheme as any).stakeholder_distribution = area.participating_stakeholders?.reduce((acc: any, stakeholder: string) => {
        acc[stakeholder] = 1.0;
        return acc;
      }, {}) || {};
      (consensusTheme as any).multi_stakeholder_type = 'consensus';
      (consensusTheme as any).agreement_level = area.agreement_level;
      (consensusTheme as any).business_impact = area.business_impact;

      return consensusTheme;
    });
  };

  // Combine regular themes with consensus themes
  const getAllThemes = (): AnalyzedTheme[] => {
    const consensusThemes = getConsensusThemes();
    return [...themes, ...consensusThemes];
  };

  // Filter themes based on search term
  const getFilteredThemes = (): AnalyzedTheme[] => {
    const allThemes = getAllThemes();
    if (searchTerm.trim()) {
      return allThemes.filter(theme => {
        const searchLower = searchTerm.toLowerCase();
        return (
          theme.name.toLowerCase().includes(searchLower) ||
          (theme.definition && theme.definition.toLowerCase().includes(searchLower)) ||
          (theme.keywords && theme.keywords.some(k => k.toLowerCase().includes(searchLower))) ||
          (theme.codes && theme.codes.some(c => c.toLowerCase().includes(searchLower)))
        );
      });
    }
    return allThemes;
  };

  // Sort themes by frequency for list view
  const sortedThemes = [...getFilteredThemes()].sort((a, b) => (b.frequency || 0) - (a.frequency || 0));

  return (
    <div className="space-y-6">
      {/* Search Controls */}
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

      {/* Theme List */}
      <Card>
        <CardHeader>
          <CardTitle>Identified Themes</CardTitle>
          <CardDescription>
            {sortedThemes.length} theme{sortedThemes.length !== 1 ? 's' : ''} found in the analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedThemes.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {sortedThemes.map((theme, index) => (
                <AccordionItem key={theme.id || index} value={`theme-${index}`}>
                  <AccordionTrigger className="text-left">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="font-medium text-left flex items-center">
                        {theme.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Multi-stakeholder indicator - show for all themes with stakeholder context */}
                        {(((theme as any).is_enhanced && (theme as any).source_stakeholders?.length > 0) ||
                         (theme as any).stakeholder_context?.source_stakeholders?.length > 0) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={`text-xs cursor-help ${
                                    (theme as any).multi_stakeholder_type === 'consensus'
                                      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300'
                                      : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                  }`}
                                >
                                  {(theme as any).multi_stakeholder_type === 'consensus' ? '🤝 ' : '👥 '}
                                  {((theme as any).source_stakeholders || (theme as any).stakeholder_context?.source_stakeholders || []).length} Stakeholder{((theme as any).source_stakeholders || (theme as any).stakeholder_context?.source_stakeholders || []).length !== 1 ? 's' : ''}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs">
                                  <h4 className="font-semibold text-sm">
                                    {(theme as any).multi_stakeholder_type === 'consensus' ? 'Consensus Area' : 'Multi-Stakeholder Theme'}
                                  </h4>
                                  <p className="text-xs text-muted-foreground">
                                    {(theme as any).multi_stakeholder_type === 'consensus'
                                      ? 'Area of stakeholder agreement and shared understanding.'
                                      : 'This theme was identified across multiple stakeholder perspectives.'
                                    }
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Stakeholders: {((theme as any).source_stakeholders || (theme as any).stakeholder_context?.source_stakeholders || []).join(', ')}
                                  </p>
                                  {((theme as any).agreement_level || (theme as any).stakeholder_context?.theme_consensus_level) && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Consensus Level: {Math.round(((theme as any).agreement_level || (theme as any).stakeholder_context?.theme_consensus_level || 0) * 100)}%
                                    </p>
                                  )}
                                  {((theme as any).business_impact || (theme as any).stakeholder_context?.business_impact) && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Impact: {(theme as any).business_impact || (theme as any).stakeholder_context?.business_impact}
                                    </p>
                                  )}
                                  {(theme as any).stakeholder_context?.dominant_stakeholder && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Primary Champion: {(theme as any).stakeholder_context.dominant_stakeholder.replace(/_/g, ' ')}
                                    </p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {Math.round((theme.frequency || 0) * 100)}%
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      {/* Theme Definition */}
                      {theme.definition && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Definition</h4>
                          <p className="text-sm text-muted-foreground">{theme.definition}</p>
                        </div>
                      )}

                      {/* Supporting Statements */}
                      {theme.statements && theme.statements.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Supporting Statements</h4>
                          <div className="space-y-2">
                            {theme.statements.slice(0, 3).map((statement, i) => (
                              <blockquote key={i} className="border-l-4 border-primary pl-4 py-2 bg-muted/30 rounded-r-lg">
                                <p className="text-sm italic">"{statement}"</p>
                              </blockquote>
                            ))}
                            {theme.statements.length > 3 && (
                              <p className="text-xs text-muted-foreground">
                                +{theme.statements.length - 3} more statements
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Keywords */}
                      {theme.keywords && theme.keywords.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Keywords</h4>
                          <div className="flex flex-wrap gap-1">
                            {theme.keywords.map((keyword, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No themes match your search criteria.' : 'No themes identified in this analysis.'}
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
