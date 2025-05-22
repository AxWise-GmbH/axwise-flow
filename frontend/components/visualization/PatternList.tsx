'use client';

import React, { useState } from 'react';
import { Pattern } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// Removed unused Accordion imports
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface PatternListProps {
  patterns: Pattern[];
  className?: string;
  onPatternClick?: (pattern: Pattern) => void;
}

// Pattern category descriptions
const PATTERN_CATEGORIES = {
  'Workflow': 'Sequences of actions users take to accomplish goals',
  'Coping Strategy': 'Ways users overcome obstacles or limitations',
  'Decision Process': 'How users make choices',
  'Workaround': 'Alternative approaches when standard methods fail',
  'Habit': 'Repeated behaviors users exhibit',
  'Uncategorized': 'Other behavioral patterns'
};

export function PatternList({ patterns, className }: PatternListProps) {
 // Removed unused onPatternClick
  const [searchTerm, setSearchTerm] = useState('');
  // const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
 // Unused state

  // Filter patterns based on search term
  const filteredPatterns = patterns.filter(pattern =>
    (pattern.name && pattern.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (pattern.description && pattern.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Sort patterns by frequency
  const sortedPatterns = [...filteredPatterns].sort((a, b) => (b.frequency || 0) - (a.frequency || 0));

  // Group patterns by category (if available)
  const groupedPatterns = sortedPatterns.reduce((groups, pattern) => {
    const category = pattern.category || 'Uncategorized';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(pattern);
    return groups;
  }, {} as Record<string, Pattern[]>);

  // Get all categories
  const categories = Object.keys(groupedPatterns).sort();

  const getPatternColors = (sentiment: number | undefined) => {
    if (typeof sentiment !== 'number') {
      return { border: 'border-slate-300 dark:border-slate-700', bg: 'bg-slate-50 dark:bg-slate-900/50' };
    }
    if (sentiment >= 0.2) {
      return { border: 'border-green-300 dark:border-green-800', bg: 'bg-green-50 dark:bg-green-900/20' };
    }
    if (sentiment <= -0.2) {
      return { border: 'border-red-300 dark:border-red-800', bg: 'bg-red-50 dark:bg-red-900/20' };
    }
    return { border: 'border-slate-300 dark:border-slate-700', bg: 'bg-slate-50 dark:bg-slate-900/50' };
  };

  // const handlePatternSelect = (pattern: Pattern) => {
 // Removed unused function
  //   if (onPatternClick) {
  //     onPatternClick(pattern);
  //   } else {
  //     setSelectedPattern(pattern === selectedPattern ? null : pattern);
  //   }
 //  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-4">
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search patterns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identified Patterns</CardTitle>
          <CardDescription>
            {sortedPatterns.length} pattern{sortedPatterns.length !== 1 ? 's' : ''} found in the analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length > 0 ? (
            <div className="space-y-8">
              {categories.map((category) => (
                <div key={`pattern-category-${category}`} className="mb-8 last:mb-0">
                  <div className="mb-3">
                    <h3 className="text-base font-semibold">{category}</h3>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="cursor-default"
                          >
                            {PATTERN_CATEGORIES[category as keyof typeof PATTERN_CATEGORIES] ||
                             PATTERN_CATEGORIES['Uncategorized']}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="bg-white dark:bg-slate-900 border shadow-lg p-3"
                          align="center"
                        >
                          <div className="space-y-1">
                            <h4 className="font-semibold">Pattern Category</h4>
                            <p className="text-sm text-muted-foreground">
                              {PATTERN_CATEGORIES[category as keyof typeof PATTERN_CATEGORIES] ||
                               PATTERN_CATEGORIES['Uncategorized']}
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="space-y-6">
                    {groupedPatterns[category].map((pattern, categoryIndex) => {
                      // Generate a unique key that includes category and index, protecting against duplicates
                      const patternKey = `pattern-${category}-${categoryIndex}-${pattern.id || pattern.name}`;
                      return (
                        <div key={patternKey} id={`pattern-${pattern.id}`} data-testid={`pattern-card-${pattern.id}`} className="border-b pb-6 last:border-0 last:pb-0">
 {/* Add testid */}
                          {pattern.description && (
                            <div className="mb-5 p-1.5 relative">
                              <div className={`border ${getPatternColors(pattern.sentiment).border} ${getPatternColors(pattern.sentiment).bg} rounded-lg p-4 relative`}>
                                <TooltipProvider key={`tooltip-${patternKey}`} delayDuration={300}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="outline"
                                        className="absolute top-1/2 right-3 -translate-y-1/2 cursor-default"
                                      >
                                        {Math.round((pattern.frequency || 0) * 100)}%
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="left"
                                      className="bg-white dark:bg-slate-900 border shadow-lg p-3"
                                      align="center"
                                    >
                                      <div className="space-y-1">
                                        <h4 className="font-semibold">Pattern Frequency</h4>
                                        <p className="text-sm text-muted-foreground">
                                          {(pattern.frequency ?? 0) >= 0.7 // Handle undefined frequency
                                            ? "Strong presence in analysis"
                                            : "Moderate presence in analysis"}
                                        </p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <div className="relative">
                                  <p className="text-base leading-relaxed text-foreground pr-[4.5rem]">
                                    {pattern.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

{/* Supporting evidence */}
                          {pattern.evidence && pattern.evidence.length > 0 && (

                            <div className="mt-3">
                              <span className="text-xs font-semibold uppercase text-muted-foreground bg-muted dark:bg-muted/30 px-2 py-1 rounded-sm inline-block mb-2">Supporting Statements</span>
                              <div className="pl-3 border-l-2 border-primary/20 dark:border-primary/30">
                                <ul className="space-y-3">
                                  {pattern.evidence.map((evidence: string, i: number) => (
                                    <li key={`${patternKey}-evidence-${i}-${evidence.slice(0, 10).replace(/\s+/g, '-')}`} className="relative bg-muted/30 dark:bg-slate-800/50 p-3 rounded-md">
                                      <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 dark:bg-primary/40 rounded-l-md"></div>
                                      <p className="text-muted-foreground text-sm">{evidence}</p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No patterns identified</p>
          )}
        </CardContent>
      </Card>

      <div className="mt-4">
      </div>
    </div>
  );
}

export default PatternList;
