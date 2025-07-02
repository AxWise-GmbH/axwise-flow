import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Copy, Users, Target, MessageCircle, Clock, CheckCircle2, BarChart3 } from 'lucide-react';

interface StakeholderQuestions {
  name: string;
  description: string;
  questions: {
    problemDiscovery: string[];
    solutionValidation: string[];
    followUp: string[];
  };
}

interface TimeEstimate {
  totalQuestions: number;
  estimatedMinutes: string;
  breakdown: {
    baseTime: number;
    withBuffer: number;
    perQuestion: number;
  };
  // New stakeholder-separated format from backend
  total?: {
    questions: number;
    min: number;
    max: number;
    description: string;
  };
  primary?: {
    questions: number;
    min: number;
    max: number;
    description: string;
  };
  secondary?: {
    questions: number;
    min: number;
    max: number;
    description: string;
  };
  // Legacy format support
  min?: number;
  max?: number;
}

interface ComprehensiveQuestionsProps {
  primaryStakeholders: StakeholderQuestions[];
  secondaryStakeholders: StakeholderQuestions[];
  timeEstimate: TimeEstimate;
  businessContext?: string;
  onExport?: () => void;
  onContinue?: () => void;
  onDashboard?: () => void;
}

export function ComprehensiveQuestionsComponent({
  primaryStakeholders,
  secondaryStakeholders,
  timeEstimate,
  businessContext,
  onExport,
  onContinue,
  onDashboard
}: ComprehensiveQuestionsProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Debug logging to understand the data flow issue
  console.log('🔍 ComprehensiveQuestionsComponent props:', {
    primaryStakeholders: primaryStakeholders?.length || 0,
    secondaryStakeholders: secondaryStakeholders?.length || 0,
    primaryStakeholdersData: primaryStakeholders,
    timeEstimate
  });

  // Safety checks for empty arrays
  const safePrimaryStakeholders = primaryStakeholders || [];
  const safeSecondaryStakeholders = secondaryStakeholders || [];

  // DEBUG: Log received data
  console.log('🔧 ComprehensiveQuestionsComponent received:', {
    primaryStakeholders: primaryStakeholders?.length || 0,
    secondaryStakeholders: secondaryStakeholders?.length || 0,
    timeEstimate,
    businessContext,
    primaryStakeholdersData: primaryStakeholders,
    secondaryStakeholdersData: secondaryStakeholders
  });

  // Calculate actual time estimate from stakeholder data if timeEstimate is empty/default
  const calculateActualTimeEstimate = () => {
    const allStakeholders = [...safePrimaryStakeholders, ...safeSecondaryStakeholders];
    let totalQuestions = 0;

    allStakeholders.forEach(stakeholder => {
      const questions = stakeholder.questions || {};
      totalQuestions += (questions.problemDiscovery || []).length;
      totalQuestions += (questions.solutionValidation || []).length;
      totalQuestions += (questions.followUp || []).length;
    });

    if (totalQuestions > 0) {
      const minTime = totalQuestions * 2; // 2 minutes per question minimum
      const maxTime = totalQuestions * 4; // 4 minutes per question maximum
      return {
        totalQuestions,
        estimatedMinutes: `${minTime}-${maxTime}`,
        breakdown: {
          baseTime: minTime,
          withBuffer: maxTime,
          perQuestion: 3.0
        }
      };
    }

    return timeEstimate;
  };

  // Handle both old and new time estimate formats from backend
  const actualTimeEstimate = (() => {
    // If backend provides new stakeholder-separated format
    if (timeEstimate.total && timeEstimate.total.questions > 0) {
      return {
        totalQuestions: timeEstimate.total.questions,
        estimatedMinutes: `${timeEstimate.total.min}-${timeEstimate.total.max}`,
        breakdown: {
          baseTime: timeEstimate.total.min,
          withBuffer: timeEstimate.total.max,
          perQuestion: Math.round((timeEstimate.total.min + timeEstimate.total.max) / 2 / timeEstimate.total.questions * 10) / 10
        }
      };
    }

    // If backend provides legacy format with totalQuestions
    if (timeEstimate.totalQuestions && timeEstimate.totalQuestions > 0) {
      return timeEstimate;
    }

    // Fallback to frontend calculation
    return calculateActualTimeEstimate();
  })();

  // Calculate separate estimates for primary and secondary stakeholders
  const calculateStakeholderEstimate = (stakeholders: StakeholderQuestions[]) => {
    const totalQuestions = stakeholders.reduce((total, stakeholder) => {
      const questions = stakeholder.questions || { problemDiscovery: [], solutionValidation: [], followUp: [] };
      return total +
        (questions.problemDiscovery?.length || 0) +
        (questions.solutionValidation?.length || 0) +
        (questions.followUp?.length || 0);
    }, 0);

    // FIXED: Use consistent 2-4 minutes per question range
    const minTime = Math.max(10, totalQuestions * 2); // 2 minutes per question minimum
    const maxTime = Math.max(15, totalQuestions * 4); // 4 minutes per question maximum

    return {
      questions: totalQuestions,
      timeRange: `${minTime}-${maxTime}`
    };
  };

  const primaryEstimate = calculateStakeholderEstimate(safePrimaryStakeholders);
  const secondaryEstimate = calculateStakeholderEstimate(safeSecondaryStakeholders);

  const copyAllQuestions = async () => {
    const formatStakeholderQuestions = (stakeholders: StakeholderQuestions[], type: string) => {
      return stakeholders.map(stakeholder => {
        // FIXED: Add safety checks for undefined questions
        const questions = stakeholder.questions || {
          problemDiscovery: [],
          solutionValidation: [],
          followUp: []
        };

        return `## ${stakeholder.name}
${stakeholder.description}

### 🔍 Problem Discovery Questions
${(questions.problemDiscovery || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

### ✅ Solution Validation Questions
${(questions.solutionValidation || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

### 💡 Follow-up Questions
${(questions.followUp || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
      }).join('\n\n---\n\n');
    };

    const formattedText = `# Customer Research Questionnaire
${businessContext ? `**Business:** ${businessContext}\n` : ''}
**Total Questions:** ${actualTimeEstimate.totalQuestions}
**Estimated Interview Time:** ${actualTimeEstimate.estimatedMinutes} minutes

## 🎯 Primary Stakeholders (Focus First)
Start with these stakeholders to validate core assumptions.

${formatStakeholderQuestions(safePrimaryStakeholders, 'Primary')}

${safeSecondaryStakeholders.length > 0 ? `
## 👥 Secondary Stakeholders (Research Later)
Expand to these stakeholders after validating primary assumptions.

${formatStakeholderQuestions(safeSecondaryStakeholders, 'Secondary')}
` : ''}

## ⏱️ Interview Planning
- **Base time:** ${actualTimeEstimate.breakdown.baseTime} minutes
- **With buffer:** ${actualTimeEstimate.breakdown.withBuffer} minutes
- **Per question:** ${actualTimeEstimate.breakdown.perQuestion} minutes average
- **Total questions:** ${actualTimeEstimate.totalQuestions}

## 📋 Research Strategy
1. **Start with Primary Stakeholders:** Focus on ${safePrimaryStakeholders.length} primary stakeholder${safePrimaryStakeholders.length !== 1 ? 's' : ''} first
2. **Validate Core Value:** Ensure your solution addresses primary stakeholder pain points
3. **Expand Strategically:** Research secondary stakeholders to refine your approach
4. **Look for Patterns:** Identify common themes and prioritize features by stakeholder impact`;

    try {
      await navigator.clipboard.writeText(formattedText);
      setCopiedSection('all');
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const copyStakeholderQuestions = async (stakeholder: StakeholderQuestions, index: number) => {
    // FIXED: Add safety checks for undefined questions
    const questions = stakeholder.questions || {
      problemDiscovery: [],
      solutionValidation: [],
      followUp: []
    };

    const formattedText = `## ${stakeholder.name}
${stakeholder.description}

### 🔍 Problem Discovery Questions
${(questions.problemDiscovery || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

### ✅ Solution Validation Questions
${(questions.solutionValidation || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

### 💡 Follow-up Questions
${(questions.followUp || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    try {
      await navigator.clipboard.writeText(formattedText);
      setCopiedSection(`stakeholder-${index}`);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const renderStakeholderSection = (stakeholder: StakeholderQuestions, index: number, isPrimary: boolean) => {
    // FIXED: Add safety checks for undefined questions structure
    const questions = stakeholder.questions || {
      problemDiscovery: [],
      solutionValidation: [],
      followUp: []
    };

    const questionCategories = [
      {
        title: '🔍 Problem Discovery Questions',
        description: 'Understand current state and pain points',
        questions: questions.problemDiscovery || [],
        priority: 'high' as const
      },
      {
        title: '✅ Solution Validation Questions',
        description: 'Validate your proposed solution approach',
        questions: questions.solutionValidation || [],
        priority: 'medium' as const
      },
      {
        title: '💡 Follow-up Questions',
        description: 'Deeper insights and next steps',
        questions: questions.followUp || [],
        priority: 'low' as const
      }
    ];

    return (
      <Card key={`${isPrimary ? 'primary' : 'secondary'}-${index}`} className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={isPrimary ? "default" : "secondary"} className="text-xs">
                {isPrimary ? 'Primary' : 'Secondary'}
              </Badge>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stakeholder.name}</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{stakeholder.description}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyStakeholderQuestions(stakeholder, index)}
            className="flex-shrink-0"
          >
            {copiedSection === `stakeholder-${index}` ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="space-y-4">
          {questionCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">{category.title}</h4>
                <Badge variant="outline" className="text-xs">
                  {category.questions.length} questions
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{category.description}</p>

              <div className="space-y-2">
                {category.questions.map((question, questionIndex) => (
                  <div
                    key={questionIndex}
                    className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border dark:border-gray-700"
                  >
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300 border dark:border-gray-600">
                        {questionIndex + 1}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{question}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Time Estimate */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">📋 Your Research Questionnaire</h2>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Target className="h-4 w-4 text-blue-600" />
            <span className="font-medium">{primaryEstimate.questions} primary</span>
          </div>
          {safeSecondaryStakeholders.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="font-medium">{secondaryEstimate.questions} secondary</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            <span>{actualTimeEstimate.totalQuestions} total questions</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-green-600" />
            <span>{primaryEstimate.timeRange} per conversation</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          Complete questionnaire with all stakeholders integrated. Start with primary stakeholders to validate core assumptions, then expand to secondary stakeholders.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={copyAllQuestions} className="flex items-center gap-2">
          {copiedSection === 'all' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Copy All
        </Button>
        {onDashboard && (
          <Button onClick={onDashboard} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
            <BarChart3 className="h-4 w-4" />
            Go to Dashboard
          </Button>
        )}
        {onExport && (
          <Button variant="outline" onClick={onExport} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        )}
        {onContinue && (
          <Button variant="outline" onClick={onContinue} className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Start Research
          </Button>
        )}
      </div>

      {/* Primary Stakeholders */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">🎯 Primary Stakeholders</h3>
          <Badge variant="default" className="text-xs">Focus First</Badge>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Start with these {safePrimaryStakeholders.length} stakeholder{safePrimaryStakeholders.length !== 1 ? 's' : ''} to validate core business assumptions.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              <span>{primaryEstimate.questions} questions</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{primaryEstimate.timeRange} minutes</span>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {safePrimaryStakeholders.map((stakeholder, index) =>
            renderStakeholderSection(stakeholder, index, true)
          )}
        </div>
      </div>

      {/* Secondary Stakeholders */}
      {safeSecondaryStakeholders.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">👥 Secondary Stakeholders</h3>
            <Badge variant="secondary" className="text-xs">Research Later</Badge>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Expand to these {safeSecondaryStakeholders.length} stakeholder{safeSecondaryStakeholders.length !== 1 ? 's' : ''} after validating primary assumptions.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                <span>{secondaryEstimate.questions} questions</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{secondaryEstimate.timeRange} minutes</span>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {safeSecondaryStakeholders.map((stakeholder, index) =>
              renderStakeholderSection(stakeholder, index, false)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
