'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, ArrowRight } from 'lucide-react';
import { AUTO_SUGGESTION_CONFIG, RESEARCH_CONFIG } from '@/lib/config/research-config';

interface AutoSuggestion {
  id: string;
  text: string;
  category: 'business_type' | 'target_customer' | 'problem' | 'solution' | 'stage';
  context?: string;
}

interface AutoSuggestionsProps {
  conversationContext: string;
  currentStage: 'initial' | 'business_idea' | 'target_customer' | 'problem_validation' | 'solution_validation';
  onSuggestionClick: (suggestion: string) => void;
  className?: string;
}

// Use configuration instead of hardcoded templates
const SUGGESTION_TEMPLATES = AUTO_SUGGESTION_CONFIG.stageTemplates;
const DYNAMIC_SUGGESTIONS = {
  business_types: AUTO_SUGGESTION_CONFIG.businessTypes,
  industries: AUTO_SUGGESTION_CONFIG.industries,
  customer_types: AUTO_SUGGESTION_CONFIG.customerTypes,
  problems: AUTO_SUGGESTION_CONFIG.problems,
};

export function AutoSuggestions({
  conversationContext,
  currentStage,
  onSuggestionClick,
  className = ''
}: AutoSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<AutoSuggestion[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    generateSuggestions();
  }, [conversationContext, currentStage]);

  const generateSuggestions = () => {
    let newSuggestions: AutoSuggestion[] = [];

    // Get base suggestions for current stage
    const baseSuggestions = SUGGESTION_TEMPLATES[currentStage] || [];
    newSuggestions = [...baseSuggestions];

    // Add dynamic suggestions based on context
    const contextLower = conversationContext.toLowerCase();

    // If they mentioned an industry, suggest related customer types
    Object.entries(DYNAMIC_SUGGESTIONS.industries).forEach(([_, industry]) => {
      if (contextLower.includes(industry)) {
        newSuggestions.push({
          id: `dynamic_${industry}`,
          text: `${industry} professionals`,
          category: 'target_customer',
          context: `Based on your ${industry} focus`
        });
      }
    });

    // If they mentioned a business type, suggest common problems
    if (contextLower.includes('app') || contextLower.includes('software')) {
      newSuggestions.push(
        {
          id: 'dynamic_app_1',
          text: 'Current apps are too complicated to use',
          category: 'problem',
          context: 'Common app-related problem'
        },
        {
          id: 'dynamic_app_2',
          text: 'Existing solutions don\'t integrate well',
          category: 'problem',
          context: 'Common integration issue'
        }
      );
    }

    // Limit to configured max suggestions and shuffle
    const shuffled = newSuggestions.sort(() => 0.5 - Math.random());
    setSuggestions(shuffled.slice(0, RESEARCH_CONFIG.maxSuggestionsToShow));
  };

  const handleSuggestionClick = (suggestion: AutoSuggestion) => {
    onSuggestionClick(suggestion.text);
    // Hide suggestions briefly after click
    setIsVisible(false);
    setTimeout(() => setIsVisible(true), RESEARCH_CONFIG.suggestionHideDelayMs);
  };

  if (!isVisible || suggestions.length === 0) {
    return null;
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'business_type': return 'bg-blue-100 text-blue-800';
      case 'target_customer': return 'bg-green-100 text-green-800';
      case 'problem': return 'bg-orange-100 text-orange-800';
      case 'solution': return 'bg-purple-100 text-purple-800';
      case 'stage': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Check if this is inline suggestions
  const isInline = className?.includes('inline-suggestions');

  if (isInline) {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-3 w-3 text-yellow-600" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Quick replies:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 3).map((suggestion) => (
            <Button
              key={suggestion.id}
              variant="outline"
              size="sm"
              className="h-auto py-1 px-2 text-xs hover:bg-blue-50 hover:border-blue-300"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion.text}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-yellow-600" />
        <span className="text-sm font-medium text-gray-700">Quick suggestions</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.id}
            variant="ghost"
            className="justify-start h-auto p-3 text-left hover:bg-gray-50"
            onClick={() => handleSuggestionClick(suggestion)}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex-1">
                <div className="text-sm">{suggestion.text}</div>
                {suggestion.context && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{suggestion.context}</div>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Badge
                  variant="secondary"
                  className={`text-xs ${getCategoryColor(suggestion.category)}`}
                >
                  {suggestion.category.replace('_', ' ')}
                </Badge>
                <ArrowRight className="h-3 w-3 text-gray-400" />
              </div>
            </div>
          </Button>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          💡 Click any suggestion to use it, or type your own response
        </p>
      </div>
    </Card>
  );
}
