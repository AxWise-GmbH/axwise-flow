'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Lightbulb,
  Users,
  Clock,
  Crown,
  UserCheck,
  Wrench,
  ShieldAlert,
} from 'lucide-react';
import type { CallIntelligence, PersonaDetail } from '@/lib/precall/types';
import { PersonaAvatar } from './PersonaAvatar';

interface PrepTabProps {
  intelligence: CallIntelligence;
  companyContext?: string;
  /** Time period for historical context (e.g., '1943-1945') */
  timePeriod?: string;
  /** Additional historical context (e.g., 'World War II Military Intelligence') */
  historicalContext?: string;
}

const roleIcons: Record<string, React.ElementType> = {
  primary: Crown,
  secondary: UserCheck,
  executor: Wrench,
  blocker: ShieldAlert,
};

const roleColors: Record<string, string> = {
  primary: 'bg-amber-100 text-amber-800 border-amber-200',
  secondary: 'bg-blue-100 text-blue-800 border-blue-200',
  executor: 'bg-green-100 text-green-800 border-green-200',
  blocker: 'bg-red-100 text-red-800 border-red-200',
};

function PersonaOverviewCard({
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
  const role = persona.role_in_decision || 'secondary';
  const RoleIcon = roleIcons[role] || UserCheck;

  return (
    <Card className="border-l-4 border-l-purple-400">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <PersonaAvatar
            name={persona.name}
            role={persona.role}
            communicationStyle={persona.communication_style}
            companyContext={companyContext}
            timePeriod={timePeriod}
            historicalContext={historicalContext}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-semibold text-sm truncate">{persona.name}</h4>
                <p className="text-xs text-muted-foreground">{persona.role}</p>
              </div>
              <Badge
                variant="outline"
                className={`text-xs flex items-center gap-1 ${roleColors[role]}`}
              >
                <RoleIcon className="h-3 w-3" />
                {role}
              </Badge>
            </div>
            {persona.communication_style && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                Style: {persona.communication_style}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * PREP Tab - Pre-call preparation
 *
 * Displays: Executive Summary, High-Priority Insights, Personas Overview, Time Allocation
 */
export function PrepTab({ intelligence, companyContext, timePeriod, historicalContext }: PrepTabProps) {
  const { summary, keyInsights, personas, callGuide } = intelligence;

  // Filter high-priority insights
  const highPriorityInsights = keyInsights.filter(
    (insight) => insight.priority === 'high'
  );

  const timeAllocation = callGuide?.time_allocation || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Executive Summary */}
        {summary && (
          <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm leading-relaxed">{summary}</p>
            </CardContent>
          </Card>
        )}

        {/* High-Priority Insights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              Key Intel (High Priority)
            </h3>
            <Badge variant="secondary" className="text-xs">
              {highPriorityInsights.length}
            </Badge>
          </div>
          {highPriorityInsights.length > 0 ? (
            <div className="space-y-2">
              {highPriorityInsights.map((insight, idx) => (
                <Card key={idx} className="border-l-4 border-l-amber-400">
                  <CardContent className="p-3">
                    <h4 className="font-semibold text-sm">{insight.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {insight.description}
                    </p>
                    {insight.source && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        Source: {insight.source}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No high-priority insights identified.
            </p>
          )}
        </div>

        {/* Personas Overview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              Key Stakeholders
            </h3>
            <Badge variant="secondary" className="text-xs">
              {personas.length}
            </Badge>
          </div>
          {personas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {personas.map((persona, idx) => (
                <PersonaOverviewCard
                  key={idx}
                  persona={persona}
                  companyContext={companyContext}
                  timePeriod={timePeriod}
                  historicalContext={historicalContext}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No stakeholders identified.
            </p>
          )}
        </div>

        {/* Time Allocation */}
        {timeAllocation.length > 0 && (
          <Card className="border-l-4 border-l-gray-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-600" />
                Call Time Allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {timeAllocation.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize font-medium">{item.phase}</span>
                        <span className="text-muted-foreground">{item.percentage}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

export default PrepTab;

