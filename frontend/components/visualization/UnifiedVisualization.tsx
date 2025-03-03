'use client';

import React, { useMemo } from 'react';
import { Theme, Pattern, SentimentData, SentimentStatements } from '@/types/api';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface UnifiedVisualizationProps {
  type: 'themes' | 'patterns' | 'sentiment';
  themesData?: Theme[];
  patternsData?: Pattern[];
  sentimentData?: {
    overview: { positive: number; neutral: number; negative: number };
    details?: SentimentData[];
    statements?: SentimentStatements;
  };
  className?: string;
}

const SENTIMENT_COLORS = {
  positive: '#22c55e', // green-500
  neutral: '#64748b', // slate-500
  negative: '#ef4444', // red-500
};

export const UnifiedVisualization: React.FC<UnifiedVisualizationProps> = ({
  type,
  themesData = [],
  patternsData = [],
  sentimentData = { overview: { positive: 0.33, neutral: 0.34, negative: 0.33 } },
  className,
}) => {
  // Process themes by sentiment
  const themesBySentiment = useMemo(() => {
    const positive: Theme[] = [];
    const neutral: Theme[] = [];
    const negative: Theme[] = [];

    themesData.forEach(theme => {
      const sentiment = theme.sentiment || 0;
      if (sentiment >= 0.2) positive.push(theme);
      else if (sentiment <= -0.2) negative.push(theme);
      else neutral.push(theme);
    });

    return { positive, neutral, negative };
  }, [themesData]);

  // Process patterns by sentiment
  const patternsBySentiment = useMemo(() => {
    const positive: Pattern[] = [];
    const neutral: Pattern[] = [];
    const negative: Pattern[] = [];

    patternsData.forEach(pattern => {
      const sentiment = pattern.sentiment || 0;
      if (sentiment >= 0.2) positive.push(pattern);
      else if (sentiment <= -0.2) negative.push(pattern);
      else neutral.push(pattern);
    });

    return { positive, neutral, negative };
  }, [patternsData]);

  // Calculate sentiment percentages
  const sentimentPercentages = useMemo(() => {
    const { positive, neutral, negative } = sentimentData.overview;
    const total = positive + neutral + negative || 1; // Prevent division by zero

    return {
      positive: Math.round((positive / total) * 100),
      neutral: Math.round((neutral / total) * 100),
      negative: Math.round((negative / total) * 100)
    };
  }, [sentimentData.overview]);

  // Get supporting statements for sentiment data
  const sentimentStatements = useMemo(() => {
    // Add logging to debug statement extraction
    console.log("Received sentiment statements from props:", sentimentData.statements);
    
    const result = sentimentData.statements || { positive: [], neutral: [], negative: [] };
    
    // Log the processed statements
    console.log("Sentiment statements to be used:", result);
    console.log("Positive statements count:", result.positive?.length || 0);
    console.log("Neutral statements count:", result.neutral?.length || 0);
    console.log("Negative statements count:", result.negative?.length || 0);
    
    return result;
  }, [sentimentData.statements]);

  // Summary chart data (for the top visualization)
  const getSummaryChartData = () => {
    if (type === 'themes') {
      return [
        { name: 'Positive Themes', value: themesBySentiment.positive.length, color: SENTIMENT_COLORS.positive },
        { name: 'Neutral Themes', value: themesBySentiment.neutral.length, color: SENTIMENT_COLORS.neutral },
        { name: 'Negative Themes', value: themesBySentiment.negative.length, color: SENTIMENT_COLORS.negative }
      ];
    } else if (type === 'patterns') {
      return [
        { name: 'Positive Patterns', value: patternsBySentiment.positive.length, color: SENTIMENT_COLORS.positive },
        { name: 'Neutral Patterns', value: patternsBySentiment.neutral.length, color: SENTIMENT_COLORS.neutral },
        { name: 'Negative Patterns', value: patternsBySentiment.negative.length, color: SENTIMENT_COLORS.negative }
      ];
    } else { // sentiment
      return [
        { name: 'Positive', value: sentimentPercentages.positive, color: SENTIMENT_COLORS.positive },
        { name: 'Neutral', value: sentimentPercentages.neutral, color: SENTIMENT_COLORS.neutral },
        { name: 'Negative', value: sentimentPercentages.negative, color: SENTIMENT_COLORS.negative }
      ];
    }
  };

  // Render theme items
  const renderThemeItems = (themes: Theme[], sentimentType: 'positive' | 'neutral' | 'negative') => {
    if (themes.length === 0) {
      return <p className="text-sm text-gray-500 italic">No {sentimentType} themes found</p>;
    }

    return (
      <div className="space-y-4">
        {themes.map((theme, idx) => (
          <div 
            key={`${theme.id}-${idx}`}
            className="p-3 rounded-md border"
            style={{ borderLeftWidth: '4px', borderLeftColor: SENTIMENT_COLORS[sentimentType] }}
          >
            <h4 className="font-medium">{theme.name}</h4>
            <div className="flex items-center mt-1 text-sm text-gray-600">
              <span>Frequency: {Math.round((theme.frequency || 0) * 100)}%</span>
            </div>
            {(theme.statements || theme.examples || []).length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium">Supporting Statements:</p>
                <ul className="mt-1 list-disc list-inside text-sm text-gray-600">
                  {(theme.statements || theme.examples || []).map((statement, i) => (
                    <li key={i} className="ml-2 whitespace-pre-wrap">{statement}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render pattern items
  const renderPatternItems = (patterns: Pattern[], sentimentType: 'positive' | 'neutral' | 'negative') => {
    if (patterns.length === 0) {
      return <p className="text-sm text-gray-500 italic">No {sentimentType} patterns found</p>;
    }

    // Group patterns by category
    const patternsByCategory: Record<string, Pattern[]> = {};
    patterns.forEach(pattern => {
      const category = pattern.category || 'Uncategorized';
      if (!patternsByCategory[category]) {
        patternsByCategory[category] = [];
      }
      patternsByCategory[category].push(pattern);
    });

    return (
      <div className="space-y-6">
        {Object.entries(patternsByCategory).map(([category, categoryPatterns]) => (
          <div key={category}>
            <h4 className="font-medium mb-2">{category}</h4>
            <div className="space-y-3">
              {categoryPatterns.map((pattern, idx) => (
                <div 
                  key={`${pattern.id}-${idx}`}
                  className="p-3 rounded-md border"
                  style={{ borderLeftWidth: '4px', borderLeftColor: SENTIMENT_COLORS[sentimentType] }}
                >
                  <h5 className="font-medium">{pattern.name}</h5>
                  <p className="text-sm text-gray-600 mt-1">{pattern.description}</p>
                  <div className="flex items-center mt-1 text-sm text-gray-600">
                    <span>Frequency: {Math.round((pattern.frequency || 0) * 100)}%</span>
                  </div>
                  {(pattern.evidence || pattern.examples || []).length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium">Supporting Evidence:</p>
                      <ul className="mt-1 list-disc list-inside text-sm text-gray-600">
                        {(pattern.evidence || pattern.examples || []).map((evidence, i) => (
                          <li key={i} className="ml-2 whitespace-pre-wrap">{evidence}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render sentiment statements
  const renderSentimentItems = (statements: string[], sentimentType: 'positive' | 'neutral' | 'negative') => {
    console.log(`Rendering ${sentimentType} sentiment statements:`, statements);
    
    if (!statements || statements.length === 0) {
      console.log(`No ${sentimentType} statements found`);
      return <p className="text-sm text-gray-500 italic">No {sentimentType} statements found</p>;
    }

    return (
      <ul className="space-y-2">
        {statements.map((statement, idx) => {
          console.log(`Rendering statement ${idx}:`, statement);
          return (
            <li 
              key={idx}
              className="p-3 rounded-md text-sm whitespace-pre-wrap"
              style={{ backgroundColor: `${SENTIMENT_COLORS[sentimentType]}15` }}
            >
              {statement}
            </li>
          );
        })}
      </ul>
    );
  };

  // Get the title based on the type
  const getTitle = () => {
    switch (type) {
      case 'themes': return 'Themes Analysis';
      case 'patterns': return 'Patterns Analysis';
      case 'sentiment': return 'Sentiment Analysis';
    }
  };

  return (
    <div className={`${className || ''} w-full`}>
      <h2 className="text-xl font-semibold mb-4">{getTitle()}</h2>
      
      {/* Summary Visualization (Pie Chart or Bar Chart) */}
      <div className="mb-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'sentiment' ? (
              <PieChart>
                <Pie
                  data={getSummaryChartData()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  innerRadius={40}
                  fill="#8884d8"
                  dataKey="value"
                  label={(entry) => `${entry.name}: ${entry.value}%`}
                >
                  {getSummaryChartData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
              </PieChart>
            ) : (
              <BarChart
                data={getSummaryChartData()}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" name="Count">
                  {getSummaryChartData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Three-Column Layout for Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Positive Column */}
        <div className="border rounded-lg p-4" style={{ borderColor: SENTIMENT_COLORS.positive }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: SENTIMENT_COLORS.positive }}>
            Positive {type === 'themes' ? 'Themes' : type === 'patterns' ? 'Patterns' : 'Sentiment'}
            {type !== 'sentiment' && <span className="ml-2 text-sm">
              ({type === 'themes' ? themesBySentiment.positive.length : patternsBySentiment.positive.length})
            </span>}
            {type === 'sentiment' && <span className="ml-2 text-sm">({sentimentPercentages.positive}%)</span>}
          </h3>
          
          {type === 'themes' && renderThemeItems(themesBySentiment.positive, 'positive')}
          {type === 'patterns' && renderPatternItems(patternsBySentiment.positive, 'positive')}
          {type === 'sentiment' && renderSentimentItems(sentimentStatements.positive, 'positive')}
        </div>
        
        {/* Neutral Column */}
        <div className="border rounded-lg p-4" style={{ borderColor: SENTIMENT_COLORS.neutral }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: SENTIMENT_COLORS.neutral }}>
            Neutral {type === 'themes' ? 'Themes' : type === 'patterns' ? 'Patterns' : 'Sentiment'}
            {type !== 'sentiment' && <span className="ml-2 text-sm">
              ({type === 'themes' ? themesBySentiment.neutral.length : patternsBySentiment.neutral.length})
            </span>}
            {type === 'sentiment' && <span className="ml-2 text-sm">({sentimentPercentages.neutral}%)</span>}
          </h3>
          
          {type === 'themes' && renderThemeItems(themesBySentiment.neutral, 'neutral')}
          {type === 'patterns' && renderPatternItems(patternsBySentiment.neutral, 'neutral')}
          {type === 'sentiment' && renderSentimentItems(sentimentStatements.neutral, 'neutral')}
        </div>
        
        {/* Negative Column */}
        <div className="border rounded-lg p-4" style={{ borderColor: SENTIMENT_COLORS.negative }}>
          <h3 className="text-lg font-medium mb-4" style={{ color: SENTIMENT_COLORS.negative }}>
            Negative {type === 'themes' ? 'Themes' : type === 'patterns' ? 'Patterns' : 'Sentiment'}
            {type !== 'sentiment' && <span className="ml-2 text-sm">
              ({type === 'themes' ? themesBySentiment.negative.length : patternsBySentiment.negative.length})
            </span>}
            {type === 'sentiment' && <span className="ml-2 text-sm">({sentimentPercentages.negative}%)</span>}
          </h3>
          
          {type === 'themes' && renderThemeItems(themesBySentiment.negative, 'negative')}
          {type === 'patterns' && renderPatternItems(patternsBySentiment.negative, 'negative')}
          {type === 'sentiment' && renderSentimentItems(sentimentStatements.negative, 'negative')}
        </div>
      </div>
    </div>
  );
};

export default UnifiedVisualization; 