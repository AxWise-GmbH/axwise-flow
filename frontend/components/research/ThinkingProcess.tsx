'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronUp,
  Brain,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Sparkles,
  Search,
  Target,
  MessageSquare,
  FileText,
  X
} from 'lucide-react';

interface ThinkingStep {
  step: string;
  status: 'in_progress' | 'completed' | 'failed';
  details: string;
  duration_ms: number;
  timestamp: number;
}

interface ThinkingProcessProps {
  steps: ThinkingStep[];
  isExpanded?: boolean;
  className?: string;
  isVisible?: boolean;
  isLive?: boolean;
  onToggleVisibility?: () => void;
}

const stepIcons: Record<string, React.ReactNode> = {
  'Initializing Analysis': <Brain className="h-4 w-4" />,
  'Analyzing Core Context': <Search className="h-4 w-4" />,
  'Enhanced Analysis': <Sparkles className="h-4 w-4" />,
  'Generating Response': <MessageSquare className="h-4 w-4" />,
  'Generating Questions': <FileText className="h-4 w-4" />,
  'Analysis Complete': <CheckCircle2 className="h-4 w-4" />
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'in_progress':
    default:
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-50 border-green-200 text-green-800';
    case 'failed':
      return 'bg-red-50 border-red-200 text-red-800';
    case 'in_progress':
    default:
      return 'bg-blue-50 border-blue-200 text-blue-800';
  }
};

export function ThinkingProcess({
  steps,
  isExpanded = false,
  className = '',
  isVisible = true,
  isLive = false,
  onToggleVisibility
}: ThinkingProcessProps) {
  const [expanded, setExpanded] = useState(isExpanded);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!steps || steps.length === 0) {
    return null;
  }

  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const currentStep = steps.find(step => step.status === 'in_progress');
  const isComplete = completedSteps === totalSteps;

  // Auto-collapse when analysis is complete and not live
  useEffect(() => {
    if (isComplete && !isLive) {
      setIsCollapsed(true);
      setExpanded(false);
    }
  }, [isComplete, isLive]);

  // Don't render if explicitly hidden or collapsed
  if (!isVisible || isCollapsed) {
    return (
      <div className="flex items-center justify-center py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(false)}
          className="text-blue-600 hover:text-blue-700 text-xs"
        >
          <ChevronDown className="h-3 w-3 mr-1" />
          Show Analysis Details ({completedSteps}/{totalSteps} steps)
        </Button>
      </div>
    );
  }

  return (
    <Card className={`border-blue-200 bg-blue-50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">
              {isLive ? 'Analyzing...' : 'Analysis Complete'}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {completedSteps}/{totalSteps} steps
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isComplete && !isLive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCollapsed(true)}
                className="text-gray-500 hover:text-gray-700 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Hide
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-blue-600 hover:text-blue-700"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show Details
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Current step indicator */}
        {currentStep && !isComplete && (
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Currently: {currentStep.step}</span>
          </div>
        )}

        {isComplete && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-3 w-3" />
            <span>Analysis complete! Generated comprehensive insights.</span>
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${getStatusColor(step.status)}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {stepIcons[step.step] || <Target className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{step.step}</span>
                    {getStatusIcon(step.status)}
                    {step.duration_ms > 0 && (
                      <div className="flex items-center gap-1 text-xs opacity-75">
                        <Clock className="h-3 w-3" />
                        <span>{step.duration_ms}ms</span>
                      </div>
                    )}
                  </div>
                  {step.details && (
                    <p className="text-xs mt-1 opacity-90">{step.details}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Summary */}
          <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
            <div className="text-sm">
              <div className="font-medium text-blue-800 mb-2">Analysis Summary:</div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-600">Total Steps:</span>
                  <span className="ml-2 font-medium">{totalSteps}</span>
                </div>
                <div>
                  <span className="text-gray-600">Completed:</span>
                  <span className="ml-2 font-medium text-green-600">{completedSteps}</span>
                </div>
                <div>
                  <span className="text-gray-600">Total Time:</span>
                  <span className="ml-2 font-medium">
                    {steps.reduce((sum, step) => sum + step.duration_ms, 0)}ms
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Status:</span>
                  <span className={`ml-2 font-medium ${isComplete ? 'text-green-600' : 'text-blue-600'}`}>
                    {isComplete ? 'Complete' : 'Processing'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default ThinkingProcess;
