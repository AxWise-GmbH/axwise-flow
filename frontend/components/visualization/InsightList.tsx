'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type Insight } from '@/types/api';

interface InsightListProps {
  insights: Insight[];
  className?: string;
}

export function InsightList({ insights, className }: InsightListProps) {
  // Ensure we have valid insights data
  if (!insights || insights.length === 0) {
    return (
      <div className="w-full p-6 text-center">
        <p className="text-muted-foreground">No insights found in the analysis.</p>
      </div>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle>Analysis Insights</CardTitle>
        <CardDescription>
          {insights.length} insight{insights.length !== 1 ? 's' : ''} generated from the analysis
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Accordion type="multiple" className="w-full">
          {insights.map((insight, index) => (
            <AccordionItem key={`insight-${index}`} value={`insight-${index}`}>
              <AccordionTrigger className="hover:bg-muted/50 px-4 py-2 rounded-md">
                <div className="flex items-center gap-2 text-left">
                  <span className="font-medium">{insight.topic}</span>
                  <Badge variant="outline" className="ml-2">
                    {insight.evidence.length} {insight.evidence.length === 1 ? 'evidence' : 'evidences'}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-2 pb-4">
                <div className="space-y-4">
                  {/* Observation */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Observation</h4>
                    <p className="text-sm text-muted-foreground">{insight.observation}</p>
                  </div>

                  {/* Evidence */}
                  {insight.evidence && insight.evidence.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Supporting Evidence</h4>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                        {insight.evidence.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
