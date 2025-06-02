'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Target,
  Users,
  Lightbulb,
  CheckCircle,
  Download,
  FileText,
  ArrowRight
} from 'lucide-react';

interface ResearchContext {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  stage?: string;
  questionsGenerated?: boolean;
  completionPercentage?: number;
  multiStakeholderConsidered?: boolean;
  multiStakeholderDetected?: boolean;
  detectedStakeholders?: {
    primary: (string | { name: string; description: string })[];
    secondary: (string | { name: string; description: string })[];
    industry?: string;
  };
}

interface GeneratedQuestions {
  problemDiscovery?: string[];
  solutionValidation?: string[];
  followUp?: string[];
}

interface ContextPanelProps {
  context: ResearchContext;
  questions?: GeneratedQuestions;
  onExport?: () => void;
  onContinueToAnalysis?: () => void;
}

export function ContextPanel({
  context,
  questions,
  onExport,
  onContinueToAnalysis
}: ContextPanelProps) {
  const getCompletionPercentage = () => {
    let completed = 0;
    const total = 4;

    if (context.businessIdea) completed++;
    if (context.targetCustomer) completed++;
    if (context.problem) completed++;
    if (context.questionsGenerated) completed++;

    return Math.round((completed / total) * 100);
  };

  const completionPercentage = getCompletionPercentage();

  return (
    <div className="space-y-4">
      {/* Progress Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Research Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Completion</span>
              <span className="text-sm font-medium">{completionPercentage}%</span>
            </div>
            <Progress value={completionPercentage} className="h-2" />

            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className={`h-4 w-4 ${context.businessIdea ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                <span className={`text-sm ${context.businessIdea ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  Business idea defined
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className={`h-4 w-4 ${context.targetCustomer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                <span className={`text-sm ${context.targetCustomer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  Potential Target customer identified
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className={`h-4 w-4 ${context.problem ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                <span className={`text-sm ${context.problem ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  Problem understood
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className={`h-4 w-4 ${context.questionsGenerated ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                <span className={`text-sm ${context.questionsGenerated ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  Questions generated
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Context Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            Your Research Context
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={`h-4 w-4 ${context.businessIdea ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              <Badge variant="outline" className={context.businessIdea ? 'border-green-600 dark:border-green-400 text-green-600 dark:text-green-400' : ''}>
                Business idea defined
              </Badge>
            </div>
            {context.businessIdea && (
              <p className="text-sm text-muted-foreground ml-6">{context.businessIdea}</p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={`h-4 w-4 ${context.targetCustomer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              <Badge variant="outline" className={context.targetCustomer ? 'border-green-600 dark:border-green-400 text-green-600 dark:text-green-400' : ''}>
                Potential Target customer identified
              </Badge>
            </div>
            {context.targetCustomer && (
              <p className="text-sm text-muted-foreground ml-6">{context.targetCustomer}</p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={`h-4 w-4 ${context.problem ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              <Badge variant="outline" className={context.problem ? 'border-green-600 dark:border-green-400 text-green-600 dark:text-green-400' : ''}>
                Problem understood
              </Badge>
            </div>
            {context.problem && (
              <p className="text-sm text-muted-foreground ml-6">{context.problem}</p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={`h-4 w-4 ${context.questionsGenerated ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              <Badge variant="outline" className={context.questionsGenerated ? 'border-green-600 dark:border-green-400 text-green-600 dark:text-green-400' : ''}>
                Questions generated
              </Badge>
            </div>
            {context.questionsGenerated && (
              <p className="text-sm text-muted-foreground ml-6">Research questions have been generated and confirmed in chat</p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={`h-4 w-4 ${context.multiStakeholderConsidered ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              <Badge variant="outline" className={context.multiStakeholderConsidered ? 'border-green-600 dark:border-green-400 text-green-600 dark:text-green-400' : ''}>
                Multi-stakeholder approach considered
              </Badge>
            </div>
            {context.multiStakeholderConsidered && (
              <p className="text-sm text-muted-foreground ml-6">Strategic research approach for multiple user groups reviewed</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Multi-Stakeholder Detection */}
      {context.multiStakeholderDetected && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Multi-Stakeholder Opportunity
            </CardTitle>
            <CardDescription>
              Your business involves multiple user groups with different needs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {context.detectedStakeholders && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Primary Stakeholders</h4>
                  <div className="flex flex-wrap gap-1">
                    {context.detectedStakeholders.primary.map((stakeholder, index) => (
                      <Badge key={index} variant="default" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {typeof stakeholder === 'string' ? stakeholder : stakeholder.name || 'Unknown'}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Secondary Stakeholders</h4>
                  <div className="flex flex-wrap gap-1">
                    {context.detectedStakeholders.secondary.map((stakeholder, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {typeof stakeholder === 'string' ? stakeholder : stakeholder.name || 'Unknown'}
                      </Badge>
                    ))}
                  </div>
                </div>

                {context.detectedStakeholders.industry && (
                  <div>
                    <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Industry Context</h4>
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300">
                      {context.detectedStakeholders.industry}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-medium mb-2">Benefits of Multi-Stakeholder Research:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Validate assumptions across different user groups</li>
                <li>• Understand varying decision-making processes</li>
                <li>• Identify potential conflicts in requirements</li>
                <li>• Create targeted value propositions</li>
              </ul>
            </div>

            <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 p-2 rounded">
              💡 Consider a phased approach: Start with primary stakeholders, then validate with secondary users
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions Summary */}
      {questions && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
              Generated Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <Badge variant="outline" className="mb-2">Problem Discovery</Badge>
                <p className="text-sm text-muted-foreground">
                  {questions.problemDiscovery?.length || 0} questions to understand current challenges
                </p>
              </div>
              <div>
                <Badge variant="outline" className="mb-2">Solution Validation</Badge>
                <p className="text-sm text-muted-foreground">
                  {questions.solutionValidation?.length || 0} questions to validate your solution approach
                </p>
              </div>
              <div>
                <Badge variant="outline" className="mb-2">Follow-up</Badge>
                <p className="text-sm text-muted-foreground">
                  {questions.followUp?.length || 0} questions for deeper insights
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {onExport && (
                <Button variant="outline" size="sm" onClick={onExport} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              )}
              {onContinueToAnalysis && (
                <Button size="sm" onClick={onContinueToAnalysis} className="flex-1">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Continue
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
