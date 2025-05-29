'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function SubscriptionSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const sessionIdParam = searchParams.get('session_id');
    const successParam = searchParams.get('success');
    
    if (sessionIdParam) {
      setSessionId(sessionIdParam);
    }
    
    // Simulate a brief loading period to show the success state
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Processing your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl">Subscription Successful!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Thank you for subscribing to AxWise! Your payment has been processed successfully.
          </p>
          
          {sessionId && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Session ID: <code className="text-xs">{sessionId}</code>
              </p>
            </div>
          )}
          
          <div className="space-y-2">
            <p className="text-sm font-medium">What's next?</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Access your dashboard to start analyzing</li>
              <li>• Check your email for subscription details</li>
              <li>• Explore all the Pro features</li>
            </ul>
          </div>
          
          <div className="flex flex-col gap-2 pt-4">
            <Link href="/unified-dashboard">
              <Button className="w-full">
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" className="w-full">
                View Pricing Plans
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
