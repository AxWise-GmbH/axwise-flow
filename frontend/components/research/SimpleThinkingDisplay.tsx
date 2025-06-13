'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle
} from 'lucide-react';

interface ThinkingStep {
  step: string;
  status: 'in_progress' | 'completed' | 'failed';
  details: string;
  duration_ms: number;
  timestamp: number;
}

interface SimpleThinkingDisplayProps {
  steps: ThinkingStep[];
  className?: string;
  onHide?: () => void;
}

export function SimpleThinkingDisplay({ 
  steps, 
  className = '',
  onHide 
}: SimpleThinkingDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!steps || steps.length === 0) {
    return null;
  }

  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const failedSteps = steps.filter(step => step.status === 'failed').length;
  const totalSteps = steps.length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-600" />;
      default:
        return <Clock className="h-3 w-3 text-blue-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  return (
    <Card className={`border-blue-200 bg-blue-50 mb-4 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Analysis Complete</CardTitle>
            <Badge variant="outline" className="text-xs">
              {completedSteps}/{totalSteps} steps
            </Badge>
            {failedSteps > 0 && (
              <Badge variant="destructive" className="text-xs">
                {failedSteps} failed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onHide && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onHide}
                className="text-gray-500 hover:text-gray-700 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Hide
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-600 hover:text-blue-700"
            >
              {isExpanded ? (
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

        {/* Summary */}
        <div className="flex items-center gap-2 text-sm text-green-700 mt-2">
          <CheckCircle2 className="h-3 w-3" />
          <span>Analysis completed successfully!</span>
          <span className="text-xs opacity-75">
            ({steps.reduce((sum, step) => sum + step.duration_ms, 0)}ms total)
          </span>
        </div>
      </CardHeader>

      {/* Detailed steps */}
      {isExpanded && (
        <CardContent className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${getStatusColor(step.status)}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {getStatusIcon(step.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{step.step}</span>
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

          {/* Summary stats */}
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
                  <span className="ml-2 font-medium text-green-600">Complete</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default SimpleThinkingDisplay;
