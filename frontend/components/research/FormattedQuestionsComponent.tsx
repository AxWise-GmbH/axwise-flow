import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Copy } from 'lucide-react';

interface Question {
  id: string;
  text: string;
  category: 'discovery' | 'validation' | 'follow_up';
  priority?: 'high' | 'medium' | 'low';
}

interface FormattedQuestionsProps {
  questions: Question[];
  onExport?: () => void;
  onContinue?: () => void;
}

const categoryConfig = {
  discovery: {
    title: '🔍 Problem Discovery Questions',
    description: 'Understand the current state and pain points',
    color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    badgeColor: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
  },
  validation: {
    title: '✅ Solution Validation Questions',
    description: 'Validate your proposed solution approach',
    color: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
    badgeColor: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'
  },
  follow_up: {
    title: '💡 Follow-up Questions',
    description: 'Deeper insights and next steps',
    color: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200',
    badgeColor: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200'
  }
};

export function FormattedQuestionsComponent({ questions, onExport, onContinue }: FormattedQuestionsProps) {
  const groupedQuestions = questions.reduce((acc, question) => {
    if (!acc[question.category]) {
      acc[question.category] = [];
    }
    acc[question.category].push(question);
    return acc;
  }, {} as Record<string, Question[]>);

  const copyAllQuestions = async () => {
    const formattedText = Object.entries(groupedQuestions)
      .map(([category, categoryQuestions]) => {
        const config = categoryConfig[category as keyof typeof categoryConfig];
        return `${config.title}\n${config.description}\n\n${categoryQuestions
          .map((q, index) => `${index + 1}. ${q.text}`)
          .join('\n')}\n`;
      })
      .join('\n---\n\n');

    try {
      await navigator.clipboard.writeText(formattedText);
      console.log('All questions copied to clipboard');
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy questions:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = formattedText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-xl lg:text-2xl font-bold text-foreground">
          📋 Your Research Questions
        </h2>
        <p className="text-sm lg:text-base text-muted-foreground">
          Structured questions to validate your business idea and understand your customers
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={copyAllQuestions}
          className="flex items-center gap-2"
        >
          <Copy className="h-4 w-4" />
          Copy All
        </Button>
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export Text
          </Button>
        )}
        {onContinue && (
          <Button
            size="sm"
            onClick={onContinue}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Continue to Analysis
          </Button>
        )}
      </div>

      {/* Question Categories */}
      <div className="space-y-4">
        {Object.entries(groupedQuestions).map(([category, categoryQuestions]) => {
          const config = categoryConfig[category as keyof typeof categoryConfig];

          return (
            <Card key={category} className={`p-4 lg:p-6 border-2 ${config.color}`}>
              <div className="space-y-4">
                {/* Category Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg lg:text-xl font-semibold">
                      {config.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {config.description}
                    </p>
                  </div>
                  <Badge className={config.badgeColor}>
                    {categoryQuestions.length} questions
                  </Badge>
                </div>

                {/* Questions List */}
                <div className="space-y-3">
                  {categoryQuestions.map((question, index) => (
                    <div
                      key={question.id}
                      className="flex gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-white/20 dark:border-gray-700/20"
                    >
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                          {index + 1}
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm lg:text-base text-gray-800 dark:text-gray-200 leading-relaxed">
                          {question.text}
                        </p>
                        {question.priority && (
                          <Badge
                            variant="secondary"
                            className="mt-2 text-xs"
                          >
                            {question.priority} priority
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center p-4 bg-muted/30 rounded-lg">
        <p className="text-sm text-muted-foreground">
          💡 <strong>Pro tip:</strong> Start with Problem Discovery questions to understand current pain points,
          then move to Solution Validation to test your approach.
        </p>
      </div>
    </div>
  );
}
