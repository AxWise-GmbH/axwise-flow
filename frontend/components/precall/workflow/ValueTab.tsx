'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Lightbulb,
  CheckCircle,
  Quote,
} from 'lucide-react';
import type { CallIntelligence, KeyInsight } from '@/lib/precall/types';

interface ValueTabProps {
  intelligence: CallIntelligence;
}

function SupportingInsightCard({ insight, index }: { insight: KeyInsight; index: number }) {
  const priorityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800',
  };

  return (
    <Card className="border-l-4 border-l-amber-300">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">#{index + 1}</span>
              <h4 className="font-medium text-sm">{insight.title}</h4>
            </div>
            <p className="text-xs text-muted-foreground">{insight.description}</p>
            {insight.source && (
              <p className="text-xs text-muted-foreground mt-2 italic flex items-center gap-1">
                <Quote className="h-3 w-3" />
                {insight.source}
              </p>
            )}
          </div>
          <Badge
            variant="outline"
            className={`text-xs ${priorityColors[insight.priority]}`}
          >
            {insight.priority}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * VALUE Tab - Value presentation
 *
 * Displays: Value Proposition, Supporting Evidence, Medium/Low Priority Insights
 */
export function ValueTab({ intelligence }: ValueTabProps) {
  const { callGuide, keyInsights, objections } = intelligence;

  // Filter medium/low priority insights as supporting points
  const supportingInsights = keyInsights.filter(
    (insight) => insight.priority === 'medium' || insight.priority === 'low'
  );

  // Collect all supporting evidence from objections
  const allEvidence = objections.flatMap((obj) => obj.supporting_evidence || []);
  const uniqueEvidence = [...new Set(allEvidence)];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Value Proposition - Main Focus */}
        <Card className="border-2 border-amber-500 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              Your Value Proposition
              <Badge variant="secondary" className="text-xs ml-auto">
                Core Message
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {callGuide?.value_proposition ? (
              <div className="bg-white p-4 rounded-md border border-amber-200">
                <p className="text-sm leading-relaxed">
                  {callGuide.value_proposition}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No value proposition generated.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              💡 <strong>Delivery tip:</strong> Lead with their pain point, then
              bridge to your solution. Make it about them, not you.
            </p>
          </CardContent>
        </Card>

        {/* Supporting Evidence */}
        {uniqueEvidence.length > 0 && (
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Supporting Evidence
                <Badge variant="secondary" className="text-xs ml-auto">
                  {uniqueEvidence.length} points
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2">
                {uniqueEvidence.map((evidence, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{evidence}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Supporting Insights (Medium/Low Priority) */}
        {supportingInsights.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-600" />
                Supporting Points
              </h3>
              <Badge variant="secondary" className="text-xs">
                {supportingInsights.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Use these as backup talking points or to reinforce your value proposition.
            </p>
            <div className="space-y-2">
              {supportingInsights.map((insight, idx) => (
                <SupportingInsightCard key={idx} insight={insight} index={idx} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!callGuide?.value_proposition && supportingInsights.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                No value proposition or supporting points available.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

export default ValueTab;

