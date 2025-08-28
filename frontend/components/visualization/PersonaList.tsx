'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Grid, List, Network } from 'lucide-react';
import { type Persona } from '@/types/api';
import { EnhancedPersonaCard } from './EnhancedPersonaCard';
import { PersonaRelationshipNetwork } from './PersonaRelationshipNetwork';
import { renderMarkdownWithHighlighting } from '@/utils/personaEnhancements';

type PersonaListProps = {
  personas: Persona[];
  className?: string;
};

export function PersonaList({ personas, className }: PersonaListProps) {
  const [viewMode, setViewMode] = useState<'tabs' | 'cards' | 'network'>('cards');

  // Filter out fallback personas first
  const validPersonas = personas?.filter(persona => {
    const metadata = persona.metadata || persona.persona_metadata;
    const isFallback = metadata?.is_fallback === true;

    if (isFallback) {
      console.log(`[PERSONA_LIST] Excluding fallback persona: ${persona.name}`);
      return false;
    }

    return true;
  }) || [];

  // Ensure we have valid personas data after filtering
  if (!validPersonas || validPersonas.length === 0) {
    return (
      <div className="w-full p-6 text-center">
        <p className="text-muted-foreground">No valid personas found in the analysis.</p>
      </div>
    );
  }

  // Design thinking field filtering logic (based on PROJECT_DEEP_DIVE_ANALYSIS.md)
  const DESIGN_THINKING_FIELDS = [
    'demographics',
    'goals_and_motivations',
    'challenges_and_frustrations',
    'key_quotes'
  ];

  const CONFIDENCE_THRESHOLD = 0.7;
  const MIN_CONTENT_LENGTH = 15;

  // Filter persona fields to only show populated, high-confidence design thinking fields
  const getPopulatedFields = (persona: Persona) => {
    const populatedFields: Array<{field: string, trait: any, title: string}> = [];

    DESIGN_THINKING_FIELDS.forEach(field => {
      const trait = persona[field as keyof Persona];
      if (trait &&
          typeof trait === 'object' &&
          'value' in trait &&
          trait.value &&
          typeof trait.value === 'string' &&
          trait.value.length >= MIN_CONTENT_LENGTH &&
          trait.confidence >= CONFIDENCE_THRESHOLD) {

        const titles: Record<string, string> = {
          'demographics': 'Demographics',
          'goals_and_motivations': 'Goals & Motivations',
          'challenges_and_frustrations': 'Challenges & Frustrations',
          'key_quotes': 'Key Quotes'
        };

        populatedFields.push({
          field,
          trait,
          title: titles[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        });
      }
    });

    return populatedFields;
  };

  // Check if any personas have stakeholder intelligence features
  const hasStakeholderFeatures = validPersonas.some(persona => persona.stakeholder_intelligence);

  // We're using activePersonaIndex directly to access the active persona
  // No need to store it in a separate variable

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Get color based on confidence (PROJECT_DEEP_DIVE_ANALYSIS.md specifications)
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-800 dark:text-green-100'; // High: 90%+
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-800 dark:text-yellow-100'; // Medium: 70%+
    return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-800 dark:text-red-100'; // Low: <70%
  };

  // Get confidence level text
  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    return 'Low';
  };

  const getConfidenceTooltip = (confidence: number) => {
    if (confidence >= 0.9) return 'High confidence: Based on direct statements from the interview';
    if (confidence >= 0.7) return 'Good confidence: Based on strong evidence across multiple mentions';
    if (confidence >= 0.5) return 'Moderate confidence: Based on contextual clues';
    return 'Limited confidence: Based on inferences with minimal evidence';
  };

  // Helper function to render trait values consistently
  const renderTraitValue = (value: any, fieldName?: string): React.ReactNode => {
    if (typeof value === 'string') {
      // Handle newline-separated bullet points first
      if (value.includes('\n') && value.includes('•')) {
        return value.split('\n').filter(s => s.trim().length > 0).map((line, i) => (
          <li key={i}>{line.replace(/^•\s*/, '').trim()}</li>
        ));
      }
      // Handle inline bullet points (like "• Item 1 • Item 2")
      else if (value.includes('•') && !value.includes('\n')) {
        return value.split('•').filter(s => s.trim().length > 0).map((item, i) => (
          <li key={i}>{item.trim()}</li>
        ));
      }
      // Split string into sentences for list items if it contains periods
      else if (value.includes('. ')) {
        return value.split('. ').filter(s => s.trim().length > 0).map((sentence, i) => (
          <li key={i}>{sentence.trim()}{value?.endsWith(sentence.trim()) ? '' : '.'}</li>
        ));
      } else {
        // Render as single list item if no periods
        // Use markdown parsing for key quotes field
        if (fieldName === 'key_quotes') {
          return <li dangerouslySetInnerHTML={renderMarkdownWithHighlighting(value)} />;
        }
        return <li>{value}</li>;
      }
    } else if (Array.isArray(value)) {
      // Render array items as list items
      return value.filter(item => typeof item === 'string' || typeof item === 'number').map((item, i) => (
        <li key={i}>{String(item)}</li>
      ));
    } else if (typeof value === 'object' && value !== null) {
      // Try to render simple key-value pairs from a dict
      try {
        // Limit the number of key-value pairs shown initially
        const entries = Object.entries(value);
        const displayLimit = 5;
        return entries.slice(0, displayLimit).map(([key, val]) => (
          <li key={key}><strong>{key}:</strong> {String(val)}</li>
        )).concat(entries.length > displayLimit ? [<li key="more" className="text-muted-foreground italic">...and more</li>] : []);
      } catch (e) {
        return <li className="text-muted-foreground italic">[Complex Object]</li>;
      }
    } else if (value !== null && value !== undefined) {
      // Render other primitive types as a single list item
      return <li>{String(value)}</li>;
    }
    // Fallback for null, undefined, or empty values
    return <li className="text-muted-foreground italic">N/A</li>;
  };

  // Helper function to render key quotes in expanded format
  const renderExpandedQuotes = (persona: any): React.ReactNode => {
    const quotes = persona.key_quotes;
    if (!quotes) return <p className="text-muted-foreground">No quotes available.</p>;

    // Handle different quote formats
    let quoteList: string[] = [];

    if (typeof quotes === 'string') {
      // If it's a string, try to split by common delimiters
      if (quotes.includes('", "') || quotes.includes('\", \"')) {
        quoteList = quotes.split(/",\s*"/).map(q => q.replace(/^["']|["']$/g, '').trim());
      } else if (quotes.includes('\n')) {
        quoteList = quotes.split('\n').filter(q => q.trim().length > 0);
      } else {
        quoteList = [quotes];
      }
    } else if (Array.isArray(quotes)) {
      quoteList = quotes.filter(q => typeof q === 'string' && q.trim().length > 0);
    } else if (typeof quotes === 'object' && quotes.evidence) {
      // Handle evidence format
      quoteList = Array.isArray(quotes.evidence) ? quotes.evidence : [quotes.evidence];
    }

    if (quoteList.length === 0) {
      return <p className="text-muted-foreground">No quotes available.</p>;
    }

    return (
      <div className="space-y-4">
        {quoteList.map((quote, index) => (
          <blockquote key={index} className="border-l-4 border-primary pl-4 py-2 bg-muted/30 rounded-r-lg">
            <p
              className="text-sm italic"
              dangerouslySetInnerHTML={renderMarkdownWithHighlighting(`"${quote.replace(/^["']|["']$/g, '').trim()}"`)}
            />
          </blockquote>
        ))}
      </div>
    );
  };

  // Helper function to group and render patterns by category
  const renderGroupedPatterns = (patterns: string[]): React.ReactNode => {
    // Debug: Log the raw patterns to understand the format
    console.log('Raw patterns received:', patterns);

    // Define pattern categories
    const categories = {
      'Behavioral Patterns': ['preference', 'behavior', 'habit', 'approach', 'style', 'method', 'way', 'tends to', 'always', 'often', 'typically'],
      'Value Patterns': ['value', 'important', 'priority', 'belief', 'principle', 'standard', 'quality', 'authenticity', 'tradition', 'heritage'],
      'Goal Patterns': ['goal', 'desire', 'want', 'seek', 'aim', 'objective', 'motivation', 'drive', 'aspiration'],
      'Challenge Patterns': ['challenge', 'problem', 'issue', 'difficulty', 'struggle', 'obstacle', 'barrier', 'frustration', 'pain'],
      'Process Patterns': ['process', 'workflow', 'sequence', 'step', 'procedure', 'routine', 'system', 'method', 'approach']
    };

    // Categorize patterns
    const categorizedPatterns: Record<string, string[]> = {};
    const uncategorized: string[] = [];

    patterns.forEach(pattern => {
      // Clean up the pattern text more thoroughly
      let cleanPattern = pattern;

      // Remove confidence labels like "Preferences (Medium):", "Goals (High):", etc.
      cleanPattern = cleanPattern.replace(/^[A-Za-z\s]+\s*\([^)]*\):\s*/, '');

      // Remove any remaining category prefixes that might be concatenated
      cleanPattern = cleanPattern.replace(/^(Preferences|Goals|General|Behavioral|Value|Challenge|Process)/i, '');

      // Clean up any double spaces or weird formatting
      cleanPattern = cleanPattern.replace(/\s+/g, ' ').trim();

      // Ensure it starts with a capital letter
      if (cleanPattern.length > 0) {
        cleanPattern = cleanPattern.charAt(0).toUpperCase() + cleanPattern.slice(1);
      }

      // Skip if the pattern is too short or empty after cleaning
      if (cleanPattern.length < 10) {
        return;
      }

      let categorized = false;
      for (const [categoryName, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => cleanPattern.toLowerCase().includes(keyword))) {
          if (!categorizedPatterns[categoryName]) {
            categorizedPatterns[categoryName] = [];
          }
          categorizedPatterns[categoryName].push(cleanPattern);
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        uncategorized.push(cleanPattern);
      }
    });

    // Add uncategorized patterns to "Other Patterns" if any exist
    if (uncategorized.length > 0) {
      categorizedPatterns['Other Patterns'] = uncategorized;
    }

    // Render categorized patterns
    return (
      <div className="space-y-2">
        {Object.entries(categorizedPatterns).map(([categoryName, categoryPatterns]) => (
          <div key={categoryName} className="space-y-1">
            <h5 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              {categoryName}
            </h5>
            <ul className="list-disc pl-5 text-sm space-y-0">
              {categoryPatterns.map((pattern, i) => (
                <li key={i} className="text-foreground leading-relaxed">{pattern}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  // Helper function to validate and extract trait data with fallbacks
  const validateTrait = (trait: any) => {
    if (!trait || typeof trait !== 'object') {
      return null;
    }

    // Extract values with fallbacks
    const value = trait.value || trait.Value || '';
    const confidence = typeof trait.confidence === 'number' ? trait.confidence :
                      typeof trait.Confidence === 'number' ? trait.Confidence : 0.3;
    const evidence = Array.isArray(trait.evidence) ? trait.evidence :
                    Array.isArray(trait.Evidence) ? trait.Evidence : [];

    // Return null if value is empty or invalid
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return null;
    }

    return { value, confidence, evidence };
  };

  // Render a trait card with confidence badge and evidence
  const renderTraitCard = (label: string, trait: any, fieldName?: string) => {
    const validatedTrait = validateTrait(trait);
    if (!validatedTrait) {
      // Return a placeholder card for missing data
      return (
        <div className="mb-4 border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
            <Badge variant="outline" className="text-xs">
              No Data
            </Badge>
          </div>
          <div className="mt-2">
            <p className="text-sm text-muted-foreground italic">
              Information not available from the analysis
            </p>
          </div>
        </div>
      );
    }

    const { value, confidence, evidence } = validatedTrait;

    return (
      <div className={`mb-4 border rounded-lg p-4 ${
        confidence >= 0.9 ? 'border-green-200 bg-green-50/30' :
        confidence >= 0.7 ? 'border-yellow-200 bg-yellow-50/30' :
        'border-red-200 bg-red-50/30'
      }`}>
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-medium">{label}</h3>
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={getConfidenceColor(confidence)}>
                    {getConfidenceLevel(confidence)} {Math.round(confidence * 100)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{getConfidenceTooltip(confidence)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {evidence && evidence.length > 0 && (
              <Badge variant="outline" className="text-xs">
                📝 {evidence.length}
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-2">
          <ul className="list-disc pl-5 space-y-1">
            {renderTraitValue(value, fieldName)}
          </ul>
        </div>

        {evidence && evidence.length > 0 && (
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value="evidence">
              <AccordionTrigger className="text-xs text-muted-foreground">
                Supporting Evidence ({evidence.length} items)
              </AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {evidence.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    );
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>User Personas</CardTitle>
            <CardDescription>
              {hasStakeholderFeatures
                ? `${validPersonas.length} enhanced persona${validPersonas.length !== 1 ? 's' : ''} with stakeholder intelligence`
                : `${validPersonas.length} persona${validPersonas.length !== 1 ? 's' : ''} identified from the analysis`
              }
            </CardDescription>
          </div>

          {/* View Mode Controls */}
          <div className="flex items-center space-x-2">
            <div className="flex rounded-md border">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="rounded-r-none"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'tabs' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('tabs')}
                className="rounded-none border-x"
              >
                <List className="h-4 w-4" />
              </Button>
              {hasStakeholderFeatures && (
                <Button
                  variant={viewMode === 'network' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('network')}
                  className="rounded-l-none"
                >
                  <Network className="h-4 w-4" />
                </Button>
              )}
            </div>

            {hasStakeholderFeatures && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Enhanced
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Network View - Show relationship network for enhanced personas */}
        {viewMode === 'network' && hasStakeholderFeatures && (
          <PersonaRelationshipNetwork personas={personas} />
        )}

        {/* Cards View - Show enhanced persona cards */}
        {viewMode === 'cards' && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
            {validPersonas.map((persona, index) => (
              <EnhancedPersonaCard
                key={`persona-card-${index}`}
                persona={persona}
                showStakeholderFeatures={hasStakeholderFeatures}
              />
            ))}
          </div>
        )}

        {/* Tabs View - Traditional tabbed interface */}
        {viewMode === 'tabs' && (
          <Tabs defaultValue={validPersonas[0]?.name} className="w-full">
            <TabsList className="mb-4 w-full flex overflow-x-auto">
              {validPersonas.map((persona, index) => (
                <TabsTrigger
                  key={`persona-tab-${index}`}
                  value={persona.name}
                  className="flex items-center"
                >
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarFallback>{getInitials(persona.name)}</AvatarFallback>
                  </Avatar>
                  <span>{persona.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>

          {validPersonas.map((persona, index) => (
            <TabsContent key={`persona-content-${index}`} value={persona.name} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold">{persona.name}</h2>
                  <p className="text-muted-foreground">{persona.description}</p>
                </div>
                <div className="flex-shrink-0 self-start space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className={getConfidenceColor(persona.confidence)}>
                          {getConfidenceLevel(persona.confidence)} ({Math.round(persona.confidence * 100)}%)
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{getConfidenceTooltip(persona.confidence)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Quality indicators */}
                  <div className="text-xs text-muted-foreground text-right">
                    {(() => {
                      const populatedFields = getPopulatedFields(persona);
                      const totalEvidence = populatedFields.reduce((sum, field) =>
                        sum + (field.trait.evidence?.length || 0), 0
                      );
                      return (
                        <>
                          <div>📊 {populatedFields.length} quality traits</div>
                          <div>📝 {totalEvidence} evidence items</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Patterns Section (Always Visible) */}
              {persona.patterns && persona.patterns.length > 0 && (
                <div className="mt-3 mb-2">
                  <h4 className="text-xs font-medium mb-1">Associated Patterns</h4>
                  {renderGroupedPatterns(persona.patterns)}
                </div>
              )}

              {/* Evidence Section (Collapsible) */}
              {persona.evidence && persona.evidence.length > 0 && (
                <div className="mt-1">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="evidence">
                      <AccordionTrigger className="text-xs text-muted-foreground">
                        Supporting Evidence
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                          {persona.evidence.map((item: string, i: number) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}

              {/* Basic Information */}
              <div className="mb-4 flex flex-wrap gap-2">
                {persona.archetype && (
                  <Badge variant="outline" className="text-sm">
                    {persona.archetype}
                  </Badge>
                )}
                {persona.role_in_interview && (
                  <Badge variant="secondary" className="text-sm">
                    {persona.role_in_interview}
                  </Badge>
                )}
                {persona.metadata?.speaker && (
                  <Badge variant="outline" className="text-sm bg-blue-50">
                    Speaker: {persona.metadata.speaker}
                  </Badge>
                )}
              </div>

              {/* Tabs for different persona aspects */}
              <Tabs defaultValue="detailed" className="w-full mt-4">
                <TabsList className="mb-4">
                  <TabsTrigger value="detailed">Detailed Profile</TabsTrigger>
                  <TabsTrigger value="quotes">Key Quotes</TabsTrigger>
                </TabsList>

                {/* Detailed Profile Tab - Now with smart filtering */}
                <TabsContent value="detailed" className="space-y-4">
                  {(() => {
                    const populatedFields = getPopulatedFields(persona);

                    if (populatedFields.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">
                            No high-confidence traits available for design thinking analysis.
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            Traits need 70%+ confidence and sufficient content to be displayed.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-sm text-blue-800">
                            🎯 <strong>Design Thinking Optimized:</strong> Showing {populatedFields.length} high-quality traits
                            (70%+ confidence) from {DESIGN_THINKING_FIELDS.length} core design thinking fields.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {populatedFields.map(({ field, trait, title }) =>
                            renderTraitCard(title, trait, field)
                          )}
                        </div>
                      </>
                    );
                  })()}
                </TabsContent>

                {/* Key Quotes Tab */}
                <TabsContent value="quotes" className="space-y-4">
                  <div className="border rounded-lg p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Key Quotes</h3>
                      <Badge variant="outline" className="text-sm">
                        Authentic Voice
                      </Badge>
                    </div>
                    <div className="mt-4">
                      {renderExpandedQuotes(persona)}
                    </div>
                  </div>
                </TabsContent>


              </Tabs>

              {/* Metadata */}
              {persona.metadata && (
                <div className="mt-4 text-xs text-muted-foreground">
                  {persona.metadata.sample_size && (
                    <p>Sample size: {persona.metadata.sample_size}</p>
                  )}
                  {persona.metadata.timestamp && (
                    <p>Generated: {new Date(persona.metadata.timestamp).toLocaleString()}</p>
                  )}
                </div>
              )}
            </TabsContent>
          ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
