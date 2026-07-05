'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Users,
  MessageCircle,
  Target,
  ArrowRight,
  FileText
} from 'lucide-react';

interface GeneratedQuestions {
  problemDiscovery: string[];
  solutionValidation: string[];
  followUp: string[];
}

interface QuestionGenerationPanelProps {
  hasContext: boolean;
  contextCompleteness: number;
  isGenerating: boolean;
  generatedQuestions: any;
  onGenerateQuestions: () => void;
  onExportQuestions: () => void;
  onStartSimulation?: () => void;
}

export function QuestionGenerationPanel({
  hasContext,
  contextCompleteness,
  isGenerating,
  generatedQuestions,
  onGenerateQuestions,
  onExportQuestions,
  onStartSimulation
}: QuestionGenerationPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<'txt' | 'json' | 'csv'>('txt');

  const getContextStatus = () => {
    if (contextCompleteness >= 100) {
      return {
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        text: 'Ready to Generate',
        color: 'text-green-600',
        bgColor: 'bg-green-50 border-green-200'
      };
    } else if (contextCompleteness >= 66) {
      return {
        icon: <AlertCircle className="h-5 w-5 text-yellow-500" />,
        text: 'Almost Ready',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50 border-yellow-200'
      };
    } else {
      return {
        icon: <AlertCircle className="h-5 w-5 text-red-500" />,
        text: 'Need More Context',
        color: 'text-red-600',
        bgColor: 'bg-red-50 border-red-200'
      };
    }
  };

  const status = getContextStatus();

  const renderQuestionSection = (title: string, questions: string[], icon: React.ReactNode) => {
    if (!questions || questions.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
          <Badge variant="secondary">{questions.length}</Badge>
        </div>
        <div className="space-y-1">
          {questions.slice(0, 3).map((question, index) => (
            <div key={index} className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              {question}
            </div>
          ))}
          {questions.length > 3 && (
            <div className="text-xs text-muted-foreground text-center py-1">
              +{questions.length - 3} more questions
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Question Generation
        </CardTitle>
        <CardDescription>
          Generate research questions based on your business context
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Context Status */}
        <div className={`p-3 rounded-lg border ${status.bgColor}`}>
          <div className="flex items-center gap-2 mb-2">
            {status.icon}
            <span className={`font-medium ${status.color}`}>{status.text}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Context Completeness</span>
              <span className="font-medium">{contextCompleteness}%</span>
            </div>
            <Progress value={contextCompleteness} className="h-2" />
          </div>
        </div>

        {/* Generation Button */}
        <div className="space-y-3">
          <Button
            onClick={onGenerateQuestions}
            disabled={!hasContext || isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generating Questions...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Generate Research Questions
              </>
            )}
          </Button>

          {!hasContext && (
            <p className="text-xs text-muted-foreground text-center">
              Complete your research context to enable question generation
            </p>
          )}
        </div>

        {/* Generated Questions Preview */}
        {generatedQuestions && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Generated Questions</h4>
              <Badge variant="outline" className="text-green-600 border-green-200">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Ready
              </Badge>
            </div>

            <ScrollArea className="h-64">
              <div className="space-y-4 pr-4">
                {/* Primary Stakeholders */}
                {generatedQuestions.primaryStakeholders?.map((stakeholder: any, index: number) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">{stakeholder.name}</span>
                      <Badge variant="outline">Primary</Badge>
                    </div>
                    <div className="ml-6 space-y-2">
                      {renderQuestionSection(
                        'Problem Discovery',
                        stakeholder.questions?.problemDiscovery || [],
                        <Target className="h-4 w-4 text-red-500" />
                      )}
                      {renderQuestionSection(
                        'Solution Validation',
                        stakeholder.questions?.solutionValidation || [],
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </div>
                ))}

                {/* Secondary Stakeholders */}
                {generatedQuestions.secondaryStakeholders?.map((stakeholder: any, index: number) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-sm">{stakeholder.name}</span>
                      <Badge variant="outline">Secondary</Badge>
                    </div>
                    <div className="ml-6 space-y-2">
                      {renderQuestionSection(
                        'Problem Discovery',
                        stakeholder.questions?.problemDiscovery || [],
                        <Target className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Export Options */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Export Format:</span>
                <div className="flex gap-1">
                  {(['txt', 'json', 'csv'] as const).map((format) => (
                    <Button
                      key={format}
                      variant={selectedFormat === format ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedFormat(format)}
                    >
                      {format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    onClick={onExportQuestions}
                    variant="outline"
                    className="flex-1"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Questions
                  </Button>
                  <Button
                    onClick={() => window.location.href = '/unified-dashboard/upload'}
                    className="flex-1"
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Upload Interview Data
                  </Button>
                </div>

                {/* Simulation Feature */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-900">🤖 AI Interview Simulation</p>
                      <p className="text-xs text-blue-700">Generate synthetic interview responses automatically</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onStartSimulation}
                      className="text-blue-600 border-blue-300 hover:bg-blue-100"
                    >
                      Start Simulation
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Help Text */}
        {!generatedQuestions && hasContext && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
            <FileText className="h-4 w-4 inline mr-1" />
            Questions will be generated using AI based on your business context.
            This typically takes 10-30 seconds and creates stakeholder-specific research questions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
