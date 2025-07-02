'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/research/ChatInterface';
import { SessionManager } from '@/components/research/SessionManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, FileText, Users, Target, ArrowRight } from 'lucide-react';

export default function CustomerResearchPage() {
  const [showChat, setShowChat] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Check for session parameter in URL on mount
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam) {
      console.log('Loading session from URL:', sessionParam);
      handleLoadSession(sessionParam);
    }
  }, [searchParams]);

  const handleQuestionsGenerated = (_questions: any) => {
    // Questions are handled within the ChatInterface component
  };

  const handleLoadSession = (sessionId: string) => {
    console.log('Page: Loading session', sessionId);
    setCurrentSessionId(sessionId);
    // Ensure we're in chat mode when loading a session
    if (!showChat) {
      setShowChat(true);
    }
  };

  if (showChat) {
    return (
      <div className="min-h-screen bg-background">
        <ChatInterface
          onComplete={handleQuestionsGenerated}
          onBack={() => setShowChat(false)}
          loadSessionId={currentSessionId || undefined}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 lg:py-12">
        {/* Hero Section */}
        <div className="text-center mb-8 lg:mb-12">
          <h1 className="text-3xl lg:text-4xl font-bold mb-4 text-foreground">
            Customer Research Helper
          </h1>
          <p className="text-lg lg:text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
            Get personalized research questions to validate your business idea.
            No research experience needed.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <Badge variant="secondary">No Experience Needed</Badge>
            <Badge variant="secondary">Custom Questions</Badge>
            <Badge variant="secondary">Ready-to-Use Templates</Badge>
            <Badge variant="secondary">5-Minute Setup</Badge>
          </div>
          <Button
            size="lg"
            onClick={() => setShowChat(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <MessageSquare className="mr-2 h-5 w-5" />
            Start Building Questions
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>

        {/* How It Works */}
        <div className="mb-8 lg:mb-12">
          <h2 className="text-2xl font-bold text-center mb-8 text-foreground">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>1. Describe Your Idea</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Tell our AI assistant about your business idea in plain English.
                  No need for formal business plans.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center mb-4">
                  <Target className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>2. Get Custom Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Receive personalized research questions tailored to your specific
                  idea and target customers.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>3. Talk to Customers</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Use the questions to have meaningful conversations with potential
                  customers and validate your idea.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Features */}
        <div className="mb-8 lg:mb-12">
          <h2 className="text-2xl font-bold text-center mb-8 text-foreground">What You'll Get</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Problem Discovery Questions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Questions to understand if the problem you're solving actually exists
                  and how people currently deal with it.
                </p>
                <div className="bg-muted p-3 rounded text-sm">
                  <strong>Example:</strong> "How do you currently handle [specific problem]?
                  What's the most frustrating part?"
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Solution Validation Questions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Questions to test if your specific solution would be valuable
                  and what people would pay for it.
                </p>
                <div className="bg-muted p-3 rounded text-sm">
                  <strong>Example:</strong> "If there was a solution like [your idea],
                  would you use it? What would you pay?"
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  Research Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Step-by-step guidance on who to talk to, how to find them,
                  and how to conduct the interviews.
                </p>
                <div className="bg-muted p-3 rounded text-sm">
                  <strong>Includes:</strong> Target personas, where to find them,
                  conversation scripts, and analysis tips.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  Export & Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Download your questions as PDF templates, email scripts,
                  and tracking sheets for your research.
                </p>
                <div className="bg-muted p-3 rounded text-sm">
                  <strong>Formats:</strong> PDF guides, email templates,
                  interview tracking sheets, analysis frameworks.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Ready to Validate Your Idea?</CardTitle>
              <CardDescription>
                Join thousands of entrepreneurs who've used customer research
                to build successful businesses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                size="lg"
                onClick={() => setShowChat(true)}
                className="bg-primary hover:bg-primary/90"
              >
                <MessageSquare className="mr-2 h-5 w-5" />
                Get Your Research Questions
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                Takes 5 minutes • No signup required • Free to use
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
