'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSubscriptionInfo, resetSubscription } from '@/lib/api/subscription';
import { toast } from 'sonner';

interface SubscriptionInfo {
  tier: string;
  status: string;
  current_period_end?: string;
  trial_end?: string;
  cancel_at_period_end?: boolean;
}

export function SubscriptionStatus() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  // Check if we're in development mode
  const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost';

  const fetchSubscriptionInfo = async () => {
    try {
      setLoading(true);
      const info = await getSubscriptionInfo();
      setSubscription(info);
    } catch (error) {
      console.error('Error fetching subscription info:', error);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setResetting(true);
      await resetSubscription();
      toast.success('Subscription reset successfully');
      await fetchSubscriptionInfo(); // Refresh the info
    } catch (error) {
      console.error('Error resetting subscription:', error);
      toast.error('Failed to reset subscription');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionInfo();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="animate-pulse">
          Loading...
        </Badge>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500 text-white';
      case 'trialing':
        return 'bg-blue-500 text-white';
      case 'canceled':
        return 'bg-red-500 text-white';
      case 'past_due':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'pro':
        return 'bg-purple-500 text-white';
      case 'starter':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {subscription ? (
        <>
          <Badge className={getTierColor(subscription.tier)}>
            {subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}
          </Badge>
          <Badge className={getStatusColor(subscription.status)}>
            {subscription.status === 'trialing' ? 'Trial' : subscription.status}
          </Badge>
          {subscription.trialEnd && (
            <span className="text-xs text-muted-foreground hidden md:block">
              Trial ends: {new Date(subscription.trialEnd).toLocaleDateString()}
            </span>
          )}
        </>
      ) : (
        <Badge variant="outline">
          Free
        </Badge>
      )}

      {/* Development mode reset button */}
      {isDevelopment && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={resetting}
          className="text-xs px-2 py-1 h-6"
        >
          {resetting ? 'Resetting...' : 'Reset'}
        </Button>
      )}
    </div>
  );
}
