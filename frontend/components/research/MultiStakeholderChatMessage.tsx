'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Building2,
  Car,
  Truck,
  ArrowRight,
  CheckCircle
} from 'lucide-react';

interface MultiStakeholderChatMessageProps {
  onContinueWithCurrent?: () => void;
  onViewDetailedPlan?: () => void;
}

export function MultiStakeholderChatMessage({
  onContinueWithCurrent,
  onViewDetailedPlan
}: MultiStakeholderChatMessageProps) {
  return (
    <Card className="border-blue-200 bg-blue-50 max-w-none">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Multi-Stakeholder Research Opportunity</CardTitle>
        </div>
        <CardDescription>
          Your Service Cam API feature involves multiple user groups with different needs and perspectives.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stakeholder Groups */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <Building2 className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium text-sm">Primary Stakeholders</div>
              <div className="text-xs text-gray-600">Decision makers</div>
              <Badge variant="default" className="text-xs mt-1">Primary</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <Car className="h-5 w-5 text-blue-600" />
            <div>
              <div className="font-medium text-sm">Car Owners</div>
              <div className="text-xs text-gray-600">End users</div>
              <Badge variant="secondary" className="text-xs mt-1">Secondary</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <Truck className="h-5 w-5 text-purple-600" />
            <div>
              <div className="font-medium text-sm">Fleet Managers</div>
              <div className="text-xs text-gray-600">B2B users</div>
              <Badge variant="secondary" className="text-xs mt-1">Secondary</Badge>
            </div>
          </div>
        </div>

        {/* Why Multi-Stakeholder Research */}
        <div className="bg-white p-4 rounded-lg border">
          <div className="font-medium mb-2">Why Multi-Stakeholder Research?</div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>Validate primary stakeholder assumptions with actual users</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-blue-500" />
                <span>Understand different decision-making processes</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-purple-500" />
                <span>Identify potential conflicts in requirements</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-orange-500" />
                <span>Create stakeholder-specific value propositions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recommended Approach */}
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="font-medium text-green-800 mb-3">📋 Complete Research Plan Available:</div>
          <div className="space-y-2 text-sm text-green-700">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span><strong>40+ specific research questions</strong> for each stakeholder group</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span><strong>Phased approach</strong> starting with primary stakeholders</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span><strong>Ready-to-use questionnaire</strong> with problem discovery & solution validation</span>
            </div>
          </div>
        </div>

        {/* Primary Objective Emphasis */}
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="font-medium text-yellow-800 mb-2">⚠️ Remember: Primary Objective First</div>
          <div className="text-sm text-yellow-700">
            Start with primary stakeholder research to validate your core assumptions, then expand to secondary stakeholders to refine your approach.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {onContinueWithCurrent && (
            <Button variant="outline" onClick={onContinueWithCurrent} className="flex-1">
              Continue with Current Questions
            </Button>
          )}
          {onViewDetailedPlan && (
            <Button onClick={onViewDetailedPlan} className="flex-1">
              Get Complete Questionnaire (40+ Questions)
            </Button>
          )}
        </div>

        <div className="text-xs text-gray-600 text-center">
          You can always come back to explore the multi-stakeholder approach later
        </div>
      </CardContent>
    </Card>
  );
}
