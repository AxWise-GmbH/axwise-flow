'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PrioritizedInsight } from '@/types/api'; // Assuming types are defined here
import { cn } from '@/lib/utils';

interface PriorityInsightsDisplayProps {
  insights: PrioritizedInsight[] | null;
  className?: string;
}

// Helper to determine badge color based on urgency
const getUrgencyColor = (urgency: 'high' | 'medium' | 'low') => {
  switch (urgency) {
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
    case 'low':
    default:
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
  }
};

export function PriorityInsightsDisplay({ insights, className }: PriorityInsightsDisplayProps) {
  if (!insights || insights.length === 0) {
    return (
      <div className={cn("w-full p-6 text-center", className)}>
        <p className="text-muted-foreground">No prioritized insights available for this analysis.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <CardHeader>
          <CardTitle>Prioritized Insights</CardTitle>
          <CardDescription>
            Key themes and patterns ranked by potential impact, based on sentiment and frequency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {insights.map((insight, index) => (
            <Card key={index} className="border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-lg">{insight.name}</CardTitle>
                  <Badge className={cn("whitespace-nowrap", getUrgencyColor(insight.urgency))}>
                    {insight.urgency.toUpperCase()} Urgency
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground pt-1">
                  Type: {insight.type} | Score: {insight.priority_score.toFixed(2)}
                  {insight.category && ` | Category: ${insight.category}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-2">{insight.description}</p>
                {/* Optionally display original theme/pattern details */}
                {/* <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(insight.original, null, 2)}
                </pre> */}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default PriorityInsightsDisplay;