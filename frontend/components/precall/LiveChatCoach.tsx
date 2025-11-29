'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Send, Loader2, Sparkles, User, Bot } from 'lucide-react';
import { 
  ChatMessage, 
  ProspectData, 
  CallIntelligence 
} from '@/lib/precall/types';
import { getStarterSuggestions } from '@/lib/precall/coachService';
import { useCoachingChat } from '@/lib/precall/hooks';

interface LiveChatCoachProps {
  prospectData: ProspectData | null;
  intelligence: CallIntelligence | null;
  chatHistory: ChatMessage[];
  onChatHistoryChange: (messages: ChatMessage[]) => void;
  /** Context about what the user is currently viewing (for context-aware responses) */
  viewContext?: string;
}

/**
 * Live coaching chat interface with optional context-awareness
 */
export function LiveChatCoach({
  prospectData,
  intelligence,
  chatHistory,
  onChatHistoryChange,
  viewContext,
}: LiveChatCoachProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const coachMutation = useCoachingChat();
  const suggestions = getStarterSuggestions(prospectData, intelligence);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim() || !prospectData) return;

    const userMessage: ChatMessage = { role: 'user', content: message.trim() };
    const newHistory = [...chatHistory, userMessage];
    onChatHistoryChange(newHistory);
    setInput('');

    const result = await coachMutation.mutateAsync({
      question: message.trim(),
      prospectData,
      intelligence,
      chatHistory,
      viewContext, // Include context about what user is viewing
    });

    if (result.success && result.response) {
      const assistantMessage: ChatMessage = { role: 'assistant', content: result.response };
      onChatHistoryChange([...newHistory, assistantMessage]);
    }
  }, [prospectData, intelligence, chatHistory, onChatHistoryChange, coachMutation, viewContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const isDisabled = !prospectData;

  return (
    <Card className="h-full flex flex-col border-0 rounded-none">
      <CardHeader className="py-2 px-3 flex-shrink-0 border-b">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-green-600" />
          Live Coach
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2 overflow-hidden p-3">
        {/* Chat Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="space-y-3 pr-2">
            {chatHistory.length === 0 && (
              <div className="text-center py-6">
                <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isDisabled 
                    ? 'Upload prospect data to start coaching'
                    : 'Ask me anything about your upcoming call!'}
                </p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-3.5 w-3.5 text-green-600" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
              </div>
            ))}
            {coachMutation.isPending && (
              <div className="flex gap-2 justify-start">
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 text-green-600 animate-spin" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggestions */}
        {chatHistory.length === 0 && !isDisabled && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-muted text-xs"
                onClick={() => handleSend(suggestion)}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {suggestion}
              </Badge>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 flex-shrink-0">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDisabled ? 'Upload prospect data first...' : 'Ask your coach...'}
            disabled={isDisabled || coachMutation.isPending}
            className="text-sm"
          />
          <Button
            size="icon"
            onClick={() => handleSend(input)}
            disabled={isDisabled || !input.trim() || coachMutation.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default LiveChatCoach;

