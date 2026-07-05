'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertTriangle,
  CheckCircle,
  Users,
  TrendingUp,
  TrendingDown,
  Info,
  Target
} from 'lucide-react';
import type { Persona, ConflictIndicator, ConsensusLevel } from '@/types/api';

interface PersonaConflictConsensusViewProps {
  personas: Persona[];
  className?: string;
}

interface ConflictSummary {
  topic: string;
  severity: number;
  affectedPersonas: string[];
  descriptions: string[];
  evidence: string[];
}

interface ConsensusSummary {
  topic: string;
  agreement_score: number;
  participatingPersonas: string[];
  evidence: string[];
}

export function PersonaConflictConsensusView({ personas, className }: PersonaConflictConsensusViewProps) {
  
  // Extract and aggregate conflicts from all personas
  const conflictSummaries = React.useMemo(() => {
    const conflictMap = new Map<string, ConflictSummary>();
    
    personas.forEach(persona => {
      if (persona.stakeholder_intelligence?.conflict_indicators) {
        persona.stakeholder_intelligence.conflict_indicators.forEach(conflict => {
          const existing = conflictMap.get(conflict.topic);
          if (existing) {
            existing.affectedPersonas.push(persona.name);
            existing.descriptions.push(conflict.description);
            existing.evidence.push(...conflict.evidence);
            existing.severity = Math.max(existing.severity, conflict.severity);
          } else {
            conflictMap.set(conflict.topic, {
              topic: conflict.topic,
              severity: conflict.severity,
              affectedPersonas: [persona.name],
              descriptions: [conflict.description],
              evidence: [...conflict.evidence]
            });
          }
        });
      }
    });
    
    return Array.from(conflictMap.values()).sort((a, b) => b.severity - a.severity);
  }, [personas]);

  // Extract and aggregate consensus from all personas
  const consensusSummaries = React.useMemo(() => {
    const consensusMap = new Map<string, ConsensusSummary>();
    
    personas.forEach(persona => {
      if (persona.stakeholder_intelligence?.consensus_levels) {
        persona.stakeholder_intelligence.consensus_levels.forEach(consensus => {
          const existing = consensusMap.get(consensus.theme_or_pattern);
          if (existing) {
            existing.participatingPersonas.push(persona.name);
            existing.evidence.push(...consensus.supporting_evidence);
            // Average the agreement scores
            existing.agreement_score = (existing.agreement_score + consensus.agreement_score) / 2;
          } else {
            consensusMap.set(consensus.theme_or_pattern, {
              topic: consensus.theme_or_pattern,
              agreement_score: consensus.agreement_score,
              participatingPersonas: [persona.name],
              evidence: [...consensus.supporting_evidence]
            });
          }
        });
      }
    });
    
    return Array.from(consensusMap.values()).sort((a, b) => b.agreement_score - a.agreement_score);
  }, [personas]);

  // Get severity color
  const getSeverityColor = (severity: number) => {
    if (severity >= 0.8) return 'text-red-600 bg-red-50';
    if (severity >= 0.6) return 'text-orange-600 bg-orange-50';
    if (severity >= 0.4) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  // Get agreement color
  const getAgreementColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-blue-600 bg-blue-50';
    return 'text-gray-600 bg-gray-50';
  };

  if (conflictSummaries.length === 0 && consensusSummaries.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <Target className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No conflict or consensus data available</p>
            <p className="text-sm">Enhanced personas with stakeholder intelligence will show conflict and consensus analysis</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Target className="h-5 w-5 mr-2" />
          Persona Conflicts & Consensus
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conflicts">
              Conflicts ({conflictSummaries.length})
            </TabsTrigger>
            <TabsTrigger value="consensus">
              Consensus ({consensusSummaries.length})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Conflict Overview */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                    Conflict Areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold text-red-600">
                      {conflictSummaries.length}
                    </div>
                    <div className="text-xs text-gray-600">
                      Areas of disagreement identified
                    </div>
                    {conflictSummaries.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Highest Severity:</div>
                        <Badge className={getSeverityColor(conflictSummaries[0].severity)}>
                          {conflictSummaries[0].topic} ({Math.round(conflictSummaries[0].severity * 100)}%)
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Consensus Overview */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                    Consensus Areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold text-green-600">
                      {consensusSummaries.length}
                    </div>
                    <div className="text-xs text-gray-600">
                      Areas of agreement identified
                    </div>
                    {consensusSummaries.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Highest Agreement:</div>
                        <Badge className={getAgreementColor(consensusSummaries[0].agreement_score)}>
                          {consensusSummaries[0].topic} ({Math.round(consensusSummaries[0].agreement_score * 100)}%)
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Conflict vs Consensus Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-600">Conflicts</span>
                    <span className="text-sm text-green-600">Consensus</span>
                  </div>
                  <div className="relative">
                    <Progress 
                      value={(consensusSummaries.length / (conflictSummaries.length + consensusSummaries.length)) * 100} 
                      className="h-4"
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                      {Math.round((consensusSummaries.length / (conflictSummaries.length + consensusSummaries.length)) * 100)}% Consensus
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Conflicts Tab */}
          <TabsContent value="conflicts" className="space-y-4">
            {conflictSummaries.length > 0 ? (
              conflictSummaries.map((conflict, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                        {conflict.topic}
                      </CardTitle>
                      <Badge className={getSeverityColor(conflict.severity)}>
                        {Math.round(conflict.severity * 100)}% Severity
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">Affected Personas:</div>
                        <div className="flex flex-wrap gap-1">
                          {conflict.affectedPersonas.map((persona, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {persona}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">Descriptions:</div>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {conflict.descriptions.map((desc, i) => (
                            <li key={i} className="flex items-start">
                              <span className="w-2 h-2 bg-red-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                              {desc}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No conflicts identified between personas</p>
              </div>
            )}
          </TabsContent>

          {/* Consensus Tab */}
          <TabsContent value="consensus" className="space-y-4">
            {consensusSummaries.length > 0 ? (
              consensusSummaries.map((consensus, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center">
                        <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                        {consensus.topic}
                      </CardTitle>
                      <Badge className={getAgreementColor(consensus.agreement_score)}>
                        {Math.round(consensus.agreement_score * 100)}% Agreement
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">Participating Personas:</div>
                        <div className="flex flex-wrap gap-1">
                          {consensus.participatingPersonas.map((persona, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {persona}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">Agreement Level:</div>
                        <Progress value={consensus.agreement_score * 100} className="h-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No consensus areas identified between personas</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
