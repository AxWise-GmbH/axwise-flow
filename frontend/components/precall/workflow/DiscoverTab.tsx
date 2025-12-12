'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  HelpCircle,
  MessageCircleQuestion,
  Target,
  Lightbulb,
} from 'lucide-react';
import type { CallIntelligence, PersonaDetail } from '@/lib/precall/types';
import { PersonaAvatar } from './PersonaAvatar';

interface DiscoverTabProps {
  intelligence: CallIntelligence;
  companyContext?: string;
  /** Time period for historical context (e.g., '1943-1945') */
  timePeriod?: string;
  /** Additional historical context (e.g., 'World War II Military Intelligence') */
  historicalContext?: string;
}

function PersonaQuestionsCard({
  persona,
  companyContext,
  timePeriod,
  historicalContext,
}: {
  persona: PersonaDetail;
  companyContext?: string;
  timePeriod?: string;
  historicalContext?: string;
}) {
  const hasQuestions = persona.likely_questions && persona.likely_questions.length > 0;
  const hasConcerns = persona.decision_factors && persona.decision_factors.length > 0;

  if (!hasQuestions && !hasConcerns) return null;

  return (
    <Card className="border-l-4 border-l-purple-400">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-3">
          <PersonaAvatar
            name={persona.name}
            role={persona.role}
            communicationStyle={persona.communication_style}
            companyContext={companyContext}
            timePeriod={timePeriod}
            historicalContext={historicalContext}
            size="sm"
          />
          <span>{persona.name}</span>
          <Badge variant="outline" className="text-xs ml-auto">
            {persona.role}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Questions they might ask with suggested answers */}
        {hasQuestions && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <MessageCircleQuestion className="h-3 w-3" />
              Questions they may ask you:
            </p>
            <ul className="space-y-3">
              {persona.likely_questions.map((q, idx) => (
                <li key={idx} className="space-y-1">
                  <div className="text-sm text-orange-700 bg-orange-50 p-2 rounded border border-orange-200">
                    <span className="font-medium">Q:</span> "{q.question}"
                  </div>
                  {q.suggested_answer && (
                    <div className="text-sm text-green-700 bg-green-50 p-2 rounded border border-green-200 ml-4">
                      <span className="font-medium flex items-center gap-1 mb-1">
                        <Lightbulb className="h-3 w-3" /> Your Answer:
                      </span>
                      {q.suggested_answer}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Decision factors to probe */}
        {hasConcerns && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Decision factors to probe:
            </p>
            <ul className="space-y-1">
              {persona.decision_factors.map((factor, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-purple-500">→</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * DISCOVER Tab - Discovery & exploration
 *
 * Displays: Discovery Questions, Persona Likely Questions, Concerns to Probe
 */
export function DiscoverTab({ intelligence, companyContext, timePeriod, historicalContext }: DiscoverTabProps) {
  const { callGuide, personas } = intelligence;
  const discoveryQuestions = callGuide?.discovery_questions || [];

  // Filter personas that have questions or decision factors
  const personasWithContent = personas.filter(
    (p) =>
      (p.likely_questions && p.likely_questions.length > 0) ||
      (p.decision_factors && p.decision_factors.length > 0)
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Your Discovery Questions */}
        <Card className="border-2 border-blue-500 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-blue-600" />
              Your Discovery Questions
              <Badge variant="secondary" className="text-xs ml-auto">
                {discoveryQuestions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {discoveryQuestions.length > 0 ? (
              <ol className="space-y-3">
                {discoveryQuestions.map((question, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <Badge
                      variant="default"
                      className="text-xs flex-shrink-0 mt-0.5 bg-blue-600"
                    >
                      {idx + 1}
                    </Badge>
                    <span className="text-sm">{question}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No discovery questions generated.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
              💡 <strong>Tip:</strong> Listen more than you talk. Use follow-up
              questions like "Tell me more about that" or "How does that affect
              your team?"
            </p>
          </CardContent>
        </Card>

        {/* Per-Persona Questions & Concerns */}
        {personasWithContent.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-purple-600" />
              Stakeholder-Specific Discovery
            </h3>
            <div className="space-y-4">
              {personasWithContent.map((persona, idx) => (
                <PersonaQuestionsCard
                  key={idx}
                  persona={persona}
                  companyContext={companyContext}
                  timePeriod={timePeriod}
                  historicalContext={historicalContext}
                />
              ))}
            </div>
          </div>
        )}

        {/* If no persona content */}
        {personasWithContent.length === 0 && discoveryQuestions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                No discovery questions or stakeholder insights available.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

export default DiscoverTab;

