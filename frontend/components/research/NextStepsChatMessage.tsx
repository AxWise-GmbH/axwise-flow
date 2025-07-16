'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Target,
  Calendar,
  Users,
  TrendingUp,
  Download,
  ArrowRight,
  BarChart3,
  ExternalLink
} from 'lucide-react';

interface NextStepsChatMessageProps {
  onExportQuestions?: () => void;
  onStartResearch?: () => void;
  timeEstimate?: {
    totalQuestions: number;
    estimatedMinutes: number; // Keep as number for questionnaire page
    estimatedMinutesDisplay?: string; // String format for chat display
    breakdown: {
      baseTime: number;
      withBuffer: number;
      perQuestion: number;
    };
  };
}

export function NextStepsChatMessage({
  onExportQuestions,
  onStartResearch,
  timeEstimate
}: NextStepsChatMessageProps) {
  // Calculate realistic per-stakeholder conversation timing
  const getTimingRecommendation = () => {
    if (!timeEstimate || timeEstimate.totalQuestions === 0) {
      return "25-43 minute conversations"; // Consistent with user expectation
    }

    // Calculate per-stakeholder time (assuming questions are split between stakeholders)
    // Most interviews will be with individual stakeholders, not all questions at once
    const questionsPerStakeholder = Math.ceil(timeEstimate.totalQuestions / 2); // Rough estimate
    const baseTimePerStakeholder = questionsPerStakeholder * 2; // 2 min per question
    const maxTimePerStakeholder = questionsPerStakeholder * 4; // 4 min per question

    // Add conversation buffer (intro, transitions, follow-ups) - dynamic based on question count
    const conversationBuffer = Math.max(5, Math.ceil(questionsPerStakeholder * 0.5)); // 0.5 min buffer per question, minimum 5 min
    const recommendedMin = Math.max(10, baseTimePerStakeholder + conversationBuffer);
    const recommendedMax = Math.max(15, maxTimePerStakeholder + conversationBuffer + 3);

    return `${recommendedMin}-${recommendedMax} minute conversations`;
  };

  // Calculate realistic description for scheduling
  const getSchedulingDescription = () => {
    if (!timeEstimate || timeEstimate.totalQuestions === 0) {
      return "Keep them focused and manageable - people are more likely to participate";
    }

    const questionsPerStakeholder = Math.ceil(timeEstimate.totalQuestions / 2);
    return `Based on ~${questionsPerStakeholder} questions per stakeholder plus conversation buffer`;
  };
  return (
    <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 max-w-none">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-green-600" />
          <CardTitle className="text-lg">Next Steps</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <div className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              1
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Find 5-10 people who match your target customer</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Focus on your primary stakeholders and decision makers
              </div>
            </div>
            <Users className="h-4 w-4 text-green-600 mt-1" />
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <div className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              2
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Schedule {getTimingRecommendation()}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {getSchedulingDescription()}
              </div>
            </div>
            <Calendar className="h-4 w-4 text-blue-600 mt-1" />
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <div className="bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              3
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Use your questions and listen carefully</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Ask follow-up questions and dig deeper into their specific pain points
              </div>
            </div>
            <Target className="h-4 w-4 text-purple-600 mt-1" />
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <div className="bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              4
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Look for patterns in their responses</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Identify common themes, pain points, and feature priorities
              </div>
            </div>
            <TrendingUp className="h-4 w-4 text-orange-600 mt-1" />
          </div>

          {/* Step 5: Analysis with AxWise */}
          <div className="flex items-start gap-3 p-3 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 rounded-lg border border-teal-200 dark:border-teal-800">
            <div className="bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              5
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm text-teal-900 dark:text-teal-200">Analyze your interview data for insights</div>
              <div className="text-xs text-teal-700 dark:text-teal-300 mt-1">
                Upload your interview transcripts to AxWise for automated analysis
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                  <div className="w-1 h-1 bg-teal-400 rounded-full"></div>
                  <span>Automatically identifies themes and patterns from responses</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                  <div className="w-1 h-1 bg-teal-400 rounded-full"></div>
                  <span>Generates Product Requirement Documentation (PRD)</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                  <div className="w-1 h-1 bg-teal-400 rounded-full"></div>
                  <span>Creates user stories based on interview insights</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                  <div className="w-1 h-1 bg-teal-400 rounded-full"></div>
                  <span>Analysis completed in approximately 2 minutes</span>
                </div>
              </div>
            </div>
            <BarChart3 className="h-4 w-4 text-teal-600 mt-1" />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <div className="flex gap-3">
            {onExportQuestions && (
              <Button variant="outline" onClick={onExportQuestions} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Export Questions
              </Button>
            )}
            {onStartResearch && (
              <Button onClick={onStartResearch} className="flex-1">
                Start Research
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>

          {/* AxWise Analysis CTA */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              className="border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 hover:border-teal-300 dark:hover:border-teal-700"
              onClick={() => {
                // TODO: Add navigation to AxWise analysis page or modal
                console.log('Navigate to AxWise Analysis');
              }}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Learn about AxWise Analysis
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </div>
        </div>

        <div className="text-xs text-gray-600 dark:text-gray-400 text-center space-y-1">
          <p>Good luck with your customer research! Remember, the goal is to validate your assumptions and understand real user needs.</p>
          <p className="text-teal-600 dark:text-teal-400">
            💡 <strong>Pro tip:</strong> After completing your interviews, use AxWise to automatically transform your insights into actionable product requirements.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
