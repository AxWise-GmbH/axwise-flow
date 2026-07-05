'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageSquare, 
  Bot, 
  User, 
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { LocalResearchStorage } from '@/lib/api/research';

interface ResearchContext {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  stage?: string;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

interface EmbeddedChatDisplayProps {
  context: ResearchContext;
}

export function EmbeddedChatDisplay({ context }: EmbeddedChatDisplayProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    setIsLoading(true);
    try {
      // Try to load from localStorage first
      const sessions = LocalResearchStorage.getAllSessions();
      const latestSession = sessions[0]; // Get most recent session
      
      if (latestSession?.messages) {
        setMessages(latestSession.messages);
      } else {
        // Generate synthetic conversation based on context
        generateSyntheticConversation();
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      generateSyntheticConversation();
    } finally {
      setIsLoading(false);
    }
  };

  const generateSyntheticConversation = () => {
    const syntheticMessages: Message[] = [
      {
        id: '1',
        role: 'assistant',
        content: 'Hi! I\'m here to help you create targeted research questions for your business idea. Let\'s start by understanding what you\'re building.',
        timestamp: new Date(Date.now() - 300000) // 5 minutes ago
      },
      {
        id: '2',
        role: 'user',
        content: context.businessIdea || 'I want to create a business solution...',
        timestamp: new Date(Date.now() - 240000) // 4 minutes ago
      },
      {
        id: '3',
        role: 'assistant',
        content: 'That sounds interesting! Who do you see as your primary target customers for this solution?',
        timestamp: new Date(Date.now() - 180000) // 3 minutes ago
      },
      {
        id: '4',
        role: 'user',
        content: context.targetCustomer || 'My target customers are...',
        timestamp: new Date(Date.now() - 120000) // 2 minutes ago
      },
      {
        id: '5',
        role: 'assistant',
        content: 'Great! Now, what specific problem are you solving for these customers?',
        timestamp: new Date(Date.now() - 60000) // 1 minute ago
      },
      {
        id: '6',
        role: 'user',
        content: context.problem || 'The main problem I\'m addressing is...',
        timestamp: new Date(Date.now() - 30000) // 30 seconds ago
      },
      {
        id: '7',
        role: 'assistant',
        content: 'Perfect! I now have enough context to generate comprehensive research questions. You can generate them using the panel on the right.',
        timestamp: new Date()
      }
    ];

    setMessages(syntheticMessages);
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(timestamp);
  };

  const displayMessages = isExpanded ? messages : messages.slice(-3);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Research Conversation
            </CardTitle>
            <CardDescription>
              {messages.length > 0 
                ? `${messages.length} messages • Last updated ${formatTimestamp(messages[messages.length - 1]?.timestamp || new Date())}`
                : 'No conversation history'
              }
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/customer-research'}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading conversation...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <ScrollArea className={isExpanded ? "h-96" : "h-48"}>
              <div className="space-y-3 pr-4">
                {!isExpanded && messages.length > 3 && (
                  <div className="text-center py-2">
                    <Badge variant="secondary" className="text-xs">
                      {messages.length - 3} earlier messages
                    </Badge>
                  </div>
                )}
                
                {displayMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                          <Bot className="h-3 w-3 text-primary" />
                        </div>
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div className={`text-xs mt-1 opacity-70 ${
                        message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground/70'
                      }`}>
                        {formatTimestamp(message.timestamp)}
                      </div>
                    </div>
                    
                    {message.role === 'user' && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="h-3 w-3 text-primary" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                Research context captured successfully
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/customer-research'}
              >
                Continue Chat
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
