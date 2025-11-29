'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, ShieldAlert, FileText } from 'lucide-react';
import { InsightCard } from './InsightCard';
import { ObjectionCard } from './ObjectionCard';
import { LocalInsightsCard } from './LocalInsightsCard';
import type { CallIntelligence } from '@/lib/precall/types';

interface IntelligenceLeftPanelProps {
  intelligence: CallIntelligence;
}

/**
 * Left panel displaying key insights, objections, summary, and local bonding insights
 */
export function IntelligenceLeftPanel({ intelligence }: IntelligenceLeftPanelProps) {
  const { keyInsights, objections, summary, localIntelligence } = intelligence;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Summary */}
        {summary && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-600" />
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {summary}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Local Bonding Insights */}
        {localIntelligence && (
          <LocalInsightsCard localIntelligence={localIntelligence} />
        )}

        {/* Key Insights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              Key Insights
            </h3>
            <Badge variant="secondary" className="text-xs">
              {keyInsights.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {keyInsights.map((insight, index) => (
              <InsightCard key={index} insight={insight} index={index} />
            ))}
            {keyInsights.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No insights generated yet.
              </p>
            )}
          </div>
        </div>

        {/* Objections */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-600" />
              Potential Objections
            </h3>
            <Badge variant="secondary" className="text-xs">
              {objections.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {objections.map((objection, index) => (
              <ObjectionCard key={index} objection={objection} index={index} />
            ))}
            {objections.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No objections identified.
              </p>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

export default IntelligenceLeftPanel;

