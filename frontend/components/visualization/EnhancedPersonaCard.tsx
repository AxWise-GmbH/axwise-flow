'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  User,
  Crown,
  Users,
  Zap,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Network,
  Target,
  Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Persona, InfluenceMetrics, PersonaRelationship, ConflictIndicator, ConsensusLevel } from '@/types/api';
import { extractKeywords, renderHighlightedText, renderMarkdownWithHighlighting, getKeywordsForRendering } from '@/utils/personaEnhancements';
import { parseDemographics } from '@/utils/demographicsParser';

interface EnhancedPersonaCardProps {
  persona: Persona;
  className?: string;
  showStakeholderFeatures?: boolean;
}

export function EnhancedPersonaCard({
  persona,
  className,
  showStakeholderFeatures = true
}: EnhancedPersonaCardProps) {

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };



  // Get keywords from trait (use actual_keywords from backend if available, fallback to extraction)
  const getTraitKeywords = (trait: any, traitName: string): string[] => {
    // First try to use actual keywords from backend
    if (trait?.actual_keywords && Array.isArray(trait.actual_keywords) && trait.actual_keywords.length > 0) {
      return trait.actual_keywords;
    }

    // Fallback to frontend extraction if no backend keywords
    return extractKeywords(trait?.value || '', traitName);
  };

  // Render keywords as JSX
  const renderKeywords = (keywords: string[]) => {
    const filteredKeywords = getKeywordsForRendering(keywords);
    if (!filteredKeywords.length) return null;

    return (
      <div className="keywords">
        {filteredKeywords.map((keyword: string, index: number) => (
          <span key={`keyword-${index}`} className="keyword">
            {keyword}
          </span>
        ))}
      </div>
    );
  };

  // Get stakeholder type color and icon
  const getStakeholderTypeInfo = (type: string) => {
    switch (type) {
      case 'decision_maker':
        return { color: 'bg-purple-100 text-purple-800', icon: Crown, label: 'Decision Maker' };
      case 'primary_customer':
        return { color: 'bg-blue-100 text-blue-800', icon: User, label: 'Primary Customer' };
      case 'secondary_user':
        return { color: 'bg-green-100 text-green-800', icon: Users, label: 'Secondary User' };
      case 'influencer':
        return { color: 'bg-orange-100 text-orange-800', icon: Zap, label: 'Influencer' };
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: User, label: 'Stakeholder' };
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Get influence metric color
  const getInfluenceColor = (score: number) => {
    if (score >= 0.7) return 'bg-green-500';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Get relationship type info
  const getRelationshipTypeInfo = (type: string) => {
    switch (type) {
      case 'collaborates_with':
        return { color: 'text-blue-600', icon: Users, label: 'Collaborates' };
      case 'reports_to':
        return { color: 'text-purple-600', icon: ArrowRight, label: 'Reports To' };
      case 'influences':
        return { color: 'text-orange-600', icon: Zap, label: 'Influences' };
      case 'conflicts_with':
        return { color: 'text-red-600', icon: AlertTriangle, label: 'Conflicts' };
      default:
        return { color: 'text-gray-600', icon: Network, label: 'Related' };
    }
  };

  const stakeholderIntelligence = persona.stakeholder_intelligence;
  const hasStakeholderFeatures = showStakeholderFeatures && stakeholderIntelligence;

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-blue-100 text-blue-800 font-semibold">
                {getInitials(persona.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{persona.name}</CardTitle>
              {persona.archetype && (
                <CardDescription className="text-sm text-gray-600">
                  {persona.archetype}
                </CardDescription>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end space-y-2">
            {/* Confidence Badge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={getConfidenceColor(persona.confidence)}>
                    {Math.round(persona.confidence * 100)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Overall confidence in persona accuracy</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Stakeholder Type Badge */}
            {hasStakeholderFeatures && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className={getStakeholderTypeInfo(stakeholderIntelligence.stakeholder_type).color}>
                      {React.createElement(getStakeholderTypeInfo(stakeholderIntelligence.stakeholder_type).icon, {
                        className: "h-3 w-3 mr-1"
                      })}
                      {getStakeholderTypeInfo(stakeholderIntelligence.stakeholder_type).label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Stakeholder classification in the business context</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description with highlighting */}
        <div className="space-y-2">
          <p
            className="text-sm text-gray-700"
            dangerouslySetInnerHTML={renderHighlightedText(persona.description)}
          />
          {/* Keywords for description */}
          {renderKeywords(extractKeywords(persona.description, 'general'))}
        </div>

        {/* Stakeholder Intelligence Features */}
        {hasStakeholderFeatures && (
          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center">
              <Brain className="h-4 w-4 mr-2" />
              Stakeholder Intelligence
            </h4>

            {/* Influence Metrics */}
            <div className="space-y-3">
              <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Influence Metrics</h5>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Crown className="h-3 w-3 text-purple-600" />
                    <span className="text-xs">Decision Power</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Progress
                      value={stakeholderIntelligence.influence_metrics.decision_power * 100}
                      className="w-16 h-2"
                    />
                    <span className="text-xs font-medium">
                      {Math.round(stakeholderIntelligence.influence_metrics.decision_power * 100)}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-3 w-3 text-blue-600" />
                    <span className="text-xs">Technical Influence</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Progress
                      value={stakeholderIntelligence.influence_metrics.technical_influence * 100}
                      className="w-16 h-2"
                    />
                    <span className="text-xs font-medium">
                      {Math.round(stakeholderIntelligence.influence_metrics.technical_influence * 100)}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-3 w-3 text-green-600" />
                    <span className="text-xs">Budget Influence</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Progress
                      value={stakeholderIntelligence.influence_metrics.budget_influence * 100}
                      className="w-16 h-2"
                    />
                    <span className="text-xs font-medium">
                      {Math.round(stakeholderIntelligence.influence_metrics.budget_influence * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Relationships */}
            {stakeholderIntelligence.relationships.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Relationships</h5>
                <div className="space-y-1">
                  {stakeholderIntelligence.relationships.slice(0, 3).map((relationship, index) => {
                    const relationshipInfo = getRelationshipTypeInfo(relationship.relationship_type);
                    return (
                      <TooltipProvider key={index}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                              <div className="flex items-center space-x-2">
                                {React.createElement(relationshipInfo.icon, {
                                  className: `h-3 w-3 ${relationshipInfo.color}`
                                })}
                                <span>{relationshipInfo.label}</span>
                                <span className="text-gray-600">{relationship.target_persona_id}</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {Math.round(relationship.strength * 100)}%
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{relationship.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                  {stakeholderIntelligence.relationships.length > 3 && (
                    <p className="text-xs text-gray-500 text-center">
                      +{stakeholderIntelligence.relationships.length - 3} more relationships
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Conflicts and Consensus Indicators */}
            <div className="flex space-x-4">
              {stakeholderIntelligence.conflict_indicators.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center space-x-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{stakeholderIntelligence.conflict_indicators.length} conflicts</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        {stakeholderIntelligence.conflict_indicators.slice(0, 3).map((conflict, index) => (
                          <p key={index} className="text-xs">{conflict.topic}</p>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {stakeholderIntelligence.consensus_levels.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center space-x-1 text-xs text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        <span>{stakeholderIntelligence.consensus_levels.length} consensus</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        {stakeholderIntelligence.consensus_levels.slice(0, 3).map((consensus, index) => (
                          <p key={index} className="text-xs">
                            {consensus.theme_or_pattern}: {Math.round(consensus.agreement_score * 100)}%
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        )}

        {/* Traditional Persona Information */}
        <Accordion type="single" collapsible className="w-full">
          {persona.demographics && (
            <AccordionItem value="demographics">
              <AccordionTrigger className="text-sm">Demographics</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {/* Enhanced structured demographics formatting */}
                  {(() => {
                    try {
                      const parsedDemographics = parseDemographics(persona.demographics.value);



                      // If we successfully parsed structured data, display it formatted
                      if (parsedDemographics.length > 1 || (parsedDemographics.length === 1 && parsedDemographics[0].key !== 'Demographics')) {
                        return (
                          <div className="space-y-3">
                            {parsedDemographics.map((item, index) => (
                              <div key={index} className="flex flex-col sm:flex-row sm:items-start border-l-2 border-gray-100 pl-3">
                                <span className="font-semibold text-gray-900 min-w-[140px] mb-1 sm:mb-0 text-sm">
                                  {item.key}:
                                </span>
                                <span className="text-gray-700 sm:ml-3 leading-relaxed text-sm">
                                  {item.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      } else {
                        // Fallback to original display for unstructured content
                        return (
                          <p
                            className="text-sm text-gray-700"
                            dangerouslySetInnerHTML={renderHighlightedText(persona.demographics.value)}
                          />
                        );
                      }
                    } catch (error) {
                      // Error fallback - display original content
                      return (
                        <p
                          className="text-sm text-gray-700"
                          dangerouslySetInnerHTML={renderHighlightedText(persona.demographics.value)}
                        />
                      );
                    }
                  })()}

                  {/* Keywords for demographics */}
                  {renderKeywords(getTraitKeywords(persona.demographics, 'demographics'))}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {Math.round(persona.demographics.confidence * 100)}% confidence
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {persona.demographics.evidence?.length || 0} evidence points
                    </span>
                  </div>
                  {persona.demographics.evidence && persona.demographics.evidence.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-xs font-medium text-gray-600 mb-2">Supporting Evidence</h5>
                      <ul className="list-disc pl-5 space-y-1">
                        {persona.demographics.evidence.map((evidence: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-xs text-gray-600"
                            dangerouslySetInnerHTML={renderHighlightedText(evidence)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {persona.goals_and_motivations && (
            <AccordionItem value="goals">
              <AccordionTrigger className="text-sm">Goals & Motivations</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <p
                    className="text-sm text-gray-700"
                    dangerouslySetInnerHTML={renderHighlightedText(persona.goals_and_motivations.value)}
                  />
                  {/* Keywords for goals and motivations */}
                  {renderKeywords(getTraitKeywords(persona.goals_and_motivations, 'goals_and_motivations'))}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {Math.round(persona.goals_and_motivations.confidence * 100)}% confidence
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {persona.goals_and_motivations.evidence?.length || 0} evidence points
                    </span>
                  </div>
                  {persona.goals_and_motivations.evidence && persona.goals_and_motivations.evidence.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-xs font-medium text-gray-600 mb-2">Supporting Evidence</h5>
                      <ul className="list-disc pl-5 space-y-1">
                        {persona.goals_and_motivations.evidence.map((evidence: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-xs text-gray-600"
                            dangerouslySetInnerHTML={renderHighlightedText(evidence)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {persona.challenges_and_frustrations && (
            <AccordionItem value="challenges">
              <AccordionTrigger className="text-sm">Challenges & Frustrations</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <p
                    className="text-sm text-gray-700"
                    dangerouslySetInnerHTML={renderHighlightedText(persona.challenges_and_frustrations.value)}
                  />
                  {/* Keywords for challenges and frustrations */}
                  {renderKeywords(getTraitKeywords(persona.challenges_and_frustrations, 'challenges_and_frustrations'))}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {Math.round(persona.challenges_and_frustrations.confidence * 100)}% confidence
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {persona.challenges_and_frustrations.evidence?.length || 0} evidence points
                    </span>
                  </div>
                  {persona.challenges_and_frustrations.evidence && persona.challenges_and_frustrations.evidence.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-xs font-medium text-gray-600 mb-2">Supporting Evidence</h5>
                      <ul className="list-disc pl-5 space-y-1">
                        {persona.challenges_and_frustrations.evidence.map((evidence: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-xs text-gray-600"
                            dangerouslySetInnerHTML={renderHighlightedText(evidence)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}



















          {persona.key_quotes && (
            <AccordionItem value="key_quotes">
              <AccordionTrigger className="text-sm">Key Quotes</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="text-xs">
                      {Math.round(persona.key_quotes.confidence * 100)}% confidence
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {persona.key_quotes.evidence?.length || 0} quotes
                    </span>
                  </div>
                  {persona.key_quotes.evidence && persona.key_quotes.evidence.length > 0 && (
                    <div className="space-y-3">
                      {persona.key_quotes.evidence.map((quote: string, idx: number) => (
                        <blockquote key={idx} className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 rounded-r-lg">
                          <p
                            className="text-sm italic text-gray-700"
                            dangerouslySetInnerHTML={renderMarkdownWithHighlighting(`"${quote.replace(/^["']|["']$/g, '').trim()}"`)}
                          />
                        </blockquote>
                      ))}
                    </div>
                  )}
                  {persona.key_quotes.value && persona.key_quotes.value !== "Quotes extracted from other fields" && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p
                        className="text-xs text-gray-600"
                        dangerouslySetInnerHTML={renderMarkdownWithHighlighting(persona.key_quotes.value)}
                      />
                      {/* Keywords for key quotes */}
                      {renderKeywords(getTraitKeywords(persona.key_quotes, 'key_quotes'))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}
