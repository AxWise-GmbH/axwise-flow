'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InfoIcon, AlertCircle } from 'lucide-react';
import type { ProcessingStage, ProcessingStatus } from '@/components/ProcessingStepsLoader';

interface ProcessingStageCardProps {
  stage: ProcessingStage;
  status: ProcessingStatus;
  message: string;
  progress: number; // 0 to 1
  icon: React.ReactNode;
  stageName: string;
  isCurrentStage: boolean;
}

const getStatusColorClass = (status: ProcessingStatus, isCurrentStage: boolean): string => {
  switch (status) {
    case 'completed':
      return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
    case 'failed':
      return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
    case 'in_progress':
      return isCurrentStage 
        ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 shadow-md' 
        : 'bg-card border-border';
    case 'waiting':
      return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800';
    default:
      return 'bg-card border-border';
  }
};

const getStatusTextClass = (status: ProcessingStatus): string => {
  switch (status) {
    case 'completed':
      return 'text-green-700 dark:text-green-400';
    case 'failed':
      return 'text-red-700 dark:text-red-400';
    case 'in_progress':
      return 'text-blue-700 dark:text-blue-400';
    case 'waiting':
      return 'text-amber-700 dark:text-amber-400';
    default:
      return 'text-muted-foreground';
  }
};

const statusDescriptions: Record<ProcessingStatus, string> = {
  'completed': 'This stage has been successfully completed.',
  'in_progress': 'This stage is currently being processed.',
  'failed': 'This stage has encountered an error.',
  'waiting': 'This stage is waiting for previous stages to complete.',
  'pending': 'This stage has not started yet.'
};

const stageDescriptions: Record<ProcessingStage, string> = {
  'FILE_UPLOAD': 'Uploading your file to our server for processing.',
  'FILE_VALIDATION': 'Verifying file format and structure.',
  'DATA_VALIDATION': 'Validating the content of your data.',
  'PREPROCESSING': 'Preparing your data for analysis.',
  'ANALYSIS': 'Running general analysis on your interview data.',
  'THEME_EXTRACTION': 'Identifying key themes from the interviews.',
  'PATTERN_DETECTION': 'Detecting patterns across responses.',
  'SENTIMENT_ANALYSIS': 'Analyzing sentiment in the interview responses.',
  'PERSONA_FORMATION': 'Building user personas based on the data.',
  'INSIGHT_GENERATION': 'Generating insights from the analysis.',
  'COMPLETION': 'Finalizing and preparing your results.'
};

export const ProcessingStageCard: React.FC<ProcessingStageCardProps> = ({
  stage,
  status,
  message,
  progress,
  icon,
  stageName,
  isCurrentStage
}) => {
  const colorClass = getStatusColorClass(status, isCurrentStage);
  const textClass = getStatusTextClass(status);
  const showProgress = status === 'in_progress';
  
  // Content for the tooltip
  const tooltipContent = (
    <>
      <h4 className="font-medium mb-1">{stageName}</h4>
      <p className="text-sm mb-2">{stageDescriptions[stage]}</p>
      <p className="text-xs font-medium">{statusDescriptions[status]}</p>
    </>
  );

  return (
    <Card 
      className={`border ${colorClass} transition-all duration-300 ${
        isCurrentStage ? 'transform-gpu scale-[1.02]' : ''
      }`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-md ${textClass} bg-opacity-10 flex-shrink-0`}>
            {icon}
          </div>
          
          <div className="flex-grow min-w-0">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1">
                <span className="font-medium text-sm">{stageName}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="inline-flex">
                        <InfoIcon className="h-3 w-3 ml-1 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-3">
                      {tooltipContent}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              {showProgress && (
                <span className="text-xs font-medium">
                  {Math.round(progress * 100)}%
                </span>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mt-1 mb-2">{message}</p>
            
            {showProgress && (
              <Progress
                value={progress * 100}
                className="h-1"
              />
            )}
            
            {status === 'failed' && (
              <div className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3 w-3" />
                <span>Error occurred. Check console for details.</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProcessingStageCard; 