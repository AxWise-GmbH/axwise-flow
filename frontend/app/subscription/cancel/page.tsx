'use client';

import { XCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function SubscriptionCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
            <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl">Subscription Cancelled</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your subscription process was cancelled. No payment has been processed.
          </p>
          
          <div className="space-y-2">
            <p className="text-sm font-medium">What would you like to do?</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Try a different payment method</li>
              <li>• Contact support for assistance</li>
              <li>• Explore our free Community Edition</li>
            </ul>
          </div>
          
          <div className="flex flex-col gap-2 pt-4">
            <Link href="/pricing">
              <Button className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Pricing
              </Button>
            </Link>
            <Link href="/unified-dashboard">
              <Button variant="outline" className="w-full">
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="ghost" className="w-full">
                Contact Support
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
