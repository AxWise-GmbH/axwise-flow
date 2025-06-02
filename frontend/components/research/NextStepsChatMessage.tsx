'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Target,
  Calendar,
  Users,
  TrendingUp,
  Download,
  ArrowRight
} from 'lucide-react';

interface NextStepsChatMessageProps {
  onExportQuestions?: () => void;
  onStartResearch?: () => void;
}

export function NextStepsChatMessage({
  onExportQuestions,
  onStartResearch
}: NextStepsChatMessageProps) {
  return (
    <Card className="border-green-200 bg-green-50 max-w-none">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-green-600" />
          <CardTitle className="text-lg">Next Steps</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-white rounded-lg border">
            <div className="bg-green-100 text-green-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              1
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Find 5-10 people who match your target customer</div>
              <div className="text-xs text-gray-600 mt-1">
                Focus on your primary stakeholders and decision makers
              </div>
            </div>
            <Users className="h-4 w-4 text-green-600 mt-1" />
          </div>

          <div className="flex items-start gap-3 p-3 bg-white rounded-lg border">
            <div className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              2
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Schedule 15-20 minute conversations</div>
              <div className="text-xs text-gray-600 mt-1">
                Keep them short and focused - people are more likely to participate
              </div>
            </div>
            <Calendar className="h-4 w-4 text-blue-600 mt-1" />
          </div>

          <div className="flex items-start gap-3 p-3 bg-white rounded-lg border">
            <div className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              3
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Use your questions and listen carefully</div>
              <div className="text-xs text-gray-600 mt-1">
                Ask follow-up questions and dig deeper into their specific pain points
              </div>
            </div>
            <Target className="h-4 w-4 text-purple-600 mt-1" />
          </div>

          <div className="flex items-start gap-3 p-3 bg-white rounded-lg border">
            <div className="bg-orange-100 text-orange-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
              4
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Look for patterns in their responses</div>
              <div className="text-xs text-gray-600 mt-1">
                Identify common themes, pain points, and feature priorities
              </div>
            </div>
            <TrendingUp className="h-4 w-4 text-orange-600 mt-1" />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
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

        <div className="text-xs text-gray-600 text-center">
          Good luck with your customer research! Remember, the goal is to validate your assumptions and understand real user needs.
        </div>
      </CardContent>
    </Card>
  );
}
