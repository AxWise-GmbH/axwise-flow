"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Zap, Crown, Building } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsage?: {
    analyses: number;
    prdGenerations: number;
  };
  currentLimits?: {
    analysesPerMonth: number;
    prdGenerationsPerMonth: number;
  };
  trigger?: 'limit_reached' | 'warning' | 'manual';
}

export function UpgradeModal({ 
  isOpen, 
  onClose, 
  currentUsage, 
  currentLimits,
  trigger = 'manual'
}: UpgradeModalProps) {
  const router = useRouter();

  const handleUpgrade = (tier: string) => {
    // Navigate to pricing page with the selected tier highlighted
    router.push(`/pricing?highlight=${tier}`);
    onClose();
  };

  const getModalTitle = () => {
    switch (trigger) {
      case 'limit_reached':
        return 'Analysis Limit Reached';
      case 'warning':
        return 'Almost at Your Limit';
      default:
        return 'Upgrade Your Plan';
    }
  };

  const getModalDescription = () => {
    if (trigger === 'limit_reached') {
      return `You've used all ${currentLimits?.analysesPerMonth || 3} of your monthly analyses. Upgrade to continue analyzing your customer research.`;
    }
    if (trigger === 'warning') {
      const remaining = (currentLimits?.analysesPerMonth || 3) - (currentUsage?.analyses || 0);
      return `You have ${remaining} analysis${remaining === 1 ? '' : 'es'} remaining this month. Consider upgrading for unlimited access.`;
    }
    return 'Choose a plan that fits your research needs and unlock powerful insights.';
  };

  const plans = [
    {
      name: 'Starter Pack',
      price: '€15',
      period: '/month',
      yearlyPrice: '€144',
      yearlyPeriod: '/year',
      icon: <Zap className="h-5 w-5" />,
      analyses: 20,
      prds: 'Unlimited',
      features: [
        '20 analyses per month',
        'Unlimited PRD outputs',
        'Cloud-managed with Gemini AI',
        'Email support'
      ],
      tier: 'starter',
      popular: false
    },
    {
      name: 'Pro Version',
      price: '€49',
      period: '/month',
      yearlyPrice: '€499',
      yearlyPeriod: '/year',
      icon: <Crown className="h-5 w-5" />,
      analyses: 100,
      prds: 'Unlimited',
      features: [
        '100 analyses per month',
        'Unlimited PRD outputs',
        'Priority support',
        'Advanced analytics',
        'Custom integrations'
      ],
      tier: 'pro',
      popular: true
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      yearlyPrice: 'Custom',
      yearlyPeriod: '',
      icon: <Building className="h-5 w-5" />,
      analyses: 'Unlimited',
      prds: 'Unlimited',
      features: [
        'Unlimited analyses',
        'Unlimited PRD outputs',
        'Dedicated support',
        'Custom features',
        'SLA guarantees',
        'On-premise deployment'
      ],
      tier: 'enterprise',
      popular: false
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            {getModalTitle()}
          </DialogTitle>
          <DialogDescription className="text-center text-lg">
            {getModalDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* Current Usage Display */}
        {currentUsage && currentLimits && (
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-2">Your Current Usage</h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Analyses: </span>
                <span className="font-medium">
                  {Math.max(0, currentLimits.analysesPerMonth - currentUsage.analyses)}/{currentLimits.analysesPerMonth} remaining
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">PRDs: </span>
                <span className="font-medium">Unlimited</span>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Plans */}
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.tier}
              className={`relative rounded-lg border p-6 ${
                plan.popular 
                  ? 'border-primary shadow-lg scale-105' 
                  : 'border-border'
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                  Most Popular
                </Badge>
              )}

              <div className="text-center mb-4">
                <div className="flex items-center justify-center mb-2">
                  {plan.icon}
                  <h3 className="ml-2 text-lg font-semibold">{plan.name}</h3>
                </div>
                <div className="mb-2">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                {plan.yearlyPrice !== plan.price && (
                  <div className="text-sm text-muted-foreground">
                    or {plan.yearlyPrice}{plan.yearlyPeriod}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <div className="text-center mb-3">
                  <div className="text-2xl font-bold text-primary">
                    {plan.analyses}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    analyses per month
                  </div>
                </div>
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center text-sm">
                    <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleUpgrade(plan.tier)}
                className="w-full"
                variant={plan.popular ? "default" : "outline"}
              >
                {plan.tier === 'enterprise' ? 'Contact Sales' : 'Upgrade Now'}
              </Button>
            </div>
          ))}
        </div>

        {/* Free Tier Reminder */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 dark:text-blue-400 mt-0.5">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                Free Cloud Tier Available
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Continue with 3 analyses per month on our free tier, or upgrade for more capacity and features.
              </p>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-center mt-6">
          <Button variant="ghost" onClick={onClose}>
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UpgradeModal;
