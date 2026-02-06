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
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-3 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Customer Research</h1>
        <p className="text-lg text-muted-foreground/80 max-w-2xl leading-relaxed">
          Develop your business idea and generate targeted questionnaires through AI-guided conversations.
        </p>
      </div>

      {/* Quick Start Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
        <Card className="cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm border-border/50 group" onClick={() => setShowChat(true)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                <MessageSquare className="h-5 w-5" />
              </div>
              Start New Research
            </CardTitle>
            <CardDescription className="text-base">
              Begin a guided conversation to develop your business idea
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mt-2">
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border-blue-200/50 dark:border-blue-800/50">Interactive</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm border-border/50 group" onClick={() => window.location.href = '/unified-dashboard/research'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 group-hover:bg-purple-500/20 transition-colors">
                <FileText className="h-5 w-5" />
              </div>
              Interview Simulation
            </CardTitle>
            <CardDescription className="text-base">
              Generate AI persona interviews from your questionnaires
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mt-2">
              <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border-purple-200/50 dark:border-purple-800/50">AI Powered</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm border-border/50 group" onClick={() => window.location.href = '/unified-dashboard/upload'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10 text-green-500 group-hover:bg-green-500/20 transition-colors">
                <Target className="h-5 w-5" />
              </div>
              Analyze Interviews
            </CardTitle>
            <CardDescription className="text-base">
              Upload and analyze existing interview data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mt-2">
              <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 border-green-200/50 dark:border-green-800/50">Analysis</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Session Manager */}
      <Card className="bg-white/40 dark:bg-slate-950/40 backdrop-blur-md border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Users className="h-6 w-6 text-muted-foreground" />
            Recent Sessions
          </CardTitle>
          <CardDescription>
            Continue your previous research conversations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionManager onLoadSession={handleLoadSession} />
        </CardContent>
      </Card>
    </div>
  );
}
