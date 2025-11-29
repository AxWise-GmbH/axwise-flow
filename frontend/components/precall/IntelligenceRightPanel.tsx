'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Users, BookOpen } from 'lucide-react';
import { PersonaCard } from './PersonaCard';
import { CallGuideSection } from './CallGuideSection';
import type { CallIntelligence } from '@/lib/precall/types';

interface IntelligenceRightPanelProps {
  intelligence: CallIntelligence;
  companyContext?: string;
}

/**
 * Right panel displaying personas and call guide
 */
export function IntelligenceRightPanel({ intelligence, companyContext }: IntelligenceRightPanelProps) {
  const { personas, callGuide } = intelligence;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Stakeholder Personas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              Stakeholder Personas
            </h3>
            <Badge variant="secondary" className="text-xs">
              {personas.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {personas.map((persona, index) => (
              <PersonaCard
                key={index}
                persona={persona}
                companyContext={companyContext}
              />
            ))}
            {personas.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No personas generated yet.
              </p>
            )}
          </div>
        </div>

        {/* Call Guide */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-green-600" />
              Call Guide
            </h3>
          </div>
          {callGuide ? (
            <CallGuideSection guide={callGuide} />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No call guide generated yet.
            </p>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

export default IntelligenceRightPanel;

