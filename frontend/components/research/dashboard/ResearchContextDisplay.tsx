'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Target, 
  Users, 
  Lightbulb, 
  CheckCircle2, 
  AlertCircle,
  Clock
} from 'lucide-react';

interface ResearchContext {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  stage?: string;
  questionsGenerated?: boolean;
  multiStakeholderConsidered?: boolean;
  multiStakeholderDetected?: boolean;
  detectedStakeholders?: {
    primary: string[];
    secondary: string[];
    industry?: string;
  };
}

interface ResearchContextDisplayProps {
  context: ResearchContext;
  completeness: number;
}

export function ResearchContextDisplay({ context, completeness }: ResearchContextDisplayProps) {
  const getStageColor = (stage?: string) => {
    switch (stage) {
      case 'initial': return 'bg-gray-100 text-gray-800';
      case 'business_idea': return 'bg-blue-100 text-blue-800';
      case 'target_customer': return 'bg-yellow-100 text-yellow-800';
      case 'problem_validation': return 'bg-orange-100 text-orange-800';
      case 'solution_validation': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getProgressColor = (completeness: number) => {
    if (completeness >= 100) return 'bg-green-500';
    if (completeness >= 66) return 'bg-yellow-500';
    if (completeness >= 33) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Research Context</CardTitle>
            <CardDescription>
              Current business research information
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStageColor(context.stage)}>
              {context.stage?.replace('_', ' ') || 'Not Started'}
            </Badge>
            {completeness >= 100 ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Clock className="h-5 w-5 text-orange-500" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Context Completeness</span>
            <span className="font-medium">{completeness}%</span>
          </div>
          <Progress 
            value={completeness} 
            className="h-2"
            style={{
              background: 'var(--muted)',
            }}
          />
        </div>

        {/* Context Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Business Idea */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Business Idea</span>
              {context.businessIdea ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md min-h-[60px]">
              {context.businessIdea || 'Not defined yet'}
            </div>
          </div>

          {/* Target Customer */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Target Customer</span>
              {context.targetCustomer ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md min-h-[60px]">
              {context.targetCustomer || 'Not defined yet'}
            </div>
          </div>

          {/* Problem */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Problem</span>
              {context.problem ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md min-h-[60px]">
              {context.problem || 'Not defined yet'}
            </div>
          </div>
        </div>

        {/* Stakeholder Information */}
        {context.detectedStakeholders && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Detected Stakeholders</span>
              <Badge variant="secondary">
                {context.detectedStakeholders.industry || 'General'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {context.detectedStakeholders.primary?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Primary</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {context.detectedStakeholders.primary.map((stakeholder, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {typeof stakeholder === 'string' ? stakeholder : stakeholder.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {context.detectedStakeholders.secondary?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Secondary</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {context.detectedStakeholders.secondary.map((stakeholder, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {typeof stakeholder === 'string' ? stakeholder : stakeholder.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
