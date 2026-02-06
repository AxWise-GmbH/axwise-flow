'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/research/ChatInterface';
import { SessionManager } from '@/components/research/SessionManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Users, Plus, History } from 'lucide-react';

export default function ResearchChatPage(): JSX.Element {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Check for session parameter in URL on mount
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam) {
      console.log('Loading session from URL:', sessionParam);
      setCurrentSessionId(sessionParam);
    }
  }, [searchParams]);

  const handleQuestionsGenerated = (_questions: any) => {
    // Questions are handled within the ChatInterface component
  };

  return (
    <div className="h-full w-full relative overflow-hidden bg-background/50 backdrop-blur-sm flex flex-col">
      {/* Floating History Button */}
      <div className="absolute top-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.href = '/unified-dashboard/research-chat-history'}
          className="shadow-lg"
        >
          <History className="mr-2 h-4 w-4" />
          Chat History
        </Button>
      </div>

      <div className="absolute inset-0 w-full h-full">
        <ChatInterface
          onComplete={handleQuestionsGenerated}
          onBack={() => {
            // Navigate to research chat history instead of reloading
            window.location.href = '/unified-dashboard/research-chat-history';
          }}
          loadSessionId={currentSessionId || undefined}
        />
      </div>
    </div>
  );
}
