import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Copy, Users, Target, MessageCircle } from 'lucide-react';

interface StakeholderQuestion {
  name: string;
  description: string;
  type: 'primary' | 'secondary';
  questions: {
    discovery: string[];
    validation: string[];
    followUp: string[];
  };
}

interface StakeholderQuestionsProps {
  stakeholders: StakeholderQuestion[];
  businessContext?: string;
  onExport?: () => void;
  onContinue?: () => void;
}

export function StakeholderQuestionsComponent({ 
  stakeholders, 
  businessContext, 
  onExport, 
  onContinue 
}: StakeholderQuestionsProps) {
  const primaryStakeholders = stakeholders.filter(s => s.type === 'primary');
  const secondaryStakeholders = stakeholders.filter(s => s.type === 'secondary');

  const copyAllQuestions = async () => {
    const formattedText = stakeholders.map(stakeholder => {
      return `${stakeholder.name}\n${stakeholder.description}\n\nProblem Discovery:\n${stakeholder.questions.discovery.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nSolution Validation:\n${stakeholder.questions.validation.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nFollow-up:\n${stakeholder.questions.followUp.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`;
    }).join('\n---\n\n');
    
    try {
      await navigator.clipboard.writeText(formattedText);
      console.log('All stakeholder questions copied to clipboard');
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

  const categoryConfig = {
    discovery: {
      title: '🔍 Problem Discovery',
      description: 'Understand current challenges and pain points',
      color: 'bg-blue-50 border-blue-200',
      badgeColor: 'bg-blue-100 text-blue-800'
    },
    validation: {
      title: '✅ Solution Validation', 
      description: 'Validate your proposed solution approach',
      color: 'bg-green-50 border-green-200',
      badgeColor: 'bg-green-100 text-green-800'
    },
    followUp: {
      title: '💡 Follow-up Questions',
      description: 'Deeper insights and next steps',
      color: 'bg-purple-50 border-purple-200',
      badgeColor: 'bg-purple-100 text-purple-800'
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">Multi-Stakeholder Research Questions</h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          Tailored questions for each stakeholder group in your business ecosystem. 
          Start with primary stakeholders to validate core assumptions.
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

      {/* Primary Stakeholders */}
      {primaryStakeholders.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold">Primary Stakeholders</h3>
            <Badge variant="default" className="text-xs">High Priority</Badge>
          </div>
          
          {primaryStakeholders.map((stakeholder, stakeholderIndex) => (
            <Card key={stakeholderIndex} className="border-green-200 bg-green-50">
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-green-900">{stakeholder.name}</h4>
                  <p className="text-sm text-green-700">{stakeholder.description}</p>
                </div>
                
                {Object.entries(stakeholder.questions).map(([category, questions]) => {
                  const config = categoryConfig[category as keyof typeof categoryConfig];
                  return (
                    <div key={category} className={`p-3 rounded-lg border ${config.color}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`text-xs ${config.badgeColor}`}>
                          {config.title}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{config.description}</p>
                      <div className="space-y-1">
                        {questions.map((question, qIndex) => (
                          <div key={qIndex} className="text-sm">
                            <span className="font-medium text-muted-foreground">{qIndex + 1}.</span>
                            <span className="ml-2">{question}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Secondary Stakeholders */}
      {secondaryStakeholders.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-600" />
            <h3 className="text-lg font-semibold">Secondary Stakeholders</h3>
            <Badge variant="secondary" className="text-xs">Medium Priority</Badge>
          </div>
          
          {secondaryStakeholders.map((stakeholder, stakeholderIndex) => (
            <Card key={stakeholderIndex} className="border-orange-200 bg-orange-50">
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-orange-900">{stakeholder.name}</h4>
                  <p className="text-sm text-orange-700">{stakeholder.description}</p>
                </div>
                
                {Object.entries(stakeholder.questions).map(([category, questions]) => {
                  const config = categoryConfig[category as keyof typeof categoryConfig];
                  return (
                    <div key={category} className={`p-3 rounded-lg border ${config.color}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`text-xs ${config.badgeColor}`}>
                          {config.title}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{config.description}</p>
                      <div className="space-y-1">
                        {questions.map((question, qIndex) => (
                          <div key={qIndex} className="text-sm">
                            <span className="font-medium text-muted-foreground">{qIndex + 1}.</span>
                            <span className="ml-2">{question}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Research Strategy */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-purple-900">Research Strategy</h3>
          </div>
          
          <div className="space-y-2 text-sm text-purple-800">
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-medium">1.</span>
              <p><strong>Start with Primary:</strong> Focus on {primaryStakeholders.length} primary stakeholder{primaryStakeholders.length !== 1 ? 's' : ''} first to validate core assumptions.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-medium">2.</span>
              <p><strong>Validate Core Value:</strong> Ensure your solution addresses primary stakeholder pain points before expanding.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-medium">3.</span>
              <p><strong>Expand Strategically:</strong> Research secondary stakeholders to refine your approach after primary validation.</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
