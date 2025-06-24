import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Target, Lightbulb, ArrowRight } from 'lucide-react';

interface Stakeholder {
  name: string;
  type: 'primary' | 'secondary';
  description: string;
  priority: number;
}

interface EnhancedMultiStakeholderProps {
  industry?: string;
  stakeholders: Stakeholder[];
  businessContext?: string;
  onContinueWithCurrent?: () => void;
  onViewDetailedPlan?: () => void;
}

const industryConfig = {
  automotive: {
    icon: '🚗',
    name: 'Automotive Industry',
    description: 'Vehicle sales and service ecosystem'
  },
  fintech: {
    icon: '💳',
    name: 'Financial Technology',
    description: 'Digital financial services'
  },
  healthcare: {
    icon: '🏥',
    name: 'Healthcare',
    description: 'Medical and wellness services'
  },
  saas: {
    icon: '💻',
    name: 'B2B SaaS',
    description: 'Business software solutions'
  },
  marketplace: {
    icon: '🛒',
    name: 'Marketplace',
    description: 'Multi-sided platform business'
  },
  default: {
    icon: '🏢',
    name: 'Business',
    description: 'Multi-stakeholder business'
  }
};

export function EnhancedMultiStakeholderComponent({
  industry = 'default',
  stakeholders,
  businessContext,
  onContinueWithCurrent,
  onViewDetailedPlan
}: EnhancedMultiStakeholderProps) {
  const config = industryConfig[industry as keyof typeof industryConfig] || industryConfig.default;
  const primaryStakeholders = stakeholders.filter(s => s.type === 'primary');
  const secondaryStakeholders = stakeholders.filter(s => s.type === 'secondary');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl">{config.icon}</span>
          <h2 className="text-xl lg:text-2xl font-bold text-foreground">
            Multi-Stakeholder Analysis
          </h2>
        </div>
        <div className="space-y-1">
          <Badge variant="secondary" className="text-sm">
            {config.name}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>
      </div>

      {/* Business Context */}
      {businessContext && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-blue-900 mb-1">Business Context</h3>
              <p className="text-sm text-blue-800">{businessContext}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Primary Stakeholders */}
      <Card className="p-4 lg:p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Primary Stakeholders</h3>
            <Badge className="bg-primary/10 text-primary">
              Focus First
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            These are your main decision-makers and users. Start your research here to validate core assumptions.
          </p>

          <div className="grid gap-3">
            {primaryStakeholders.map((stakeholder, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20"
              >
                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {index + 1}
                  </span>
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-foreground">{stakeholder.name}</h4>
                  <p className="text-sm text-muted-foreground">{stakeholder.description}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  High Priority
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Secondary Stakeholders */}
      {secondaryStakeholders.length > 0 && (
        <Card className="p-4 lg:p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg font-semibold">Secondary Stakeholders</h3>
              <Badge variant="secondary">
                Research Later
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              Important influencers and users. Research these after validating your primary assumptions.
            </p>

            <div className="grid gap-3">
              {secondaryStakeholders.map((stakeholder, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800"
                >
                  <div className="w-8 h-8 bg-orange-200 dark:bg-orange-800 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-200">
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{stakeholder.name}</h4>
                    <p className="text-sm text-muted-foreground">{stakeholder.description}</p>
                  </div>
                  <Badge variant="outline" className="text-xs border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300">
                    Medium Priority
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Recommendations */}
      <Card className="p-4 lg:p-6 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border-purple-200 dark:border-purple-800">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-200">Research Strategy</h3>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-medium">1.</span>
              <p className="text-purple-800 dark:text-purple-200">
                <strong>Start with Primary Stakeholders:</strong> Focus on {primaryStakeholders.length} primary stakeholder{primaryStakeholders.length !== 1 ? 's' : ''} first to validate core business assumptions.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-medium">2.</span>
              <p className="text-purple-800 dark:text-purple-200">
                <strong>Validate Core Value:</strong> Ensure your solution addresses primary stakeholder pain points before expanding research.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-medium">3.</span>
              <p className="text-purple-800 dark:text-purple-200">
                <strong>Expand Strategically:</strong> Once primary validation is complete, research secondary stakeholders to refine your approach.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onContinueWithCurrent && (
          <Button
            onClick={onContinueWithCurrent}
            className="flex items-center gap-2"
          >
            <ArrowRight className="h-4 w-4" />
            View Stakeholder-Specific Questions
          </Button>
        )}
        {onViewDetailedPlan && (
          <Button
            variant="outline"
            onClick={onViewDetailedPlan}
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            View Complete Multi-Stakeholder Plan
          </Button>
        )}
      </div>
    </div>
  );
}
