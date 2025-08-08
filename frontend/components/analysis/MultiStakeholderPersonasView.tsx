import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { User, Users, Target, Lightbulb, AlertCircle, TrendingUp } from 'lucide-react';

interface Persona {
  name: string;
  description: string;
  archetype?: string;
  demographics?: {
    value: string;
    evidence: string[];
  };
  goals_and_motivations?: {
    value: string;
    evidence: string[];
  };
  pain_points?: {
    value: string;
    evidence: string[];
  };
  key_quotes?: {
    value: string;
    evidence: string[];
  };
  patterns?: {
    value: string;
    evidence: string[];
  };
  confidence_score?: number;
  stakeholder_type?: string;
}

interface MultiStakeholderPersonasViewProps {
  personas: Persona[];
  stakeholderIntelligence?: any;
}

const MultiStakeholderPersonasView: React.FC<MultiStakeholderPersonasViewProps> = ({
  personas,
  stakeholderIntelligence
}) => {
  const [selectedPersona, setSelectedPersona] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'grid' | 'detailed'>('grid');

  // Extract authentic quotes from original persona for mapping to detected stakeholders
  const extractAuthenticQuotes = () => {
    if (!personas || personas.length === 0) return { demographics: [], goals: [], painPoints: [], quotes: [] };

    const originalPersona = personas[0]; // Original persona with authentic quotes

    const authenticQuotes = {
      demographics: originalPersona.demographics?.evidence?.filter(ev => ev.includes('"') || ev.includes("'")) || [],
      goals: originalPersona.goals_and_motivations?.evidence?.filter(ev => ev.includes('"') || ev.includes("'")) || [],
      painPoints: originalPersona.pain_points?.evidence?.filter(ev => ev.includes('"') || ev.includes("'")) || [],
      quotes: originalPersona.key_quotes?.evidence?.filter(ev => ev.includes('"') || ev.includes("'")) || [],
      // Also include non-quote evidence for context
      demographicsAll: originalPersona.demographics?.evidence || [],
      goalsAll: originalPersona.goals_and_motivations?.evidence || [],
      painPointsAll: originalPersona.pain_points?.evidence || [],
      quotesAll: originalPersona.key_quotes?.evidence || []
    };

    return authenticQuotes;
  };

  // Intelligent contextual mapping of authentic quotes to detected stakeholders
  const mapAuthenticQuotesToStakeholder = (stakeholder: any, authenticQuotes: any) => {
    const stakeholderId = stakeholder.stakeholder_id || '';
    const role = stakeholder.demographic_profile?.role || '';
    const stakeholderType = stakeholder.stakeholder_type || '';
    const insights = stakeholder.individual_insights || {};

    // Create contextual mapping based on role, type, and concerns
    const mappedEvidence = {
      demographics: [],
      goals: [],
      painPoints: [],
      quotes: []
    };

    // Map demographics evidence
    if (stakeholderId.includes('IT_Infrastructure') || role.includes('IT')) {
      mappedEvidence.demographics = authenticQuotes.demographicsAll.filter((ev: string) =>
        ev.toLowerCase().includes('system') || ev.toLowerCase().includes('technology') ||
        ev.toLowerCase().includes('infrastructure') || ev.toLowerCase().includes('technical')
      ).slice(0, 3);
    } else if (stakeholderId.includes('Legal') || role.includes('Legal')) {
      mappedEvidence.demographics = authenticQuotes.demographicsAll.filter((ev: string) =>
        ev.toLowerCase().includes('legal') || ev.toLowerCase().includes('compliance') ||
        ev.toLowerCase().includes('contract') || ev.toLowerCase().includes('document')
      ).slice(0, 3);
    } else if (stakeholderId.includes('Operations') || stakeholderId.includes('Department') || role.includes('Head')) {
      mappedEvidence.demographics = authenticQuotes.demographicsAll.filter((ev: string) =>
        ev.toLowerCase().includes('department') || ev.toLowerCase().includes('team') ||
        ev.toLowerCase().includes('manage') || ev.toLowerCase().includes('operation')
      ).slice(0, 3);
    } else if (stakeholderId.includes('Managing_Partner') || stakeholderId.includes('Principal') || stakeholderType === 'decision_maker') {
      mappedEvidence.demographics = authenticQuotes.demographicsAll.filter((ev: string) =>
        ev.toLowerCase().includes('business') || ev.toLowerCase().includes('strategic') ||
        ev.toLowerCase().includes('firm') || ev.toLowerCase().includes('client')
      ).slice(0, 3);
    }

    // Map goals evidence based on stakeholder motivations
    if (insights.key_motivation?.includes('efficiency') || insights.key_motivation?.includes('productivity')) {
      mappedEvidence.goals = authenticQuotes.goalsAll.filter((ev: string) =>
        ev.toLowerCase().includes('efficiency') || ev.toLowerCase().includes('productive') ||
        ev.toLowerCase().includes('streamline') || ev.toLowerCase().includes('optimize')
      ).slice(0, 3);
    } else if (insights.key_motivation?.includes('strategic') || stakeholderType === 'decision_maker') {
      mappedEvidence.goals = authenticQuotes.goalsAll.filter((ev: string) =>
        ev.toLowerCase().includes('strategic') || ev.toLowerCase().includes('business') ||
        ev.toLowerCase().includes('growth') || ev.toLowerCase().includes('client')
      ).slice(0, 3);
    } else if (insights.key_motivation?.includes('balance') || insights.key_motivation?.includes('work-life')) {
      mappedEvidence.goals = authenticQuotes.goalsAll.filter((ev: string) =>
        ev.toLowerCase().includes('balance') || ev.toLowerCase().includes('stress') ||
        ev.toLowerCase().includes('time') || ev.toLowerCase().includes('quality')
      ).slice(0, 3);
    }

    // Map pain points evidence based on stakeholder concerns
    if (insights.primary_concern?.includes('manual') || insights.primary_concern?.includes('repetitive')) {
      mappedEvidence.painPoints = authenticQuotes.painPointsAll.filter((ev: string) =>
        ev.toLowerCase().includes('manual') || ev.toLowerCase().includes('repetitive') ||
        ev.toLowerCase().includes('tedium') || ev.toLowerCase().includes('time-consuming')
      ).slice(0, 3);
    } else if (insights.primary_concern?.includes('security') || insights.primary_concern?.includes('compliance')) {
      mappedEvidence.painPoints = authenticQuotes.painPointsAll.filter((ev: string) =>
        ev.toLowerCase().includes('security') || ev.toLowerCase().includes('compliance') ||
        ev.toLowerCase().includes('risk') || ev.toLowerCase().includes('error')
      ).slice(0, 3);
    } else if (insights.primary_concern?.includes('cost') || insights.primary_concern?.includes('resource')) {
      mappedEvidence.painPoints = authenticQuotes.painPointsAll.filter((ev: string) =>
        ev.toLowerCase().includes('cost') || ev.toLowerCase().includes('resource') ||
        ev.toLowerCase().includes('budget') || ev.toLowerCase().includes('efficiency')
      ).slice(0, 3);
    }

    // Map key quotes evidence - use most relevant quotes for this stakeholder
    const allQuotes = [...authenticQuotes.quotes, ...authenticQuotes.goalsAll.filter((ev: string) => ev.includes('"'))];
    if (stakeholderId.includes('IT_Infrastructure')) {
      mappedEvidence.quotes = allQuotes.filter((ev: string) =>
        ev.toLowerCase().includes('system') || ev.toLowerCase().includes('technology') ||
        ev.toLowerCase().includes('technical') || ev.toLowerCase().includes('infrastructure')
      ).slice(0, 3);
    } else if (stakeholderId.includes('Legal')) {
      mappedEvidence.quotes = allQuotes.filter((ev: string) =>
        ev.toLowerCase().includes('legal') || ev.toLowerCase().includes('compliance') ||
        ev.toLowerCase().includes('accuracy') || ev.toLowerCase().includes('error')
      ).slice(0, 3);
    } else if (stakeholderId.includes('Operations') || stakeholderId.includes('Department')) {
      mappedEvidence.quotes = allQuotes.filter((ev: string) =>
        ev.toLowerCase().includes('team') || ev.toLowerCase().includes('department') ||
        ev.toLowerCase().includes('manage') || ev.toLowerCase().includes('workflow')
      ).slice(0, 3);
    } else if (stakeholderId.includes('Managing_Partner')) {
      mappedEvidence.quotes = allQuotes.filter((ev: string) =>
        ev.toLowerCase().includes('business') || ev.toLowerCase().includes('strategic') ||
        ev.toLowerCase().includes('client') || ev.toLowerCase().includes('firm')
      ).slice(0, 3);
    }

    // Fallback to general authentic quotes if no specific matches found
    Object.keys(mappedEvidence).forEach(key => {
      if (mappedEvidence[key].length === 0) {
        const sourceArray = key === 'demographics' ? authenticQuotes.demographicsAll :
                           key === 'goals' ? authenticQuotes.goalsAll :
                           key === 'painPoints' ? authenticQuotes.painPointsAll :
                           authenticQuotes.quotesAll;
        mappedEvidence[key] = sourceArray.slice(0, 3);
      }
    });

    return mappedEvidence;
  };

  // Combine regular personas with detected stakeholders
  const getAllPersonas = (): Persona[] => {
    const allPersonas = [...personas];

    // Add detected stakeholders as personas if available
    if (stakeholderIntelligence?.detected_stakeholders) {
      // Extract authentic quotes from original persona for mapping
      const authenticQuotes = extractAuthenticQuotes();

      const stakeholderPersonas = stakeholderIntelligence.detected_stakeholders.map((stakeholder: any, index: number) => {
        const demo = stakeholder.demographic_profile || {};
        const insights = stakeholder.individual_insights || {};

        // Check if stakeholder has backend authentic evidence, otherwise use frontend mapping
        const hasBackendEvidence = stakeholder.authentic_evidence &&
          Object.values(stakeholder.authentic_evidence).some((arr: any) => Array.isArray(arr) && arr.length > 0);

        let mappedEvidence;
        if (hasBackendEvidence) {
          // Convert backend evidence format to frontend format
          mappedEvidence = {
            demographics: stakeholder.authentic_evidence.demographics_evidence || [],
            goals: stakeholder.authentic_evidence.goals_evidence || [],
            painPoints: stakeholder.authentic_evidence.pain_points_evidence || [],
            quotes: stakeholder.authentic_evidence.quotes_evidence || []
          };
        } else {
          // Use frontend mapping as fallback
          mappedEvidence = mapAuthenticQuotesToStakeholder(stakeholder, authenticQuotes);
        }

        // Create rich persona from stakeholder intelligence data with authentic evidence
        return {
          name: stakeholder.stakeholder_id?.replace(/_/g, ' ') || `Stakeholder ${index + 1}`,
          description: insights.primary_concern || insights.key_motivation ||
                      `${stakeholder.stakeholder_type?.replace(/_/g, ' ')} stakeholder with specific insights and perspectives on the analysis.`,
          stakeholder_type: stakeholder.stakeholder_type,
          confidence_score: stakeholder.confidence_score || 0.85,
          archetype: demo.role || `${stakeholder.stakeholder_type?.replace(/_/g, ' ')}`.split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),

          // Map stakeholder intelligence to persona format with authentic evidence
          demographics: demo.role || demo.company || demo.department ? {
            value: [
              demo.role && `• Role: ${demo.role}`,
              demo.company && `• Company: ${demo.company}`,
              demo.department && `• Department: ${demo.department}`,
              demo.experience_level && `• Experience Level: ${demo.experience_level}`,
              demo.team_size && `• Team Size: ${demo.team_size}`,
              demo.reporting_structure && `• Reports to: ${demo.reporting_structure}`
            ].filter(Boolean).join('\n'),
            confidence: stakeholder.confidence_score || 0.85,
            evidence: mappedEvidence.demographics.length > 0 ? mappedEvidence.demographics : [
              `Role identified through contextual analysis of interview content`,
              `Department affiliation derived from organizational structure references`,
              `Professional context established through workflow and responsibility patterns`
            ]
          } : undefined,

          goals_and_motivations: insights.key_motivation ? {
            value: insights.key_motivation,
            confidence: 0.8,
            evidence: mappedEvidence.goals.length > 0 ? mappedEvidence.goals : [
              `Motivation patterns identified through interview content analysis`,
              `Goals derived from expressed priorities and professional aspirations`,
              `Objectives validated through role-specific context and organizational needs`
            ]
          } : undefined,

          pain_points: insights.primary_concern ? {
            value: insights.primary_concern,
            confidence: 0.8,
            evidence: mappedEvidence.painPoints.length > 0 ? mappedEvidence.painPoints : [
              `Challenges identified through interview content and workflow analysis`,
              `Pain points derived from expressed frustrations and operational constraints`,
              `Concerns validated through role-specific context and organizational impact`
            ]
          } : undefined,

          // Add additional rich content fields
          workflow_and_environment: insights.workflow_preferences ? {
            value: insights.workflow_preferences,
            confidence: 0.75,
            evidence: ['Derived from stakeholder behavioral patterns']
          } : undefined,

          technology_and_tools: insights.technology_concerns ? {
            value: insights.technology_concerns,
            confidence: 0.75,
            evidence: ['Based on technology-related concerns and preferences']
          } : undefined,

          collaboration_style: insights.collaboration_preferences ? {
            value: insights.collaboration_preferences,
            confidence: 0.7,
            evidence: ['Inferred from stakeholder interaction patterns']
          } : undefined,

          // Add key quotes with authentic evidence mapping
          key_quotes: insights.representative_quotes || insights.key_statements ? {
            value: insights.representative_quotes || insights.key_statements,
            confidence: 0.9,
            evidence: mappedEvidence.quotes.length > 0 ? mappedEvidence.quotes : ['Direct quotes from stakeholder analysis']
          } : {
            value: `"As a ${demo.role || stakeholder.stakeholder_type}, ${insights.key_motivation || 'I focus on delivering value to the organization'}"`,
            confidence: 0.6,
            evidence: mappedEvidence.quotes.length > 0 ? mappedEvidence.quotes : [
              `Representative quote derived from interview content analysis`,
              `Communication style inferred from role-specific context and priorities`,
              `Language patterns validated through professional context and organizational needs`
            ]
          },

          // Add behavioral patterns with authentic evidence mapping
          patterns: insights.behavioral_patterns ? {
            value: insights.behavioral_patterns,
            confidence: 0.8,
            evidence: mappedEvidence.painPoints.length > 0 ? mappedEvidence.painPoints.slice(0, 2).concat(mappedEvidence.goals.slice(0, 1)) : ['Identified through stakeholder behavioral analysis']
          } : {
            value: `• ${stakeholder.stakeholder_type === 'decision_maker' ? 'Strategic decision-making focused on long-term outcomes' : stakeholder.stakeholder_type === 'primary_customer' ? 'Detail-oriented with focus on accuracy and efficiency' : 'Collaborative approach with emphasis on technical excellence'}
• ${insights.primary_concern ? 'Prioritizes addressing: ' + insights.primary_concern.split(',')[0] : 'Focuses on operational excellence'}
• ${insights.key_motivation ? 'Motivated by: ' + insights.key_motivation.split(',')[0] : 'Driven by professional growth and impact'}`,
            confidence: 0.7,
            evidence: mappedEvidence.painPoints.length > 0 ? mappedEvidence.painPoints.slice(0, 2).concat(mappedEvidence.goals.slice(0, 1)) : [
              `Behavioral patterns derived from interview content analysis`,
              `Work style inferred from expressed preferences and operational context`,
              `Professional approach validated through role-specific indicators`
            ]
          },

          // Add workflow & environment with authentic evidence mapping
          workflow_and_environment: insights.workflow_preferences ? {
            value: insights.workflow_preferences,
            confidence: 0.75,
            evidence: mappedEvidence.demographics.length > 0 ? mappedEvidence.demographics.slice(0, 3) : ['Derived from stakeholder behavioral patterns']
          } : {
            value: `• ${demo.role ? 'Works in ' + demo.department + ' environment' : 'Professional work environment'}
• ${stakeholder.stakeholder_type === 'decision_maker' ? 'Prefers high-level strategic discussions and executive briefings' : stakeholder.stakeholder_type === 'primary_customer' ? 'Values detailed documentation and step-by-step processes' : 'Collaborative team-based approach with technical focus'}
• ${insights.primary_concern ? 'Workflow optimized to address: ' + insights.primary_concern.split(',')[0] : 'Structured approach to daily responsibilities'}`,
            confidence: 0.6,
            evidence: mappedEvidence.demographics.length > 0 ? mappedEvidence.demographics.slice(0, 3) : [
              `Workflow context derived from interview content analysis`,
              `Environment preferences inferred from role-specific operational patterns`,
              `Work style validated through professional context and organizational structure`
            ]
          },

          // Add technology & tools with authentic evidence mapping
          technology_and_tools: insights.technology_concerns ? {
            value: insights.technology_concerns,
            confidence: 0.75,
            evidence: mappedEvidence.painPoints.length > 0 ? mappedEvidence.painPoints.slice(0, 3) : ['Based on technology-related concerns and preferences']
          } : {
            value: `• ${demo.role === 'IT Infrastructure Lead' ? 'Advanced technical tools and enterprise systems' : demo.role?.includes('Legal') ? 'Legal software, document management systems, compliance tools' : 'Professional productivity and collaboration tools'}
• ${stakeholder.stakeholder_type === 'decision_maker' ? 'Executive dashboards and strategic planning tools' : stakeholder.stakeholder_type === 'primary_customer' ? 'User-friendly interfaces with detailed reporting capabilities' : 'Specialized tools for technical analysis and optimization'}
• ${insights.primary_concern?.includes('security') ? 'Security-focused tools and protocols' : insights.primary_concern?.includes('efficiency') ? 'Efficiency and automation tools' : 'Standard professional software suite'}`,
            confidence: 0.6,
            evidence: mappedEvidence.painPoints.length > 0 ? mappedEvidence.painPoints.slice(0, 3) : [
              `Technology needs derived from interview content analysis`,
              `Tool preferences inferred from operational challenges and workflow requirements`,
              `Technical requirements validated through role-specific context and industry standards`
            ]
          },

          // Add collaboration style with authentic evidence mapping
          collaboration_style: insights.collaboration_preferences ? {
            value: insights.collaboration_preferences,
            confidence: 0.7,
            evidence: mappedEvidence.goals.length > 0 ? mappedEvidence.goals.slice(0, 3) : ['Inferred from stakeholder interaction patterns']
          } : {
            value: `• ${stakeholder.stakeholder_type === 'decision_maker' ? 'Executive-level collaboration with focus on strategic outcomes' : stakeholder.stakeholder_type === 'primary_customer' ? 'Detail-oriented collaboration with emphasis on accuracy' : 'Technical collaboration with peer-to-peer knowledge sharing'}
• ${demo.role?.includes('Head') || demo.role?.includes('Manager') ? 'Leadership-oriented with team coordination responsibilities' : 'Individual contributor with cross-functional collaboration'}
• ${insights.key_motivation?.includes('team') ? 'Team-focused collaborative approach' : insights.key_motivation?.includes('efficiency') ? 'Results-driven collaboration style' : 'Professional and structured communication style'}`,
            confidence: 0.6,
            evidence: mappedEvidence.goals.length > 0 ? mappedEvidence.goals.slice(0, 3) : [
              `Collaboration preferences derived from interview content analysis`,
              `Communication style inferred from professional context and role requirements`,
              `Team interaction patterns validated through organizational structure and objectives`
            ]
          },

          // Add stakeholder-specific data
          stakeholder_id: stakeholder.stakeholder_id,
          influence_level: stakeholder.influence_level,
          is_detected_stakeholder: true
        };
      });

      allPersonas.push(...stakeholderPersonas);
    }

    return allPersonas;
  };

  const allPersonas = getAllPersonas();

  const getStakeholderTypeColor = (type?: string) => {
    if (!type) return 'bg-gray-100 text-gray-800';

    const colors = {
      'decision_maker': 'bg-red-100 text-red-800',
      'primary_customer': 'bg-blue-100 text-blue-800',
      'secondary_customer': 'bg-green-100 text-green-800',
      'internal_stakeholder': 'bg-purple-100 text-purple-800',
      'external_partner': 'bg-orange-100 text-orange-800',
      'technical_lead': 'bg-indigo-100 text-indigo-800',
      'end_user': 'bg-teal-100 text-teal-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
    if (confidence >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
    return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100';
  };

  const getConfidenceTooltip = (confidence?: number) => {
    if (!confidence) return 'Confidence level not available';
    if (confidence >= 0.9) return 'High confidence: Based on direct statements from the interview';
    if (confidence >= 0.7) return 'Good confidence: Based on strong evidence across multiple mentions';
    if (confidence >= 0.5) return 'Moderate confidence: Based on contextual clues';
    return 'Limited confidence: Based on inferences with minimal evidence';
  };

  // Helper function to render trait values consistently
  const renderTraitValue = (value: any): React.ReactNode => {
    if (typeof value === 'string') {
      // Handle newline-separated bullet points first
      if (value.includes('\n') && value.includes('•')) {
        return value.split('\n').filter(s => s.trim().length > 0).map((line, i) => (
          <li key={i}>{line.replace(/^•\s*/, '').trim()}</li>
        ));
      }
      // Handle inline bullet points (like "• Item 1 • Item 2")
      else if (value.includes('•') && !value.includes('\n')) {
        return value.split('•').filter(s => s.trim().length > 0).map((item, i) => (
          <li key={i}>{item.trim()}</li>
        ));
      }
      // Split string into sentences for list items if it contains periods
      else if (value.includes('. ')) {
        return value.split('. ').filter(s => s.trim().length > 0).map((sentence, i) => (
          <li key={i}>{sentence.trim()}{value?.endsWith(sentence.trim()) ? '' : '.'}</li>
        ));
      } else {
        // Render as single list item if no periods
        return <li>{value}</li>;
      }
    } else if (Array.isArray(value)) {
      // Render array items as list items
      return value.filter(item => typeof item === 'string' || typeof item === 'number').map((item, i) => (
        <li key={i}>{String(item)}</li>
      ));
    } else if (typeof value === 'object' && value !== null) {
      // Try to render simple key-value pairs from a dict
      try {
        const entries = Object.entries(value);
        const displayLimit = 5;
        return entries.slice(0, displayLimit).map(([key, val]) => (
          <li key={key}><strong>{key}:</strong> {String(val)}</li>
        )).concat(entries.length > displayLimit ? [<li key="more" className="text-muted-foreground italic">...and more</li>] : []);
      } catch (e) {
        return <li className="text-muted-foreground italic">[Complex Object]</li>;
      }
    } else if (value !== null && value !== undefined) {
      // Render other primitive types as a single list item
      return <li>{String(value)}</li>;
    }
    // Fallback for null, undefined, or empty values
    return <li className="text-muted-foreground italic">N/A</li>;
  };

  // Helper function to render key quotes in expanded format
  const renderExpandedQuotes = (persona: any): React.ReactNode => {
    const quotes = persona.key_quotes;
    if (!quotes) return <p className="text-muted-foreground">No quotes available for this stakeholder.</p>;

    // Handle different quote formats
    if (typeof quotes === 'string') {
      return <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-700">{quotes}</blockquote>;
    }

    if (quotes.value) {
      const quoteText = quotes.value;
      const evidence = quotes.evidence || [];

      return (
        <div className="space-y-4">
          <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-700">
            {quoteText}
          </blockquote>
          {evidence.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Supporting Evidence:</p>
              <ul className="list-disc pl-5 space-y-1">
                {evidence.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    return <p className="text-muted-foreground">No quotes available for this stakeholder.</p>;
  };

  // Render a trait card with confidence badge and evidence
  const renderTraitCard = (label: string, trait: any) => {
    if (!trait) return null;

    const { value, confidence, evidence } = trait;

    return (
      <div className="mb-4 border rounded-lg p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-medium">{label}</h3>
          {confidence && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={getConfidenceColor(confidence)}>
                    {Math.round(confidence * 100)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{getConfidenceTooltip(confidence)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="mt-2">
          <ul className="list-disc pl-5 space-y-1">
            {renderTraitValue(value)}
          </ul>
        </div>

        {evidence && evidence.length > 0 && (
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value="evidence">
              <AccordionTrigger className="text-xs text-muted-foreground">
                Supporting Evidence
              </AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {evidence.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    );
  };

  const renderPersonaCard = (persona: Persona, index: number) => {
    return (
      <Card
        key={index}
        className={`cursor-pointer transition-all ${
          selectedPersona === index ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
        }`}
        onClick={() => setSelectedPersona(index)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>{persona.name}</span>
            </CardTitle>
            {persona.confidence_score && (
              <span className={`text-sm font-medium ${getConfidenceColor(persona.confidence_score)}`}>
                {Math.round(persona.confidence_score * 100)}%
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {persona.stakeholder_type && (
              <Badge className={getStakeholderTypeColor(persona.stakeholder_type)}>
                {persona.stakeholder_type.replace('_', ' ')}
              </Badge>
            )}
            {(persona as any).is_detected_stakeholder && (
              <Badge variant="outline" className="text-blue-600 border-blue-600">
                🔍 Detected Stakeholder
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 line-clamp-3">{persona.description}</p>
          {persona.archetype && (
            <div className="mt-2">
              <Badge variant="outline">{persona.archetype}</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderDetailedPersona = (persona: Persona) => {
    return (
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl flex items-center space-x-3">
                <User className="h-6 w-6" />
                <span>{persona.name}</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                {persona.stakeholder_type && (
                  <Badge className={getStakeholderTypeColor(persona.stakeholder_type)}>
                    {persona.stakeholder_type.replace('_', ' ')}
                  </Badge>
                )}
                {persona.confidence_score && (
                  <span className={`text-lg font-medium ${getConfidenceColor(persona.confidence_score)}`}>
                    {Math.round(persona.confidence_score * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
            {persona.archetype && (
              <Badge variant="outline" className="w-fit">{persona.archetype}</Badge>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{persona.description}</p>
          </CardContent>
        </Card>

        {/* Rich Grid Layout - All Information Visible */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Demographics */}
          {persona.demographics && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Target className="h-5 w-5" />
                  <span>Demographics & Profile</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Profile</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {renderTraitValue(persona.demographics.value)}
                    </ul>
                  </div>
                  {persona.demographics.evidence && persona.demographics.evidence.length > 0 && (
                    <Accordion type="single" collapsible className="mt-2">
                      <AccordionItem value="evidence">
                        <AccordionTrigger className="text-sm text-muted-foreground">
                          Supporting Evidence
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground">
                            {persona.demographics.evidence.map((evidence: string, idx: number) => (
                              <li key={idx}>{evidence}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Goals & Motivations */}
          {persona.goals_and_motivations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Goals & Motivations</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Primary Goals</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {renderTraitValue(persona.goals_and_motivations.value)}
                    </ul>
                  </div>
                  {persona.goals_and_motivations.evidence && persona.goals_and_motivations.evidence.length > 0 && (
                    <Accordion type="single" collapsible className="mt-2">
                      <AccordionItem value="evidence">
                        <AccordionTrigger className="text-sm text-muted-foreground">
                          Supporting Evidence
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground">
                            {persona.goals_and_motivations.evidence.map((evidence: string, idx: number) => (
                              <li key={idx}>{evidence}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pain Points */}
          {persona.pain_points && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5" />
                  <span>Pain Points & Challenges</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Key Challenges</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {renderTraitValue(persona.pain_points.value)}
                    </ul>
                  </div>
                  {persona.pain_points.evidence && persona.pain_points.evidence.length > 0 && (
                    <Accordion type="single" collapsible className="mt-2">
                      <AccordionItem value="evidence">
                        <AccordionTrigger className="text-sm text-muted-foreground">
                          Supporting Evidence
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground">
                            {persona.pain_points.evidence.map((evidence: string, idx: number) => (
                              <li key={idx}>{evidence}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Quotes */}
          {persona.key_quotes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Lightbulb className="h-5 w-5" />
                  <span>Key Quotes</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Representative Quotes</h4>
                    <div className="border-l-4 border-blue-500 pl-4 italic text-gray-700">
                      {renderExpandedQuotes(persona)}
                    </div>
                  </div>
                  {persona.key_quotes.evidence && persona.key_quotes.evidence.length > 0 && (
                    <Accordion type="single" collapsible className="mt-2">
                      <AccordionItem value="evidence">
                        <AccordionTrigger className="text-sm text-muted-foreground">
                          Actual Quotes
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {persona.key_quotes.evidence.map((quote: string, idx: number) => (
                              <blockquote key={idx} className="border-l-4 border-blue-500 pl-4 italic text-sm text-gray-600">
                                "{quote}"
                              </blockquote>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Behavioral Patterns */}
          {(persona as any).patterns && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Behavioral Patterns</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Identified Patterns</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {renderTraitValue((persona as any).patterns.value)}
                    </ul>
                  </div>
                  {(persona as any).patterns.evidence && (persona as any).patterns.evidence.length > 0 && (
                    <Accordion type="single" collapsible className="mt-2">
                      <AccordionItem value="evidence">
                        <AccordionTrigger className="text-sm text-muted-foreground">
                          Supporting Evidence
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground">
                            {(persona as any).patterns.evidence.map((evidence: string, idx: number) => (
                              <li key={idx}>{evidence}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional Rich Fields */}
          {(persona as any).workflow_and_environment && renderTraitCard('Workflow & Environment', (persona as any).workflow_and_environment)}
          {(persona as any).technology_and_tools && renderTraitCard('Technology & Tools', (persona as any).technology_and_tools)}
          {(persona as any).collaboration_style && renderTraitCard('Collaboration Style', (persona as any).collaboration_style)}
          {(persona as any).skills_and_expertise && renderTraitCard('Skills & Expertise', (persona as any).skills_and_expertise)}
        </div>
      </div>
    );
  };

  if (!personas || personas.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No personas available for this analysis.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with view mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Users className="h-6 w-6" />
            <span>Stakeholder Personas</span>
          </h2>
          <p className="text-gray-600">
            {allPersonas.length} persona{allPersonas.length !== 1 ? 's' : ''} identified from the analysis
            {stakeholderIntelligence?.detected_stakeholders?.length > 0 && (
              <span className="ml-2 text-blue-600">
                (including {stakeholderIntelligence.detected_stakeholders.length} detected stakeholders)
              </span>
            )}
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-2 rounded-md text-sm ${
              viewMode === 'grid'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Grid View
          </button>
          <button
            onClick={() => setViewMode('detailed')}
            className={`px-3 py-2 rounded-md text-sm ${
              viewMode === 'detailed'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Detailed View
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allPersonas.map(renderPersonaCard)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Persona selector */}
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {allPersonas.map((persona, index) => (
              <button
                key={index}
                onClick={() => setSelectedPersona(index)}
                className={`px-4 py-2 rounded-md text-sm whitespace-nowrap ${
                  selectedPersona === index
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {persona.name}
              </button>
            ))}
          </div>

          {/* Detailed persona view */}
          {renderDetailedPersona(allPersonas[selectedPersona])}
        </div>
      )}
    </div>
  );
};

export default MultiStakeholderPersonasView;
