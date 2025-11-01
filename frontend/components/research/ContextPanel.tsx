'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Target,
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
  industry?: string;
  location?: string;
  narrative?: string;
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
  debugPrompt?: string;
}

export function ContextPanel({
  context,
  questions,
  onExport,
  onContinueToAnalysis,
  debugPrompt
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
  // Humanized, consultant-style descriptions for sidebar
  const ensureSentence = (s?: string) => (s ? (/([.!?])$/.test(s.trim()) ? s.trim() : `${s.trim()}.`) : '');
  const niceStage = (s?: string) => {
    switch ((s || '').toLowerCase()) {
      case 'in_progress': return 'In progress';
      case 'completed': return 'Completed';
      case 'validation': return 'Validation';
      case 'analysis': return 'Analysis';
      case 'initial': return 'Initial';
      default: return s || '';
    }
  };
  const describeBusinessIdea = (bi?: string) => bi ? ensureSentence(bi) : '';
  const describeTargetCustomer = (tc?: string) => tc ? ensureSentence(`Primary target customers are ${tc}`) : '';
  const describeProblem = (p?: string) => p ? ensureSentence(`They are struggling with ${p}`) : '';
  const describeIndustry = (i?: string) => (i && i !== 'general') ? ensureSentence(`They operate in the ${i} industry`) : '';
  const describeLocation = (loc?: string) => loc ? ensureSentence(`Operating primarily in ${loc}`) : '';
  const describeStage = (s?: string) => (s && s !== 'initial') ? ensureSentence(`Current research stage: ${niceStage(s)}`) : '';

  return (
    <div className="space-y-4">
      {/* Executive Summary (LLM-generated) */}
      {context.narrative && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Executive summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{context.narrative}</p>
          </CardContent>
        </Card>
      )}

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

            <div className="space-y-3 mt-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`h-4 w-4 ${context.businessIdea ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${context.businessIdea ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Business idea defined
                  </span>
                </div>
                {context.businessIdea && (
                  <p className="text-xs text-muted-foreground ml-6 bg-muted/50 p-2 rounded">{describeBusinessIdea(context.businessIdea)}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`h-4 w-4 ${context.targetCustomer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${context.targetCustomer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Target customer identified
                  </span>
                </div>
                {context.targetCustomer && (
                  <p className="text-xs text-muted-foreground ml-6 bg-muted/50 p-2 rounded">{describeTargetCustomer(context.targetCustomer)}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`h-4 w-4 ${context.problem ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${context.problem ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Problem understood
                  </span>
                </div>
                {context.problem && (
                  <p className="text-xs text-muted-foreground ml-6 bg-muted/50 p-2 rounded">{describeProblem(context.problem)}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`h-4 w-4 ${(context.industry && context.industry !== 'general') ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${(context.industry && context.industry !== 'general') ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Industry
                  </span>
                </div>
                {(context.industry && context.industry !== 'general') && (
                  <p className="text-xs text-muted-foreground ml-6 bg-muted/50 p-2 rounded">{describeIndustry(context.industry)}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`h-4 w-4 ${context.location ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${context.location ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Location/Region
                  </span>
                </div>
                {context.location && (
                  <p className="text-xs text-muted-foreground ml-6 bg-muted/50 p-2 rounded">{describeLocation(context.location)}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`h-4 w-4 ${(context.stage && context.stage !== 'initial') ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${(context.stage && context.stage !== 'initial') ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Research stage
                  </span>
                </div>
                {(context.stage && context.stage !== 'initial') && (
                  <p className="text-xs text-muted-foreground ml-6 bg-muted/50 p-2 rounded">{describeStage(context.stage)}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`h-4 w-4 ${context.questionsGenerated ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${context.questionsGenerated ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Questions generated
                  </span>
                </div>
                {context.questionsGenerated && (
                  <p className="text-xs text-muted-foreground ml-6 bg-muted/50 p-2 rounded">Research questions have been generated and confirmed in chat</p>
                )}
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

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
      {/* Original LLM Prompt (Debug) */}
      {debugPrompt && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Original prompt (debug)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="text-sm text-muted-foreground cursor-pointer">Show prompt</summary>
              <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">{debugPrompt}</pre>
            </details>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
