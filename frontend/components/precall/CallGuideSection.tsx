'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  HelpCircle, 
  Sparkles, 
  Target, 
  Clock 
} from 'lucide-react';
import type { CallGuide } from '@/lib/precall/types';

interface CallGuideSectionProps {
  guide: CallGuide;
}

/**
 * Section component for displaying the structured call guide
 */
export function CallGuideSection({ guide }: CallGuideSectionProps) {
  const timeAllocation = guide.time_allocation;
  const totalTime = timeAllocation?.reduce((sum, item) => sum + item.percentage, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Opening Line */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-600" />
            Opening Line
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm italic bg-green-50 p-3 rounded-md border border-green-100">
            "{guide.opening_line}"
          </p>
        </CardContent>
      </Card>

      {/* Discovery Questions */}
      {guide.discovery_questions?.length > 0 && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-blue-600" />
              Discovery Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-2 text-sm">
              {guide.discovery_questions.map((question, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Badge variant="outline" className="text-xs flex-shrink-0 mt-0.5">
                    {i + 1}
                  </Badge>
                  <span className="text-muted-foreground">{question}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Value Proposition */}
      {guide.value_proposition && (
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              Value Proposition
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {guide.value_proposition}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Closing Strategy */}
      {guide.closing_strategy && (
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-600" />
              Closing Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {guide.closing_strategy}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Time Allocation */}
      {timeAllocation && timeAllocation.length > 0 && totalTime > 0 && (
        <Card className="border-l-4 border-l-gray-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-600" />
              Suggested Time Allocation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-2 flex-wrap">
              {timeAllocation.map((item, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs capitalize">
                  {item.phase}: {item.percentage}%
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CallGuideSection;

