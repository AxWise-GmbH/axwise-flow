'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Interface for simplified persona optimized for design thinking
interface SimplePersona {
  persona_id?: number;
  name: string;
  archetype: string;
  overall_confidence: number;
  populated_traits: {
    demographics?: PersonaTrait;
    goals_and_motivations?: PersonaTrait;
    challenges_and_frustrations?: PersonaTrait;
    key_quotes?: PersonaTrait;
  };
  trait_count: number;
  evidence_count: number;
}

interface PersonaTrait {
  value: string;
  confidence: number;
  evidence: string[];
}

interface SimplePersonaCardProps {
  persona: SimplePersona;
  className?: string;
}

// Get initials for avatar
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};



// Get confidence color for badges - improved contrast
const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.9) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (confidence >= 0.7) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-rose-100 text-rose-800 border-rose-200';
};

// Get trait card styling based on confidence
const getTraitCardStyling = (confidence: number) => {
  if (confidence >= 0.9) {
    return {
      border: 'border-emerald-200',
      background: 'bg-emerald-50/50',
      accent: 'border-l-emerald-400'
    };
  }
  if (confidence >= 0.7) {
    return {
      border: 'border-amber-200',
      background: 'bg-amber-50/50',
      accent: 'border-l-amber-400'
    };
  }
  return {
    border: 'border-rose-200',
    background: 'bg-rose-50/50',
    accent: 'border-l-rose-400'
  };
};

// Extract highlighted keywords from text with **bold** formatting
const extractHighlightedKeywords = (text: string): string[] => {
  const matches = text.match(/\*\*(.*?)\*\*/g);
  if (!matches) return [];

  return matches.map(match =>
    match.replace(/\*\*/g, '').toLowerCase().trim()
  ).filter(keyword => keyword.length > 0);
};

