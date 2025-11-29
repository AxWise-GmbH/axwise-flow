'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
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
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const coachMutation = useCoachingChat();
  const starterSuggestions = getStarterSuggestions(prospectData, intelligence);

  // Auto-scroll to bottom when new messages arrive or suggestions change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, followUpSuggestions]);

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim() || !prospectData) return;

    const userMessage: ChatMessage = { role: 'user', content: message.trim() };
    const newHistory = [...chatHistory, userMessage];
    onChatHistoryChange(newHistory);
    setInput('');
    setFollowUpSuggestions([]); // Clear suggestions when sending

    try {
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
        // Set follow-up suggestions from the response
        if (result.suggestions && result.suggestions.length > 0) {
          setFollowUpSuggestions(result.suggestions);
        }
      } else if (!result.success) {
        // Show error as assistant message
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${result.error || 'Unknown error. Please try again.'}`
        };
        onChatHistoryChange([...newHistory, errorMessage]);
        setFollowUpSuggestions([]);
      }
    } catch (error) {
      // Handle network or unexpected errors
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Sorry, I couldn't process your request. ${error instanceof Error ? error.message : 'Please try again.'}`
      };
      onChatHistoryChange([...newHistory, errorMessage]);
      setFollowUpSuggestions([]);
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
                  <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-1">
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
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        // Headings
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                        // Paragraphs with proper spacing
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        // Lists with chat-friendly styling
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm">{children}</li>,
                        // Bold and italic
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        // Code blocks
                        code: ({ children }) => (
                          <code className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                        ),
                        // Blockquotes for emphasis
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-green-500 pl-2 my-2 italic text-muted-foreground">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
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

        {/* Starter Suggestions - shown when chat is empty */}
        {chatHistory.length === 0 && !isDisabled && (
          <div className="flex flex-wrap gap-1.5">
            {starterSuggestions.map((suggestion, i) => (
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

        {/* Follow-up Suggestions - shown after assistant response */}
        {chatHistory.length > 0 && followUpSuggestions.length > 0 && !coachMutation.isPending && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {followUpSuggestions.map((suggestion, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-green-100 hover:border-green-300 text-xs transition-colors"
                onClick={() => handleSend(suggestion)}
              >
                <Sparkles className="h-3 w-3 mr-1 text-green-600" />
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

