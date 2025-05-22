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
              <AccordionTrigger className="hover:bg-muted/50 dark:hover:bg-muted/20 px-4 py-2 rounded-md">
                <div className="flex items-center gap-2 text-left">
                  <span className="font-medium">{insight.topic}</span>
                  {insight.priority && (
                    <Badge
                      variant={insight.priority === 'High' ? 'destructive' :
                              insight.priority === 'Medium' ? 'default' : 'outline'}
                      className="ml-2"
                    >
                      {insight.priority} Priority
                    </Badge>
                  )}
                  <Badge variant="outline" className="ml-2 dark:border-slate-700 dark:bg-slate-800/50">
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

                  {/* Implication */}
                  {insight.implication && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Implication</h4>
                      <p className="text-sm text-muted-foreground">{insight.implication}</p>
                    </div>
                  )}

                  {/* Recommendation */}
                  {insight.recommendation && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Recommendation</h4>
                      <p className="text-sm text-muted-foreground">{insight.recommendation}</p>
                    </div>
                  )}

                  {/* Evidence */}
                  {insight.evidence && insight.evidence.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Supporting Evidence</h4>
                      <div className="pl-3 border-l-2 border-primary/20 dark:border-primary/30">
                        <ul className="space-y-2">
                          {insight.evidence.map((item, i) => (
                            <li key={i} className="relative bg-muted/30 dark:bg-slate-800/50 p-3 rounded-md">
                              <div className="absolute top-0 left-0 h-full w-1 bg-primary/30 dark:bg-primary/40 rounded-l-md"></div>
                              <p className="text-sm text-muted-foreground">{item}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
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
