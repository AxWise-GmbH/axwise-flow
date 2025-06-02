'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  Building2,
  Car,
  Truck,
  ChevronRight,
  Info,
  ArrowRight,
  X
} from 'lucide-react';

interface StakeholderAlertProps {
  onViewPlan?: () => void;
  onDismiss?: () => void;
  onContinueWithCurrent?: () => void;
  onViewMultiStakeholder?: () => void;
}

export function StakeholderAlert({
  onViewPlan,
  onDismiss,
  onContinueWithCurrent,
  onViewMultiStakeholder
}: StakeholderAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isExpanded) {
    return (
      <Alert className="border-blue-200 bg-blue-50">
        <Info className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>
            <strong>Multiple stakeholders detected:</strong> Your business involves multiple stakeholder groups.
            Consider a multi-phase research approach for better insights.
          </span>
          <div className="flex gap-2 ml-4">
            <Button size="sm" variant="outline" onClick={() => setIsExpanded(true)}>
              Learn More
            </Button>
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Multi-Stakeholder Research Opportunity</CardTitle>
          </div>
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>
          Your business involves multiple user groups with different needs and perspectives.
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
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <div className="font-medium text-sm">End Users</div>
              <div className="text-xs text-gray-600">Primary users</div>
              <Badge variant="secondary" className="text-xs mt-1">Secondary</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <Building2 className="h-5 w-5 text-purple-600" />
            <div>
              <div className="font-medium text-sm">Business Users</div>
              <div className="text-xs text-gray-600">Enterprise users</div>
              <Badge variant="secondary" className="text-xs mt-1">Secondary</Badge>
            </div>
          </div>
        </div>

        {/* Quick Benefits */}
        <div className="bg-white p-4 rounded-lg border">
          <div className="font-medium mb-2">Why Multi-Stakeholder Research?</div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Validate primary stakeholder assumptions with actual users</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Understand different decision-making processes</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Identify potential conflicts in requirements</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>Create stakeholder-specific value propositions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Simple Approach */}
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="font-medium text-green-800 mb-2">Recommended Approach:</div>
          <div className="flex items-center gap-2 text-sm text-green-700">
            <span className="bg-green-200 text-green-800 px-2 py-1 rounded text-xs font-medium">Week 1-2</span>
            <ArrowRight className="h-3 w-3" />
            <span>Start with 5-7 primary stakeholder interviews</span>
            <ArrowRight className="h-3 w-3" />
            <span className="bg-blue-200 text-blue-800 px-2 py-1 rounded text-xs font-medium">Week 3</span>
            <ArrowRight className="h-3 w-3" />
            <span>Validate with 8-10 user interviews</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {onContinueWithCurrent && (
            <Button variant="outline" onClick={onContinueWithCurrent} className="flex-1">
              Continue with Current Questions
            </Button>
          )}
          {(onViewPlan || onViewMultiStakeholder) && (
            <Button onClick={onViewPlan || onViewMultiStakeholder} className="flex-1">
              View Multi-Stakeholder Plan
              <ChevronRight className="h-4 w-4 ml-2" />
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
