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
    <Card className="h-full flex flex-col border-0 rounded-none bg-transparent shadow-none">
      <CardHeader className="py-2 px-3 flex-shrink-0 border-b border-border/50">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
          Live Coach
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2 overflow-hidden p-3">
        {/* Chat Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="space-y-4 pr-2">
            {chatHistory.length === 0 && (
              <div className="text-center py-8">
                <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <Bot className="h-6 w-6 text-green-600 dark:text-green-500" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  {isDisabled
                    ? 'Upload prospect data to start coaching'
                    : 'Ask me anything about your upcoming call!'}
                </p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 border border-green-200/50 dark:border-green-800/50 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                    <Bot className="h-4 w-4 text-green-700 dark:text-green-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-border/50 rounded-tl-none'
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
                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                        // Lists with chat-friendly styling
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm">{children}</li>,
                        // Bold and italic
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        // Code blocks
                        code: ({ children }) => (
                          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono border border-border/50">{children}</code>
                        ),
                        // Blockquotes for emphasis
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-green-500 pl-3 my-2 italic text-muted-foreground bg-green-50/50 dark:bg-green-900/10 py-1 pr-2 rounded-r">
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
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
            {coachMutation.isPending && (
              <div className="flex gap-3 justify-start">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-green-600 dark:text-green-500 animate-spin" />
                </div>
                <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-lg px-4 py-3 text-sm text-muted-foreground border border-border/50">
                  Thinking...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Starter Suggestions - shown when chat is empty */}
        {chatHistory.length === 0 && !isDisabled && (
          <div className="flex flex-wrap gap-2 justify-center">
            {starterSuggestions.map((suggestion, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-700 dark:hover:text-green-300 hover:border-green-200 dark:hover:border-green-800 text-xs py-1.5 px-3 transition-all bg-white/50 dark:bg-slate-950/50 border-border/50"
                onClick={() => handleSend(suggestion)}
              >
                <Sparkles className="h-3 w-3 mr-1.5 text-green-600 dark:text-green-500" />
                {suggestion}
              </Badge>
            ))}
          </div>
        )}

        {/* Follow-up Suggestions - shown after assistant response */}
        {chatHistory.length > 0 && followUpSuggestions.length > 0 && !coachMutation.isPending && (
          <div className="flex flex-wrap gap-2 pt-2 pb-1">
            {followUpSuggestions.map((suggestion, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-700 dark:hover:text-green-300 hover:border-green-200 dark:hover:border-green-800 text-xs py-1 px-2.5 transition-all bg-white/50 dark:bg-slate-950/50 border-border/50"
                onClick={() => handleSend(suggestion)}
              >
                <Sparkles className="h-3 w-3 mr-1.5 text-green-600 dark:text-green-500" />
                {suggestion}
              </Badge>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 flex-shrink-0 bg-white/30 dark:bg-slate-950/30 backdrop-blur-sm p-1 rounded-lg border border-border/50">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDisabled ? 'Upload prospect data first...' : 'Ask your coach...'}
            disabled={isDisabled || coachMutation.isPending}
            className="text-sm border-0 bg-transparent focus-visible:ring-0 shadow-none"
          />
          <Button
            size="icon"
            onClick={() => handleSend(input)}
            disabled={isDisabled || !input.trim() || coachMutation.isPending}
            className="h-9 w-9 shadow-sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default LiveChatCoach;

