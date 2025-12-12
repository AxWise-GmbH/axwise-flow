'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Target,
  ShieldAlert,
  MessageSquare,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type { CallIntelligence, ObjectionDetail, PersonaDetail } from '@/lib/precall/types';
import { PersonaAvatar } from './PersonaAvatar';

interface CloseTabProps {
  intelligence: CallIntelligence;
  companyContext?: string;
  /** Time period for historical context (e.g., '1943-1945') */
  timePeriod?: string;
  /** Additional historical context (e.g., 'World War II Military Intelligence') */
  historicalContext?: string;
}

const likelihoodColors: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

function ObjectionItem({
  objection,
  index,
  sourcePersona,
  companyContext,
  timePeriod,
  historicalContext,
}: {
  objection: ObjectionDetail;
  index: number;
  sourcePersona?: PersonaDetail;
  companyContext?: string;
  timePeriod?: string;
  historicalContext?: string;
}) {
  return (
    <AccordionItem value={`objection-${index}`} className="border rounded-lg px-3 mb-2">
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-start gap-3 text-left flex-1">
          <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm pr-4">"{objection.objection}"</p>
            {objection.source_persona && (
              <div className="flex items-center gap-2 mt-1">
                {sourcePersona && (
                  <PersonaAvatar
                    name={sourcePersona.name}
                    role={sourcePersona.role}
                    communicationStyle={sourcePersona.communication_style}
                    companyContext={companyContext}
                    timePeriod={timePeriod}
                    historicalContext={historicalContext}
                    size="sm"
                    asDiv
                  />
                )}
                <span className="text-xs text-muted-foreground">
                  Likely from: {objection.source_persona}
                </span>
              </div>
            )}
          </div>
          <Badge
            variant="outline"
            className={`text-xs flex-shrink-0 ${likelihoodColors[objection.likelihood]}`}
          >
            {objection.likelihood}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4 pl-8">
          {/* Rebuttal */}
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-green-700 mb-1">
              <MessageSquare className="h-3.5 w-3.5" />
              REBUTTAL
            </div>
            <p className="text-sm bg-green-50 p-3 rounded-md border border-green-100">
              {objection.rebuttal}
            </p>
          </div>

          {/* Proactive Hook */}
          {objection.hook && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-blue-700 mb-1">
                <Sparkles className="h-3.5 w-3.5" />
                PROACTIVE HOOK
              </div>
              <p className="text-sm italic bg-blue-50 p-3 rounded-md border border-blue-100">
                "{objection.hook}"
              </p>
            </div>
          )}

          {/* Supporting Evidence */}
          {objection.supporting_evidence && objection.supporting_evidence.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                Evidence:
              </div>
              <ul className="space-y-1">
                {objection.supporting_evidence.map((ev, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span>•</span>
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * CLOSE Tab - Objection handling & closing
 *
 * Displays: Objections with Rebuttals/Hooks, Closing Strategy, Next Steps
 */
export function CloseTab({ intelligence, companyContext, timePeriod, historicalContext }: CloseTabProps) {
  const { callGuide, objections, personas } = intelligence;

  // Sort objections by likelihood (high first)
  const sortedObjections = [...objections].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.likelihood] || 1) - (order[b.likelihood] || 1);
  });

  // Create a map of persona names to their details for avatar lookup
  const personaMap = new Map<string, PersonaDetail>();
  personas.forEach(p => {
    personaMap.set(p.name.toLowerCase(), p);
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Closing Strategy - Primary */}
        <Card className="border-2 border-red-500 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-red-600" />
              Closing Strategy
              <Badge variant="secondary" className="text-xs ml-auto">
                Your CTA
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {callGuide?.closing_strategy ? (
              <div className="bg-white p-4 rounded-md border border-red-200">
                <p className="text-sm leading-relaxed">
                  {callGuide.closing_strategy}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No closing strategy generated.
              </p>
            )}
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
              <ArrowRight className="h-4 w-4" />
              <span>
                <strong>Next Step:</strong> Always end with a clear call-to-action
                (schedule follow-up, send proposal, demo, etc.)
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Objections */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-600" />
              Anticipated Objections
            </h3>
            <Badge variant="secondary" className="text-xs">
              {objections.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Click each objection to see the prepared rebuttal and proactive hook.
          </p>

          {sortedObjections.length > 0 ? (
            <Accordion type="multiple" className="space-y-0">
              {sortedObjections.map((objection, idx) => {
                // Try to find the source persona for avatar
                const sourcePersona = objection.source_persona
                  ? personaMap.get(objection.source_persona.toLowerCase())
                  : undefined;
                return (
                  <ObjectionItem
                    key={idx}
                    objection={objection}
                    index={idx}
                    sourcePersona={sourcePersona}
                    companyContext={companyContext}
                    timePeriod={timePeriod}
                    historicalContext={historicalContext}
                  />
                );
              })}
            </Accordion>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-4 text-center text-muted-foreground">
                <p className="text-sm">No objections identified.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

export default CloseTab;

