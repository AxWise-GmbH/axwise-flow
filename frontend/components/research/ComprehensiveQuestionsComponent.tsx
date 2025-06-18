import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Copy, Users, Target, MessageCircle, Clock, CheckCircle2 } from 'lucide-react';

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
}

interface ComprehensiveQuestionsProps {
  primaryStakeholders: StakeholderQuestions[];
  secondaryStakeholders: StakeholderQuestions[];
  timeEstimate: TimeEstimate;
  businessContext?: string;
  onExport?: () => void;
  onContinue?: () => void;
}

export function ComprehensiveQuestionsComponent({
  primaryStakeholders,
  secondaryStakeholders,
  timeEstimate,
  businessContext,
  onExport,
  onContinue
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
**Total Questions:** ${timeEstimate.totalQuestions}
**Estimated Interview Time:** ${timeEstimate.estimatedMinutes} minutes

## 🎯 Primary Stakeholders (Focus First)
Start with these stakeholders to validate core assumptions.

${formatStakeholderQuestions(safePrimaryStakeholders, 'Primary')}

${safeSecondaryStakeholders.length > 0 ? `
## 👥 Secondary Stakeholders (Research Later)
Expand to these stakeholders after validating primary assumptions.

${formatStakeholderQuestions(safeSecondaryStakeholders, 'Secondary')}
` : ''}

## ⏱️ Interview Planning
- **Base time:** ${timeEstimate.breakdown.baseTime} minutes
- **With buffer:** ${timeEstimate.breakdown.withBuffer} minutes
- **Per question:** ${timeEstimate.breakdown.perQuestion} minutes average
- **Total questions:** ${timeEstimate.totalQuestions}

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
              <h3 className="text-lg font-semibold text-gray-900">{stakeholder.name}</h3>
            </div>
            <p className="text-sm text-gray-600">{stakeholder.description}</p>
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
                <h4 className="font-medium text-gray-900">{category.title}</h4>
                <Badge variant="outline" className="text-xs">
                  {category.questions.length} questions
                </Badge>
              </div>
              <p className="text-xs text-gray-500">{category.description}</p>

              <div className="space-y-2">
                {category.questions.map((question, questionIndex) => (
                  <div
                    key={questionIndex}
                    className="flex gap-3 p-3 bg-gray-50 rounded-lg border"
                  >
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-sm font-medium text-gray-600 border">
                        {questionIndex + 1}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-800 leading-relaxed">{question}</p>
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
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            <span>{timeEstimate.totalQuestions} questions</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Estimated time: {timeEstimate.estimatedMinutes} minutes</span>
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
        {onExport && (
          <Button variant="outline" onClick={onExport} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        )}
        {onContinue && (
          <Button onClick={onContinue} className="flex items-center gap-2">
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
        <p className="text-sm text-muted-foreground">
          Start with these {safePrimaryStakeholders.length} stakeholder{safePrimaryStakeholders.length !== 1 ? 's' : ''} to validate core business assumptions.
        </p>
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
          <p className="text-sm text-muted-foreground">
            Expand to these {safeSecondaryStakeholders.length} stakeholder{safeSecondaryStakeholders.length !== 1 ? 's' : ''} after validating primary assumptions.
          </p>
          <div className="space-y-4">
            {safeSecondaryStakeholders.map((stakeholder, index) =>
              renderStakeholderSection(stakeholder, index, false)
            )}
          </div>
        </div>
      )}

      {/* Research Strategy */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          📋 Research Strategy
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="font-medium text-blue-700">1.</span>
            <span><strong>Start with Primary Stakeholders:</strong> Focus on {safePrimaryStakeholders.length} primary stakeholder{safePrimaryStakeholders.length !== 1 ? 's' : ''} first to validate core assumptions.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-medium text-blue-700">2.</span>
            <span><strong>Validate Core Value:</strong> Ensure your solution addresses primary stakeholder pain points before expanding research.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-medium text-blue-700">3.</span>
            <span><strong>Expand Strategically:</strong> Once primary validation is complete, research secondary stakeholders to refine your approach.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-medium text-blue-700">4.</span>
            <span><strong>Look for Patterns:</strong> Identify common themes, pain points, and feature priorities across all stakeholder groups.</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
