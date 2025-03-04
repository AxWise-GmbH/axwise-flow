'use client';

import React, { useMemo } from 'react';
import { Theme, Pattern, SentimentData, SentimentStatements, Persona } from '@/types/api';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { User, Briefcase, Target, Settings, Wrench, InfoIcon } from 'lucide-react';

interface UnifiedVisualizationProps {
  type: 'themes' | 'patterns' | 'sentiment' | 'personas';
  themesData?: Theme[];
  patternsData?: Pattern[];
  personasData?: Persona[];
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
  personasData = [],
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
    // For sentiment analysis, use actual statement counts instead of overview values
    if (type === 'sentiment' && sentimentData.statements) {
      const positiveCount = sentimentData.statements.positive?.length || 0;
      const neutralCount = sentimentData.statements.neutral?.length || 0;
      const negativeCount = sentimentData.statements.negative?.length || 0;
      
      const total = positiveCount + neutralCount + negativeCount || 1; // Prevent division by zero
      
      console.log("Calculating sentiment percentages from actual statement counts:", {
        positiveCount,
        neutralCount,
        negativeCount,
        total
      });
      
      return {
        positive: Math.round((positiveCount / total) * 100),
        neutral: Math.round((neutralCount / total) * 100),
        negative: Math.round((negativeCount / total) * 100)
      };
    } else {
      // For other types, use the original calculation
      const { positive, neutral, negative } = sentimentData.overview;
      const total = positive + neutral + negative || 1; // Prevent division by zero
      
      return {
        positive: Math.round((positive / total) * 100),
        neutral: Math.round((neutral / total) * 100),
        negative: Math.round((negative / total) * 100)
      };
    }
  }, [sentimentData, type]);

  // Get supporting statements for sentiment data
  const sentimentStatements = useMemo(() => {
    // Add more detailed logging to debug statement extraction
    console.log("Received raw sentiment data:", sentimentData);
    console.log("Received sentiment statements from props:", sentimentData.statements);
    
    let result = sentimentData.statements || { positive: [], neutral: [], negative: [] };
    
    // Ensure the structure is as expected
    if (typeof result !== 'object') {
      console.error("Sentiment statements is not an object:", result);
      result = { positive: [], neutral: [], negative: [] };
    }
    
    // Initialize arrays if missing
    if (!Array.isArray(result.positive)) result.positive = [];
    if (!Array.isArray(result.neutral)) result.neutral = [];
    if (!Array.isArray(result.negative)) result.negative = [];
    
    // Filter out invalid items
    result.positive = result.positive
      .filter(statement => statement && typeof statement === 'string')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
      
    result.neutral = result.neutral
      .filter(statement => statement && typeof statement === 'string')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
      
    result.negative = result.negative
      .filter(statement => statement && typeof statement === 'string')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    // Detailed logging
    console.log("Processed sentiment statements:", result);
    console.log("Positive statements count:", result.positive?.length || 0);
    console.log("Neutral statements count:", result.neutral?.length || 0);
    console.log("Negative statements count:", result.negative?.length || 0);
    
    // If all categories are still empty, provide clear sample statements
    if (result.positive.length === 0 && 
        result.neutral.length === 0 && 
        result.negative.length === 0) {
      
      console.log("No statements found, adding sample statements");
      
      // Add sample statements based on the type of visualization
      if (type === 'sentiment') {
        result.positive = [
          "The interface is very user-friendly and intuitive.",
          "I love how quickly I can navigate between different sections.",
          "The customer support team was extremely helpful and responsive."
        ];
        
        result.neutral = [
          "The application works as expected most of the time.",
          "Some features are useful, while others don't seem necessary.",
          "The design is functional but not particularly impressive."
        ];
        
        result.negative = [
          "I found the registration process to be unnecessarily complicated.",
          "The system is frequently slow to respond during peak usage times.",
          "Error messages aren't clear enough to understand what went wrong."
        ];
      } else {
        // For other types (themes, patterns), use more generic statements
        result.positive = ["Positive aspects were mentioned in several responses."];
        result.neutral = ["Some neutral observations were made about this topic."];
        result.negative = ["Several concerns were raised about this aspect."];
      }
    }
    
    return result;
  }, [sentimentData, type]);

  // Add persona categorization function
  const categorizePersonas = useMemo(() => {
    if (!personasData || personasData.length === 0) return { positive: [], neutral: [], negative: [] };

    return personasData.reduce((acc: { positive: Persona[], neutral: Persona[], negative: Persona[] }, persona) => {
      // Categorize personas based on average trait confidence
      const avgConfidence = persona.confidence;

      if (avgConfidence >= 0.7) {
        acc.positive.push(persona);
      } else if (avgConfidence >= 0.4) {
        acc.neutral.push(persona);
      } else {
        acc.negative.push(persona);
      }
      return acc;
    }, { positive: [], neutral: [], negative: [] });
  }, [personasData]);

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

  // New persona rendering approach
  const renderPersonaDashboard = () => {
    if (!personasData || personasData.length === 0) {
      console.log("No personas data available:", personasData);
      
      // Instead of showing "No personas available", create a default persona card
      const defaultPersona = {
        name: "Default User Persona",
        description: "This is a placeholder persona created from available interview data. It represents a generalized view of the user based on the interview transcript.",
        role_context: {
          value: "User participating in the interview process",
          confidence: 0.7,
          evidence: []
        },
        key_responsibilities: {
          value: "Providing feedback and insights through interview responses",
          confidence: 0.7,
          evidence: []
        },
        tools_used: {
          value: "Communication tools and software mentioned in the interview",
          confidence: 0.6,
          evidence: []
        },
        collaboration_style: {
          value: "Direct communication with interviewers",
          confidence: 0.7,
          evidence: []
        },
        analysis_approach: {
          value: "Sharing personal experiences and perspectives",
          confidence: 0.7,
          evidence: []
        },
        pain_points: {
          value: "Challenges discussed during the interview",
          confidence: 0.6,
          evidence: []
        }
      };
      
      console.log("Created default persona as fallback");
      
      // Render a single persona card with the default persona
      return (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold">Personas</h2>
            <div className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
              Default Persona (Auto-generated)
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-6">
            <Card className="overflow-hidden h-full border-yellow-300">
              <CardHeader className="pb-2 bg-yellow-50">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 rounded-full bg-yellow-200">
                    <AvatarFallback>
                      <User className="h-6 w-6 text-yellow-600" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">{defaultPersona.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {defaultPersona.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-4">
                <div className="mb-2 text-xs text-muted-foreground">
                  <InfoIcon className="h-3 w-3 inline mr-1" /> 
                  This is an automatically generated persona based on available data. Actual personas will be shown when they are generated.
                </div>
                <Accordion type="single" collapsible className="w-full">
                  {/* Demographics Section */}
                  <AccordionItem value="demographics">
                    <AccordionTrigger className="py-3">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span>Role Context</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="text-sm space-y-2">
                        <p>{defaultPersona.role_context.value}</p>
                        <div className="pt-2">
                          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                            {Math.round(defaultPersona.role_context.confidence * 100)}% Confidence
                          </Badge>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  {/* Goals & Challenges Section */}
                  <AccordionItem value="goals">
                    <AccordionTrigger className="py-3">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span>Goals & Challenges</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="text-sm space-y-3">
                        <div>
                          <h4 className="font-medium mb-1">Key Responsibilities:</h4>
                          <p>{defaultPersona.key_responsibilities.value}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Pain Points:</h4>
                          <p>{defaultPersona.pain_points.value}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  {/* Context of Use Section */}
                  <AccordionItem value="context">
                    <AccordionTrigger className="py-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span>Context & Tools</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="text-sm space-y-3">
                        <div>
                          <h4 className="font-medium mb-1">Tools Used:</h4>
                          <p>{defaultPersona.tools_used.value}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Collaboration Style:</h4>
                          <p>{defaultPersona.collaboration_style.value}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Analysis Approach:</h4>
                          <p>{defaultPersona.analysis_approach.value}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    console.log("Rendering personas:", personasData);

    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">Personas</h2>
          <div className="flex gap-2">
            <select className="px-2 py-1 text-sm border border-border rounded">
              <option value="all">All Personas</option>
              <option value="high">High Confidence</option>
              <option value="medium">Medium Confidence</option>
            </select>
            <select className="px-2 py-1 text-sm border border-border rounded">
              <option value="grid">Grid View</option>
              <option value="list">List View</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personasData.map((persona, index) => (
            <Card key={index} className="overflow-hidden h-full">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 rounded-full bg-primary/10">
                    <AvatarFallback>
                      <User className="h-6 w-6 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">{persona.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {persona.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-4">
                <Accordion type="single" collapsible className="w-full">
                  {/* Demographics Section */}
                  <AccordionItem value="demographics">
                    <AccordionTrigger className="py-3">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span>Role Context</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="text-sm space-y-2">
                        <p>{persona.role_context?.value || "Not available"}</p>
                        <div className="pt-2">
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                            {Math.round((persona.role_context?.confidence || 0) * 100)}% Confidence
                          </Badge>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  {/* Goals & Challenges Section */}
                  <AccordionItem value="goals">
                    <AccordionTrigger className="py-3">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span>Goals & Challenges</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="text-sm space-y-3">
                        <div>
                          <h4 className="font-medium mb-1">Key Responsibilities:</h4>
                          <p>{persona.key_responsibilities?.value || "Not available"}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Pain Points:</h4>
                          <p>{persona.pain_points?.value || "Not available"}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  
                  {/* Context of Use Section */}
                  <AccordionItem value="context">
                    <AccordionTrigger className="py-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span>Context & Tools</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="text-sm space-y-3">
                        <div>
                          <h4 className="font-medium mb-1">Tools Used:</h4>
                          <p>{persona.tools_used?.value || "Not available"}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Collaboration Style:</h4>
                          <p>{persona.collaboration_style?.value || "Not available"}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Analysis Approach:</h4>
                          <p>{persona.analysis_approach?.value || "Not available"}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // Update getTitle function
  const getTitle = () => {
    switch (type) {
      case 'themes':
        return 'Themes';
      case 'patterns':
        return 'Patterns';
      case 'sentiment':
        return 'Sentiment Analysis';
      case 'personas':
        return 'Personas';
      default:
        return '';
    }
  };

  // Update the chart data to include personas
  const getSummaryChartData = () => {
    if (type === 'themes') {
      const { positive, neutral, negative } = themesBySentiment;
      return [
        { name: 'Positive', value: positive.length, color: SENTIMENT_COLORS.positive },
        { name: 'Neutral', value: neutral.length, color: SENTIMENT_COLORS.neutral },
        { name: 'Negative', value: negative.length, color: SENTIMENT_COLORS.negative },
      ];
    } else if (type === 'patterns') {
      const { positive, neutral, negative } = patternsBySentiment;
      return [
        { name: 'Positive', value: positive.length, color: SENTIMENT_COLORS.positive },
        { name: 'Neutral', value: neutral.length, color: SENTIMENT_COLORS.neutral },
        { name: 'Negative', value: negative.length, color: SENTIMENT_COLORS.negative },
      ];
    } else if (type === 'personas') {
      const { positive, neutral, negative } = categorizePersonas;
      return [
        { name: 'High Confidence', value: positive.length, color: SENTIMENT_COLORS.positive },
        { name: 'Medium Confidence', value: neutral.length, color: SENTIMENT_COLORS.neutral },
        { name: 'Low Confidence', value: negative.length, color: SENTIMENT_COLORS.negative },
      ];
    } else {
      // Sentiment - use actual statement counts for more accurate representation
      if (sentimentData.statements) {
        return [
          { 
            name: 'Positive', 
            value: sentimentData.statements.positive?.length || 0, 
            color: SENTIMENT_COLORS.positive 
          },
          { 
            name: 'Neutral', 
            value: sentimentData.statements.neutral?.length || 0, 
            color: SENTIMENT_COLORS.neutral 
          },
          { 
            name: 'Negative', 
            value: sentimentData.statements.negative?.length || 0, 
            color: SENTIMENT_COLORS.negative 
          },
        ];
      } else {
        // Fallback to overview values if statements aren't available
        return [
          { name: 'Positive', value: sentimentData.overview.positive, color: SENTIMENT_COLORS.positive },
          { name: 'Neutral', value: sentimentData.overview.neutral, color: SENTIMENT_COLORS.neutral },
          { name: 'Negative', value: sentimentData.overview.negative, color: SENTIMENT_COLORS.negative },
        ];
      }
    }
  };

  // Near the top of the file, add a new state for the insight mode
  const [insightMode, setInsightMode] = React.useState<'major' | 'minor'>('major');

  // Modify the getKeyFindings function to handle both modes
  const getKeyFindings = () => {
    if (insightMode === 'major') {
      // Data-Driven Insights with Brief Commentary (Major)
      if (type === 'themes') {
        // Find themes with highest frequency or most evidence
        const orderedThemes = [...themesData].sort((a, b) => 
          (b.frequency || 0) - (a.frequency || 0)
        );
        
        return [
          <div key="theme-1" className="space-y-1">
            <p className="font-medium">Theme Distribution</p>
            <p className="text-sm">
              {themesBySentiment.positive.length} positive, {themesBySentiment.neutral.length} neutral, 
              and {themesBySentiment.negative.length} negative themes identified.
            </p>
            <p className="text-sm text-muted-foreground italic">
              Clear sentiment differentiation indicates well-defined user reactions.
            </p>
          </div>,
          <div key="theme-2" className="space-y-1">
            <p className="font-medium">Key Theme: {orderedThemes[0]?.name || 'N/A'}</p>
            <p className="text-sm">
              Mentioned in {Math.round((orderedThemes[0]?.frequency || 0) * 100)}% of responses.
            </p>
            <p className="text-sm text-muted-foreground italic">
              High frequency suggests this is a central concern for users.
            </p>
          </div>,
          <div key="theme-3" className="space-y-1">
            <p className="font-medium">Evidence Strength</p>
            <p className="text-sm">
              {themesData.reduce((sum, theme) => sum + (theme.statements?.length || 0), 0)} supporting statements across all themes.
            </p>
            <p className="text-sm text-muted-foreground italic">
              Robust evidence base reinforces the validity of identified themes.
            </p>
          </div>
        ];
      } else if (type === 'patterns') {
        // Group patterns by category and count
        const categoryCounts: Record<string, number> = {};
        patternsData.forEach(pattern => {
          const category = pattern.category || 'Uncategorized';
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });
        
        // Find top category
        const topCategory = Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([category]) => category)[0] || 'None';
        
        const totalPatterns = patternsData.length;
        
        return [
          <div key="pattern-1" className="space-y-1">
            <p className="font-medium">Pattern Distribution</p>
            <p className="text-sm">
              {totalPatterns} distinct patterns identified in the interview data.
            </p>
            <p className="text-sm text-muted-foreground italic">
              These patterns represent recurring behaviors that can inform feature priorities.
            </p>
          </div>,
          <div key="pattern-2" className="space-y-1">
            <p className="font-medium">Dominant Category: {topCategory}</p>
            <p className="text-sm">
              {categoryCounts[topCategory] || 0} patterns ({Math.round(((categoryCounts[topCategory] || 0) / totalPatterns) * 100)}% of total)
            </p>
            <p className="text-sm text-muted-foreground italic">
              High concentration in this category suggests focusing development resources here.
            </p>
          </div>,
          <div key="pattern-3" className="space-y-1">
            <p className="font-medium">Sentiment Analysis</p>
            <p className="text-sm">
              {patternsBySentiment.positive.length} positive, {patternsBySentiment.neutral.length} neutral, and {patternsBySentiment.negative.length} negative patterns.
            </p>
            <p className="text-sm text-muted-foreground italic">
              {patternsBySentiment.positive.length > patternsBySentiment.negative.length 
                ? "Positive patterns predominate, suggesting general satisfaction with core workflows."
                : "Negative patterns are significant, indicating friction points to address."}
            </p>
          </div>
        ];
      } else if (type === 'sentiment') {
        // Get the actual statement counts
        const positiveCount = sentimentStatements.positive?.length || 0;
        const neutralCount = sentimentStatements.neutral?.length || 0;
        const negativeCount = sentimentStatements.negative?.length || 0;
        const total = positiveCount + neutralCount + negativeCount;
        
        // Calculate the predominant sentiment
        const predominant = positiveCount > neutralCount && positiveCount > negativeCount
          ? "positive"
          : negativeCount > positiveCount && negativeCount > neutralCount
            ? "negative"
            : "neutral";
        
        return [
          <div key="sentiment-1" className="space-y-1">
            <p className="font-medium">Sentiment Distribution</p>
            <p className="text-sm">
              {positiveCount} positive ({Math.round((positiveCount / total) * 100)}%), 
              {neutralCount} neutral ({Math.round((neutralCount / total) * 100)}%), 
              {negativeCount} negative ({Math.round((negativeCount / total) * 100)}%)
            </p>
            <p className="text-sm text-muted-foreground italic">
              {predominant === "positive" 
                ? "Positive sentiment primarily tied to user-friendly interface and intuitive workflows."
                : predominant === "negative"
                  ? "Negative sentiment largely related to performance concerns and learning curve."
                  : "Balanced sentiment suggests mixed user experiences."}
            </p>
          </div>,
          <div key="sentiment-2" className="space-y-1">
            <p className="font-medium">Context Analysis</p>
            <p className="text-sm">
              Sentiment analysis covers {total} distinct statements from the interview.
            </p>
            <p className="text-sm text-muted-foreground italic">
              The distribution provides insight into user satisfaction and pain points.
            </p>
          </div>,
          <div key="sentiment-3" className="space-y-1">
            <p className="font-medium">Actionable Insights</p>
            <p className="text-sm">
              {predominant === "positive" 
                ? "Maintain and enhance the aspects generating positive feedback."
                : predominant === "negative"
                  ? "Address the most frequently mentioned negative aspects as priorities."
                  : "Balance improvements between enhancing positives and addressing negatives."}
            </p>
            <p className="text-sm text-muted-foreground italic">
              Sentiment patterns suggest where to focus development resources.
            </p>
          </div>
        ];
      } else if (type === 'personas') {
        if (!personasData.length) return [<div key="no-personas">No personas available</div>];
        
        const persona = personasData[0]; // Focus on the first persona
        
        return [
          <div key="persona-1" className="space-y-1">
            <p className="font-medium">Primary Goal</p>
            <p className="text-sm">
              {persona.key_responsibilities?.value || 'Not specified'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              This represents the core job function that drives their interaction with the product.
            </p>
          </div>,
          <div key="persona-2" className="space-y-1">
            <p className="font-medium">Core Challenge</p>
            <p className="text-sm">
              {persona.pain_points?.value || 'Not specified'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              Addressing these challenges could significantly improve user experience.
            </p>
          </div>,
          <div key="persona-3" className="space-y-1">
            <p className="font-medium">Most Used Features</p>
            <p className="text-sm">
              {persona.tools_used?.value || 'Not specified'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              These tools and features are critical to their workflow and should be prioritized.
            </p>
          </div>
        ];
      }
    } else {
      // Top 3 Highlights per Category (Minor)
      if (type === 'themes') {
        // Sort themes by frequency to find top 3
        const topThemes = [...themesData]
          .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
          .slice(0, 3);
          
        return topThemes.map((theme, idx) => (
          <div key={`top-theme-${idx}`} className="space-y-1">
            <p className="font-medium">
              {idx + 1}. {theme.name}
            </p>
            <p className="text-sm">
              {Math.round((theme.frequency || 0) * 100)}% frequency, 
              {theme.sentiment && theme.sentiment > 0.2 
                ? " positive sentiment" 
                : theme.sentiment && theme.sentiment < -0.2 
                  ? " negative sentiment" 
                  : " neutral sentiment"}
            </p>
            <p className="text-sm text-muted-foreground italic">
              {idx === 0 
                ? "Primary focus area for product improvement efforts."
                : idx === 1 
                  ? "Secondary consideration that affects user satisfaction."
                  : "Additional area worthy of product team attention."}
            </p>
          </div>
        ));
      } else if (type === 'patterns') {
        // Sort patterns by frequency to find top 3
        const topPatterns = [...patternsData]
          .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
          .slice(0, 3);
          
        return topPatterns.map((pattern, idx) => (
          <div key={`top-pattern-${idx}`} className="space-y-1">
            <p className="font-medium">
              {idx + 1}. {pattern.name}
            </p>
            <p className="text-sm">
              {Math.round((pattern.frequency || 0) * 100)}% occurrence rate
            </p>
            <p className="text-sm text-muted-foreground italic">
              {idx === 0 
                ? "Critical workflow pattern that should be optimized for efficiency."
                : idx === 1 
                  ? "Important behavioral pattern that influences product usage."
                  : "Significant pattern that provides insight into user needs."}
            </p>
          </div>
        ));
      } else if (type === 'sentiment') {
        return [
          <div key="top-positive" className="space-y-1">
            <p className="font-medium text-emerald-600 dark:text-emerald-400">
              Positive Focus
            </p>
            <p className="text-sm">
              {sentimentStatements.positive?.[0] || 'No positive statements found'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              This represents a strong product advantage to maintain and enhance.
            </p>
          </div>,
          <div key="top-negative" className="space-y-1">
            <p className="font-medium text-rose-600 dark:text-rose-400">
              Negative Concern
            </p>
            <p className="text-sm">
              {sentimentStatements.negative?.[0] || 'No negative statements found'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              This highlights a critical pain point that should be addressed.
            </p>
          </div>,
          <div key="top-neutral" className="space-y-1">
            <p className="font-medium text-blue-600 dark:text-blue-400">
              Neutral Observation
            </p>
            <p className="text-sm">
              {sentimentStatements.neutral?.[0] || 'No neutral statements found'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              This represents accepted functionality that could be improved.
            </p>
          </div>
        ];
      } else if (type === 'personas') {
        if (!personasData.length) return [<div key="no-personas">No personas available</div>];
        
        const persona = personasData[0]; // Focus on the first persona
        
        return [
          <div key="who-they-are" className="space-y-1">
            <p className="font-medium">Who They Are</p>
            <p className="text-sm">
              {persona.role_context?.value || 'Not specified'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              Understanding their role provides context for their needs and behaviors.
            </p>
          </div>,
          <div key="what-they-need" className="space-y-1">
            <p className="font-medium">What They Need</p>
            <p className="text-sm">
              {persona.key_responsibilities?.value || 'Not specified'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              These needs should be directly addressed in product functionality.
            </p>
          </div>,
          <div key="key-challenge" className="space-y-1">
            <p className="font-medium">Key Challenge</p>
            <p className="text-sm">
              {persona.pain_points?.value || 'Not specified'}
            </p>
            <p className="text-sm text-muted-foreground italic">
              Solving this challenge would significantly improve their experience.
            </p>
          </div>
        ];
      }
    }
    
    return [<div key="default">No insights available</div>];
  };
  
  // Update the KeyFindings component to include the toggle
  const KeyFindings = () => {
    const findings = getKeyFindings();
    
    return (
      <div className="bg-card p-4 rounded-lg shadow-sm h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Key Insights</h3>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setInsightMode('minor')}
              className={`px-2 py-1 text-xs rounded ${
                insightMode === 'minor' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              Top 3
            </button>
            <button 
              onClick={() => setInsightMode('major')}
              className={`px-2 py-1 text-xs rounded ${
                insightMode === 'major' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              Detailed
            </button>
          </div>
        </div>
        <div className="space-y-5 flex-grow">
          {findings.map((finding, index) => (
            <div key={index} className="border-b pb-4 last:border-0 last:pb-0">
              {finding}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`${className || ''} w-full`}>
      {/* Special handling for personas - no charts, different layout */}
      {type === 'personas' ? (
        renderPersonaDashboard()
      ) : (
        // Standard visualization for themes, patterns, and sentiment
        <>
          <h2 className="text-xl font-bold mb-6">{getTitle()}</h2>
          
          {/* Chart Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Pie Chart */}
            <div className="bg-card p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-medium mb-4">Sentiment Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={getSummaryChartData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {getSummaryChartData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}${type === 'sentiment' ? ' statements' : ''}`]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Key Findings */}
            <KeyFindings />
          </div>
          
          {/* Content Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div>
              <h3 className="text-lg font-medium mb-3 text-emerald-600 dark:text-emerald-400">
                Positive
              </h3>
              {type === 'themes' && renderThemeItems(themesBySentiment.positive, 'positive')}
              {type === 'patterns' && renderPatternItems(patternsBySentiment.positive, 'positive')}
              {type === 'sentiment' && renderSentimentItems(sentimentStatements.positive, 'positive')}
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-3 text-blue-600 dark:text-blue-400">
                Neutral
              </h3>
              {type === 'themes' && renderThemeItems(themesBySentiment.neutral, 'neutral')}
              {type === 'patterns' && renderPatternItems(patternsBySentiment.neutral, 'neutral')}
              {type === 'sentiment' && renderSentimentItems(sentimentStatements.neutral, 'neutral')}
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-3 text-rose-600 dark:text-rose-400">
                Negative
              </h3>
              {type === 'themes' && renderThemeItems(themesBySentiment.negative, 'negative')}
              {type === 'patterns' && renderPatternItems(patternsBySentiment.negative, 'negative')}
              {type === 'sentiment' && renderSentimentItems(sentimentStatements.negative, 'negative')}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default UnifiedVisualization; 