// Create consistent highlighting with keyword mapping
const createHighlightedContent = (text: string, keywordsToHighlight: string[] = []): { __html: string } => {
  let processedText = text;

  // First, handle existing **bold** formatting
  processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-blue-700 font-semibold">$1</strong>');

  // Then highlight additional keywords that should be mapped from trait values
  keywordsToHighlight.forEach(keyword => {
    if (keyword.length > 2) { // Only highlight meaningful keywords
      const regex = new RegExp(`\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
      processedText = processedText.replace(regex, '<strong class="text-blue-700 font-semibold">$1</strong>');
    }
  });

  return { __html: processedText };
};

// Parse and clean demographics data
const parseDemographics = (content: string): Array<{key: string, value: string}> => {
  const demographics: Array<{key: string, value: string}> = [];

  if (content.includes('•')) {
    // Handle bullet-point format
    const items = content.split('•').filter(item => item.trim());

    items.forEach(item => {
      const trimmed = item.trim();

      if (trimmed.includes(':')) {
        // Check if this might be a compound item (key: value + additional text)
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 1).trim();

        // Handle cases where additional descriptive text follows the value
        // Look for patterns like "Singapore Professional context: ..."
        const professionalContextMatch = value.match(/^([^.]*?)\s+(Professional context:|An Expat|managing|Leader)/i);
        if (professionalContextMatch) {
          // Split the value and additional context
          const actualValue = professionalContextMatch[1].trim();
          const contextText = value.substring(actualValue.length).trim();

          if (key && actualValue) {
            demographics.push({ key, value: actualValue });
          }

          if (contextText) {
            demographics.push({ key: 'Professional Context', value: contextText });
          }
        } else if (key && value) {
          demographics.push({ key, value });
        }
      } else if (trimmed.length > 0) {
        // Handle descriptive text without explicit keys
        if (trimmed.toLowerCase().includes('professional') ||
            trimmed.toLowerCase().includes('context') ||
            trimmed.toLowerCase().includes('managing') ||
            trimmed.toLowerCase().includes('leader')) {
          demographics.push({ key: 'Professional Context', value: trimmed });
        } else {
          // Try to infer the key based on content
          demographics.push({ key: 'Additional Info', value: trimmed });
        }
      }
    });
  } else {
    // Handle non-bullet format - treat as single item
    demographics.push({ key: 'Demographics', value: content });
  }

  return demographics;
};



// Expandable quotes component with keyword mapping
const ExpandableQuotes: React.FC<{
  evidence: string[];
  traitValue: string;
}> = ({ evidence, traitValue }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!evidence || evidence.length === 0) {
    return null;
  }

  // Extract keywords from trait value to highlight in evidence
  const keywordsToHighlight = extractHighlightedKeywords(traitValue);

  return (
    <div className="mt-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center text-sm text-gray-600 hover:text-gray-800 p-1 h-auto font-normal"
      >
        <span className="text-xs">
          {evidence.length} supporting quote{evidence.length !== 1 ? 's' : ''}
        </span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 ml-2" />
        ) : (
          <ChevronDown className="w-3 h-3 ml-2" />
        )}
      </Button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {evidence.map((quote, index) => (
            <div
              key={index}
              className="bg-gray-50/50 rounded-md p-3 border-l-2 border-gray-300"
            >
              <p
                className="text-sm text-gray-700 italic leading-relaxed"
                dangerouslySetInnerHTML={createHighlightedContent(quote, keywordsToHighlight)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Format field names for display
const formatFieldName = (fieldName: string): string => {
  const displayNames: Record<string, string> = {
    'demographics': '📍 Demographics',
    'goals_and_motivations': '🎯 Goals & Motivations',
    'challenges_and_frustrations': '😤 Challenges & Frustrations',
    'key_quotes': '💬 Key Quotes'
  };

  return displayNames[fieldName] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Professional trait card component with expandable quotes and structured formatting
const TraitCard: React.FC<{
  title: string;
  trait: PersonaTrait;
  showConfidence?: boolean;
}> = ({ title, trait, showConfidence = true }) => {
  const styling = getTraitCardStyling(trait.confidence);

  return (
    <div className={`
      relative p-4 rounded-lg border-l-3 ${styling.accent} ${styling.border} ${styling.background}
      transition-colors duration-200
    `}>
      {/* Header with title and confidence */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-medium text-sm text-gray-900 flex-1">
          {title}
        </h3>
        {showConfidence && (
          <Badge variant="secondary" className={`text-xs ml-2 ${getConfidenceColor(trait.confidence)}`}>
            {Math.round(trait.confidence * 100)}%
          </Badge>
        )}
      </div>

      {/* Main content with structured formatting */}
      <div className="text-sm text-gray-800 leading-relaxed mb-2">
        {title.toLowerCase().includes('demographic') ? (
          // Special formatting for demographics using structured parsing
          <div className="space-y-2">
            {parseDemographics(trait.value).map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row sm:items-start">
                <span className="font-semibold text-gray-900 min-w-[140px] mb-1 sm:mb-0">
                  {item.key}:
                </span>
                <span
                  className="text-gray-700 sm:ml-2"
                  dangerouslySetInnerHTML={createHighlightedContent(item.value)}
                />
              </div>
            ))}
          </div>
        ) : (
          // Regular formatting for other fields with keyword highlighting
          <div
            className="text-gray-800"
            dangerouslySetInnerHTML={createHighlightedContent(
              trait.value,
              extractHighlightedKeywords(trait.evidence?.join(' ') || '')
            )}
          />
        )}
      </div>

      {/* Expandable supporting quotes with keyword mapping */}
      <ExpandableQuotes
        evidence={trait.evidence || []}
        traitValue={trait.value}
      />
    </div>
  );
};

export const SimplePersonaCard: React.FC<SimplePersonaCardProps> = ({
  persona,
  className
}) => {
  const traits = Object.entries(persona.populated_traits);
  const highConfidenceTraits = traits.filter(([, trait]) => trait.confidence >= 0.9).length;

  return (
    <Card className={cn(
      "w-full shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200",
      className
    )}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-blue-500 text-white font-semibold">
                {getInitials(persona.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900 mb-1">
                {persona.name}
              </CardTitle>
              <p className="text-sm text-gray-600">
                {persona.archetype}
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="secondary" className={`text-xs ${getConfidenceColor(persona.overall_confidence)}`}>
              {Math.round(persona.overall_confidence * 100)}%
            </Badge>
            <div className="text-xs text-gray-500 mt-1">
              {persona.trait_count} traits • {persona.evidence_count} evidence
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 px-6">
        {/* Core Traits - Professional Vertical Layout */}
        <div className="space-y-6">
          {traits.map(([fieldName, trait]) => (
            <TraitCard
              key={fieldName}
              title={formatFieldName(fieldName)}
              trait={trait}
              showConfidence={true}
            />
          ))}
        </div>

        {/* Enhanced Summary Footer */}
        <div className="pt-6 mt-8 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm font-medium text-gray-700">
              <span className="mr-2 text-lg">✨</span>
              <span>Design Thinking Optimized</span>
            </div>
            <div className="text-sm font-medium text-gray-700">
              {traits.length > 0 ? (
                <span className="flex items-center">
                  <span className="mr-1">🎯</span>
                  {highConfidenceTraits} high-confidence trait{highConfidenceTraits !== 1 ? 's' : ''}
                </span>
              ) : (
                'No populated traits'
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SimplePersonaCard;
