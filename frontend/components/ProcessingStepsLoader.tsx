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
import ProcessingStageCard from '@/components/loading/ProcessingStageCard';

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
  // Find the current active stage (first in_progress stage or last completed stage if no in_progress)
  const getCurrentStage = (): ProcessingStage | null => {
    const inProgressStep = steps.find(step => step.status === 'in_progress');
    if (inProgressStep) return inProgressStep.stage;
    
    // If no in_progress, find the last completed step
    const completedSteps = steps.filter(step => step.status === 'completed');
    if (completedSteps.length) {
      return completedSteps[completedSteps.length - 1].stage;
    }
    
    return null;
  };
  
  const currentStage = getCurrentStage();

  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium">Processing Progress</h3>
          <span className="text-sm font-medium">
            {Math.round(overallProgress * 100)}%
          </span>
        </div>
        <Progress 
          value={overallProgress * 100} 
          className="h-2"
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-800 dark:text-red-400 text-sm">
          <div className="flex gap-2 items-center">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {steps.map((step) => (
          <ProcessingStageCard
            key={step.stage}
            stage={step.stage}
            status={step.status}
            message={step.message}
            progress={step.progress}
            icon={stageIcons[step.stage]}
            stageName={stageNames[step.stage]}
            isCurrentStage={step.stage === currentStage}
          />
        ))}
      </div>
    </Card>
  );
};

export default ProcessingStepsLoader; 