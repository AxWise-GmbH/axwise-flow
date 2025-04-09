'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { type Persona } from '@/types/api';

type PersonaListProps = {
  personas: Persona[];
  className?: string;
};

export function PersonaList({ personas, className }: PersonaListProps) {
  // No need to track active persona index as the Tabs component handles the active state

  // Ensure we have valid personas data
  if (!personas || personas.length === 0) {
    return (
      <div className="w-full p-6 text-center">
        <p className="text-muted-foreground">No personas found in the analysis.</p>
      </div>
    );
  }

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

  // Get color based on confidence
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
    return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100';
  };

  const getConfidenceTooltip = (confidence: number) => {
    if (confidence >= 0.9) return 'High confidence: Based on direct statements from the interview';
    if (confidence >= 0.7) return 'Good confidence: Based on strong evidence across multiple mentions';
    if (confidence >= 0.5) return 'Moderate confidence: Based on contextual clues';
    return 'Limited confidence: Based on inferences with minimal evidence';
  };

  // Helper function to render trait values consistently
  const renderTraitValue = (value: any): React.ReactNode => {
    if (typeof value === 'string') {
      // Split string into sentences for list items if it contains periods
      if (value.includes('. ')) {
        return value.split('. ').filter(s => s.trim().length > 0).map((sentence, i) => (
          <li key={i}>{sentence.trim()}{value?.endsWith(sentence.trim()) ? '' : '.'}</li>
        ));
      } else {
        // Render as single list item if no periods
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

  // Render a trait card with confidence badge and evidence
  const renderTraitCard = (label: string, trait: any) => {
    if (!trait) return null;

    const { value, confidence, evidence } = trait;

    return (
      <div className="mb-4 border rounded-lg p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-medium">{label}</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className={getConfidenceColor(confidence)}>
                  {Math.round(confidence * 100)}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{getConfidenceTooltip(confidence)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="mt-2">
          <ul className="list-disc pl-5 space-y-1">
            {renderTraitValue(value)}
          </ul>
        </div>

        {evidence && evidence.length > 0 && (
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value="evidence">
              <AccordionTrigger className="text-xs text-muted-foreground">
                Supporting Evidence
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
        <CardTitle>User Personas</CardTitle>
        <CardDescription>
          {personas.length} persona{personas.length !== 1 ? 's' : ''} identified from the analysis
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue={personas[0]?.name} className="w-full">
          <TabsList className="mb-4 w-full flex overflow-x-auto">
            {personas.map((persona, index) => (
              <TabsTrigger
                key={`persona-tab-${index}`}
                value={persona.name}
                // TabsTrigger handles selection state automatically
                className="flex items-center"
              >
                <Avatar className="h-6 w-6 mr-2">
                  <AvatarFallback>{getInitials(persona.name)}</AvatarFallback>
                </Avatar>
                <span>{persona.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {personas.map((persona, index) => (
            <TabsContent key={`persona-content-${index}`} value={persona.name} className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{persona.name}</h2>
                  <p className="text-muted-foreground">{persona.description}</p>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className={getConfidenceColor(persona.confidence)}>
                        {Math.round(persona.confidence * 100)}% Overall Confidence
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{getConfidenceTooltip(persona.confidence)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Basic Information */}
              {persona.archetype && (
                <div className="mb-4">
                  <Badge variant="outline" className="text-sm">
                    {persona.archetype}
                  </Badge>
                </div>
              )}

              {/* Tabs for different persona aspects */}
              <Tabs defaultValue="detailed" className="w-full mt-4">
                <TabsList className="mb-4">
                  <TabsTrigger value="detailed">Detailed Profile</TabsTrigger>
                  <TabsTrigger value="legacy">Legacy Fields</TabsTrigger>
                  <TabsTrigger value="patterns">Patterns & Evidence</TabsTrigger>
                </TabsList>

                {/* Detailed Profile Tab */}
                <TabsContent value="detailed" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderTraitCard('Demographics', persona.demographics)}
                    {renderTraitCard('Goals & Motivations', persona.goals_and_motivations)}
                    {renderTraitCard('Skills & Expertise', persona.skills_and_expertise)}
                    {renderTraitCard('Workflow & Environment', persona.workflow_and_environment)}
                    {renderTraitCard('Challenges & Frustrations', persona.challenges_and_frustrations)}
                    {renderTraitCard('Needs & Desires', persona.needs_and_desires)}
                    {renderTraitCard('Technology & Tools', persona.technology_and_tools)}
                    {renderTraitCard('Attitude Towards Research', persona.attitude_towards_research)}
                    {renderTraitCard('Attitude Towards AI', persona.attitude_towards_ai)}
                    {renderTraitCard('Key Quotes', persona.key_quotes)}
                  </div>
                </TabsContent>

                {/* Legacy Fields Tab */}
                <TabsContent value="legacy" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderTraitCard('Role Context', persona.role_context)}
                    {renderTraitCard('Key Responsibilities', persona.key_responsibilities)}
                    {renderTraitCard('Tools Used', persona.tools_used)}
                    {renderTraitCard('Collaboration Style', persona.collaboration_style)}
                    {renderTraitCard('Analysis Approach', persona.analysis_approach)}
                    {renderTraitCard('Pain Points', persona.pain_points)}
                  </div>
                </TabsContent>

                {/* Patterns & Evidence Tab */}
                <TabsContent value="patterns" className="space-y-4">
                  {/* Patterns */}
                  {persona.patterns && persona.patterns.length > 0 && (
                    <div className="mt-2">
                      <h3 className="text-sm font-medium mb-2">Associated Patterns</h3>
                      <ul className="list-disc pl-5">
                        {persona.patterns.map((pattern, i) => (
                          <li key={i} className="text-sm">{pattern}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Evidence */}
                  {persona.evidence && persona.evidence.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium mb-2">Supporting Evidence</h3>
                      <ul className="list-disc pl-5">
                        {persona.evidence.map((item, i) => (
                          <li key={i} className="text-sm text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
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
      </CardContent>
    </Card>
  );
}
