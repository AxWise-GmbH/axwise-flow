'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, AlertTriangle, Info } from 'lucide-react';
import type { KeyInsight } from '@/lib/precall/types';

interface InsightCardProps {
  insight: KeyInsight;
  index: number;
}

/**
 * Card component for displaying a single key insight
 */
export function InsightCard({ insight, index }: InsightCardProps) {
  const priorityColors = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-green-100 text-green-800 border-green-200',
  };

  const PriorityIcon = insight.priority === 'high' 
    ? AlertTriangle 
    : insight.priority === 'medium' 
      ? Lightbulb 
      : Info;

  return (
    <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="flex-shrink-0 mt-0.5">
              <PriorityIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground font-medium">
                  #{index + 1}
                </span>
                <h4 className="font-semibold text-sm text-foreground truncate">
                  {insight.title}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {insight.description}
              </p>
              {insight.source && (
                <p className="text-xs text-muted-foreground mt-2 italic">
                  Source: {insight.source}
                </p>
              )}
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={`text-xs ${priorityColors[insight.priority]} flex-shrink-0`}
          >
            {insight.priority}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default InsightCard;

