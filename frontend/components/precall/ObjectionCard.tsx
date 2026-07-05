'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ShieldAlert, MessageSquare, Sparkles } from 'lucide-react';
import type { ObjectionDetail } from '@/lib/precall/types';

interface ObjectionCardProps {
  objection: ObjectionDetail;
  index: number;
}

/**
 * Card component for displaying an objection with rebuttal and hook
 */
export function ObjectionCard({ objection, index }: ObjectionCardProps) {
  const likelihoodColors = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800',
  };

  return (
    <Card className="border-l-4 border-l-orange-500 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value={`objection-${index}`} className="border-none">
            <AccordionTrigger className="hover:no-underline py-0">
              <div className="flex items-start gap-3 text-left flex-1">
                <ShieldAlert className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-foreground">
                      "{objection.objection}"
                    </span>
                  </div>
                </div>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${likelihoodColors[objection.likelihood]} flex-shrink-0`}
                >
                  {objection.likelihood}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-0">
              <div className="space-y-4 pl-8">
                {/* Rebuttal */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Rebuttal
                  </div>
                  <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md">
                    {objection.rebuttal}
                  </p>
                </div>

                {/* Hook */}
                {objection.hook && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <Sparkles className="h-3.5 w-3.5" />
                      Proactive Hook
                    </div>
                    <p className="text-sm text-foreground italic bg-blue-50 p-3 rounded-md border border-blue-100">
                      "{objection.hook}"
                    </p>
                  </div>
                )}

                {/* Supporting Evidence */}
                {objection.supporting_evidence?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Supporting Evidence
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {objection.supporting_evidence.map((evidence, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-muted-foreground">•</span>
                          {evidence}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default ObjectionCard;

