'use client';

import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileUp, 
  FileCheck, 
  Database, 
  BarChart3, 
  Sparkles, 
  Brain, 
  User2
} from 'lucide-react';

// Processing stage types and statuses
export type ProcessingStage = 
  | 'FILE_UPLOAD'
  | 'FILE_VALIDATION'
  | 'DATA_VALIDATION'
  | 'PREPROCESSING'
  | 'ANALYSIS'
  | 'THEME_EXTRACTION'
  | 'PATTERN_DETECTION'
  | 'SENTIMENT_ANALYSIS'
  | 'PERSONA_FORMATION'
  | 'INSIGHT_GENERATION'
  | 'COMPLETION';

export type ProcessingStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'waiting';

export interface ProcessingStep {
  stage: ProcessingStage;
  status: ProcessingStatus;
  message: string;
  progress: number; // 0 to 1
}

interface ProcessingStepsLoaderProps {
  steps: ProcessingStep[];
  overallProgress: number; // 0 to 1
  error?: string;
  className?: string;
}

// Icons for each processing stage
const stageIcons: Record<ProcessingStage, React.ReactNode> = {
  FILE_UPLOAD: <FileUp size={18} />,
  FILE_VALIDATION: <FileCheck size={18} />,
  DATA_VALIDATION: <Database size={18} />,
  PREPROCESSING: <Database size={18} />,
  ANALYSIS: <BarChart3 size={18} />,
  THEME_EXTRACTION: <Sparkles size={18} />,
  PATTERN_DETECTION: <Brain size={18} />,
  SENTIMENT_ANALYSIS: <BarChart3 size={18} />,
  PERSONA_FORMATION: <User2 size={18} />,
  INSIGHT_GENERATION: <Sparkles size={18} />,
  COMPLETION: <CheckCircle2 size={18} />
};

// Human-readable names for each stage
const stageNames: Record<ProcessingStage, string> = {
  FILE_UPLOAD: 'File Upload',
  FILE_VALIDATION: 'File Validation',
  DATA_VALIDATION: 'Data Validation',
  PREPROCESSING: 'Data Preprocessing',
  ANALYSIS: 'Analysis',
  THEME_EXTRACTION: 'Theme Extraction',
  PATTERN_DETECTION: 'Pattern Detection',
  SENTIMENT_ANALYSIS: 'Sentiment Analysis',
  PERSONA_FORMATION: 'Persona Formation',
  INSIGHT_GENERATION: 'Insight Generation',
  COMPLETION: 'Completion'
};

export const ProcessingStepsLoader: React.FC<ProcessingStepsLoaderProps> = ({
  steps,
  overallProgress,
  error,
  className = ''
}) => {
  // Function to get the status icon based on the step status
  const getStatusIcon = (status: ProcessingStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="text-green-500" size={16} />;
      case 'in_progress':
        return (
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        );
      case 'failed':
        return <AlertCircle className="text-red-500" size={16} />;
      case 'waiting':
        return <Clock className="text-amber-500" size={16} />;
      case 'pending':
      default:
        return <div className="w-4 h-4 rounded-full border border-gray-300" />;
    }
  };

  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium">Processing Progress</h3>
          <span className="text-sm text-muted-foreground">
            {Math.round(overallProgress * 100)}%
          </span>
        </div>
        <Progress value={overallProgress * 100} className="h-2" />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-200 rounded-md text-red-800 text-sm">
          <div className="flex gap-2 items-center">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.stage} className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {getStatusIcon(step.status)}
            </div>
            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-muted rounded-md">
              {stageIcons[step.stage]}
            </div>
            <div className="flex-grow min-w-0">
              <div className="flex justify-between items-center">
                <div className="font-medium text-sm truncate">{stageNames[step.stage]}</div>
                {step.status === 'in_progress' && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(step.progress * 100)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{step.message}</p>
              {step.status === 'in_progress' && (
                <Progress 
                  value={step.progress * 100} 
                  className="h-1 mt-1" 
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default ProcessingStepsLoader; 