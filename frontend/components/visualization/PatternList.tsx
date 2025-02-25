'use client';

import React, { useMemo, useState } from 'react';
import { Pattern } from '@/types/api';

/**
 * Props for the PatternList component
 */
interface PatternListProps {
  /** The patterns data to display */
  data: Pattern[];
  /** Whether to show examples (default: true) */
  showExamples?: boolean;
  /** Maximum number of examples to show (default: 3) */
  maxExamples?: number;
  /** Additional CSS class names */
  className?: string;
  /** Callback when a pattern is clicked */
  onPatternClick?: (pattern: Pattern) => void;
}

/**
 * Color scale for sentiment values
 */
const SENTIMENT_COLORS = {
  positive: '#22c55e', // green-500
  neutral: '#64748b', // slate-500
  negative: '#ef4444', // red-500
};

/**
 * Component for displaying patterns with visual indicators
 * Shows frequency, sentiment, and examples for each pattern
 */
export const PatternList: React.FC<PatternListProps> = ({
  data,
  showExamples = true,
  maxExamples = 3,
  className,
  onPatternClick,
}) => {
  // State for expanded patterns
  const [expandedPatterns, setExpandedPatterns] = useState<Record<string, boolean>>({});

  // Group patterns by category
  const patternsByCategory = useMemo(() => {
    const grouped: Record<string, Pattern[]> = {};
    
    // Sort patterns by frequency for better visualization
    const sortedData = [...data].sort((a, b) => {
      const freqA = a.frequency || 0;
      const freqB = b.frequency || 0;
      return freqB - freqA; // Sort in descending order
    });
    
    sortedData.forEach(pattern => {
      const category = pattern.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(pattern);
    });
    
    return grouped;
  }, [data]);

  // Get color based on sentiment
  const getSentimentColor = (sentiment: number) => {
    if (sentiment >= 0.2) return SENTIMENT_COLORS.positive;
    if (sentiment < -0.2) return SENTIMENT_COLORS.negative;
    return SENTIMENT_COLORS.neutral;
  };

  // Get sentiment label
  const getSentimentLabel = (sentiment: number) => {
    if (sentiment >= 0.2) return 'Positive';
    if (sentiment < -0.2) return 'Negative';
    return 'Neutral';
  };

  // Toggle pattern expanded state
  const toggleExpanded = (patternId: number) => {
    setExpandedPatterns(prev => ({
      ...prev,
      [patternId]: !prev[patternId]
    }));
  };

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-40 ${className || ''}`}>
        <p className="text-muted-foreground">No pattern data available</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {Object.entries(patternsByCategory).map(([category, patterns]) => (
        <div key={category} className="mb-8">
          <h3 className="text-lg font-semibold mb-4">{category}</h3>
          <div className="space-y-4">
            {patterns.map((pattern) => {
              const isExpanded = expandedPatterns[pattern.id] || false;
              const sentimentColor = getSentimentColor(pattern.sentiment || 0);
              const frequencyPercent = Math.min(100, Math.round((pattern.frequency || 0) * 100));
              
              return (
                <div 
                  key={pattern.id} 
                  className="p-4 border border-border rounded-md hover:border-primary transition-colors"
                  onClick={() => onPatternClick && onPatternClick(pattern)}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{pattern.category}</h4>
                    <span 
                      className="px-2 py-1 text-xs rounded-full"
                      style={{ 
                        backgroundColor: `${sentimentColor}20`, 
                        color: sentimentColor 
                      }}
                    >
                      {getSentimentLabel(pattern.sentiment || 0)}
                    </span>
                  </div>
                  
                  <div className="mt-2">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <span>Frequency:</span>
                      <div className="ml-2 w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ 
                            width: `${frequencyPercent}%`,
                            backgroundColor: sentimentColor
                          }}
                        />
                      </div>
                      <span className="ml-2">{frequencyPercent}%</span>
                    </div>
                  </div>
                  
                  <p className="mt-3 text-sm">
                    {pattern.description || 'No description available.'}
                  </p>
                  
                  {showExamples && pattern.examples && pattern.examples.length > 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="text-xs text-primary flex items-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(pattern.id);
                        }}
                      >
                        {isExpanded ? 'Hide' : 'Show'} Supporting Statements
                        <svg
                          className={`ml-1 w-4 h-4 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      
                      {isExpanded && (
                        <ul className="text-xs list-disc list-inside mt-2 text-muted-foreground space-y-1">
                          {pattern.examples.slice(0, maxExamples).map((example, i) => (
                            <li key={i} className="pl-2">{example}</li>
                          ))}
                          {pattern.examples.length > maxExamples && (
                            <li className="text-primary">
                              +{pattern.examples.length - maxExamples} more examples
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PatternList;