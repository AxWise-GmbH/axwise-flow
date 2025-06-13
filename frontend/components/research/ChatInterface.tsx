'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Download, Copy, ArrowLeft, RotateCcw } from 'lucide-react';
import { ContextPanel } from './ContextPanel';
import { NextStepsChatMessage } from './NextStepsChatMessage';

import { ComprehensiveQuestionsComponent } from './ComprehensiveQuestionsComponent';
import { FormattedQuestionsComponent } from './FormattedQuestionsComponent';
import { EnhancedMultiStakeholderComponent } from './EnhancedMultiStakeholderComponent';
import { StakeholderQuestionsComponent } from './StakeholderQuestionsComponent';
import { MultiStakeholderChatMessage } from './MultiStakeholderChatMessage';
import { StakeholderAlert } from './StakeholderAlert';
import { SimpleThinkingDisplay } from './SimpleThinkingDisplay';
import { useResearch } from '@/hooks/use-research';
import { useThinkingProgress } from './use-thinking-progress';

// Import modular components
import { ChatInterfaceProps } from './types';
import {
  useChatState,
  useScrollManagement,
  useChatClear,
  useSessionLoading,
  useClipboard
} from './chat-hooks';
import {
  handleSendMessage,
  loadSession
} from './chat-handlers';

export function ChatInterface({ onComplete, onBack, loadSessionId }: ChatInterfaceProps) {
  const {
    context,
    questions,
    updateContext,
    updateQuestions,
    exportQuestions,
    continueToAnalysis,
  } = useResearch();

  // Use modular hooks for state management
  const { state, actions } = useChatState();
  const { messagesEndRef } = useScrollManagement(state.messages);
  const { copyMessage } = useClipboard();
  const {
    thinkingSteps,
    isThinking,
    thinkingError,
    startThinking,
    stopThinking,
    clearThinking
  } = useThinkingProgress();
  const { handleClearClick, clearChat: originalClearChat } = useChatClear(
    state.messages,
    actions.setMessages,
    actions.setInput,
    actions.setIsLoading,
    actions.setConversationStarted,
    actions.setCurrentSuggestions,
    actions.setSessionId,
    actions.setShowClearConfirm,
    updateContext
  );

  // Enhanced clear chat that also clears thinking
  const clearChat = () => {
    clearThinking();
    originalClearChat();
  };

  // Local state for questions to handle API responses directly
  const currentQuestions = state.localQuestions || questions;

  // Create handlers using modular functions
  const handleSendLocal = async (messageText?: string) => {
    await handleSendMessage(
      messageText,
      state,
      actions,
      context,
      updateContext,
      updateQuestions,
      onComplete,
      startThinking
    );
  };

  const handleSuggestionClickLocal = (suggestion: string) => {
    console.log('🔧 Suggestion clicked:', suggestion);
    handleSendLocal(suggestion);
  };

  const loadSessionLocal = async (sessionId: string) => {
    await loadSession(sessionId, actions, updateContext);
  };

  // Keyboard handlers
  const handleKeyDownLocal = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendLocal();
    }
  };

  // Session loading hook
  useSessionLoading(loadSessionId, loadSessionLocal);

  // Helper function to normalize timeEstimate for ComprehensiveQuestionsComponent
  const normalizeTimeEstimate = (timeEstimate: any) => {
    if (!timeEstimate) {
      return {
        totalQuestions: 0,
        estimatedMinutes: "0-0",
        breakdown: {
          baseTime: 0,
          withBuffer: 0,
          perQuestion: 2.5
        }
      };
    }

    return {
      totalQuestions: timeEstimate.totalQuestions || 0,
      estimatedMinutes: timeEstimate.estimatedMinutes || "0-0",
      breakdown: {
        baseTime: timeEstimate.breakdown?.baseTime || 0,
        withBuffer: timeEstimate.breakdown?.withBuffer || 0,
        perQuestion: timeEstimate.breakdown?.perQuestion || 2.5
      }
    };
  };

  // Helper function to normalize stakeholders for EnhancedMultiStakeholderComponent
  const normalizeStakeholdersForEnhanced = (stakeholders: any): any[] => {
    if (!stakeholders) return [];
    if (Array.isArray(stakeholders)) return stakeholders;

    // Handle StakeholderData format
    const result: any[] = [];
    if (stakeholders.primary) {
      const primaryStakeholders = Array.isArray(stakeholders.primary)
        ? stakeholders.primary
        : [stakeholders.primary];
      primaryStakeholders.forEach((s: any, index: number) => {
        result.push({
          name: typeof s === 'string' ? s : s.name || 'Primary Stakeholder',
          type: 'primary',
          description: typeof s === 'string' ? 'Primary stakeholder' : s.description || 'Primary stakeholder',
          priority: index + 1
        });
      });
    }
    if (stakeholders.secondary) {
      const secondaryStakeholders = Array.isArray(stakeholders.secondary)
        ? stakeholders.secondary
        : [stakeholders.secondary];
      secondaryStakeholders.forEach((s: any, index: number) => {
        result.push({
          name: typeof s === 'string' ? s : s.name || 'Secondary Stakeholder',
          type: 'secondary',
          description: typeof s === 'string' ? 'Secondary stakeholder' : s.description || 'Secondary stakeholder',
          priority: index + 1
        });
      });
    }
    return result;
  };

  // Helper function to normalize stakeholders for StakeholderQuestionsComponent
  const normalizeStakeholdersForQuestions = (stakeholders: any): any[] => {
    if (!stakeholders) return [];
    if (Array.isArray(stakeholders)) return stakeholders;

    // Handle StakeholderData format
    const result: any[] = [];
    if (stakeholders.primary) {
      const primaryStakeholders = Array.isArray(stakeholders.primary)
        ? stakeholders.primary
        : [stakeholders.primary];
      primaryStakeholders.forEach((s: any) => {
        result.push({
          name: typeof s === 'string' ? s : s.name || 'Primary Stakeholder',
          type: 'primary',
          description: typeof s === 'string' ? 'Primary stakeholder' : s.description || 'Primary stakeholder',
          questions: {
            discovery: ['What challenges do you currently face?', 'How do you handle this today?'],
            validation: ['Would this solution help you?', 'What features are most important?'],
            followUp: ['Any other thoughts?', 'Would you recommend this?']
          }
        });
      });
    }
    if (stakeholders.secondary) {
      const secondaryStakeholders = Array.isArray(stakeholders.secondary)
        ? stakeholders.secondary
        : [stakeholders.secondary];
      secondaryStakeholders.forEach((s: any) => {
        result.push({
          name: typeof s === 'string' ? s : s.name || 'Secondary Stakeholder',
          type: 'secondary',
          description: typeof s === 'string' ? 'Secondary stakeholder' : s.description || 'Secondary stakeholder',
          questions: {
            discovery: ['How does this affect you?', 'What do you see as the main challenges?'],
            validation: ['Would you support this solution?', 'What concerns would you have?'],
            followUp: ['Any additional feedback?', 'What else should we know?']
          }
        });
      });
    }
    return result;
  };

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 flex-1 p-4 min-h-0">
        {/* Chat Interface */}
        <Card className="lg:col-span-2 flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between p-3 lg:p-4 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="mr-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Bot className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-sm lg:text-base">Customer Research Assistant</h3>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearClick}
                title="Clear chat and start over"
              >
                <RotateCcw className="h-4 w-4 mr-1 lg:mr-2" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
              {currentQuestions && (
                <Button variant="outline" size="sm" onClick={() => exportQuestions('txt')}>
                  <Download className="h-4 w-4 mr-1 lg:mr-2" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3 lg:p-4">
            <div className="space-y-4">
              {state.messages.map((message, index) => (
                <div key={message.id}>
                  <div
                    className={`flex gap-2 lg:gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 lg:w-8 lg:h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <Bot className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
                        </div>
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] lg:max-w-[80%] ${
                        message.content === 'MULTI_STAKEHOLDER_COMPONENT' ||
                        message.content === 'NEXT_STEPS_COMPONENT' ||
                        message.content === 'STAKEHOLDER_ALERT_COMPONENT' ||
                        message.content === 'FORMATTED_QUESTIONS_COMPONENT' ||
                        message.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' ||
                        message.content === 'ENHANCED_MULTISTAKEHOLDER_COMPONENT' ||
                        message.content === 'STAKEHOLDER_QUESTIONS_COMPONENT'
                          ? ''
                          : `rounded-lg p-2 lg:p-3 text-sm lg:text-base ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground border border-border'
                            }`
                      }`}
                    >
                      {/* Component rendering logic */}
                      {message.content === 'FORMATTED_QUESTIONS_COMPONENT' ? (
                        <FormattedQuestionsComponent
                          questions={message.metadata?.questions || []}
                          onExport={() => exportQuestions('txt')}
                          onContinue={continueToAnalysis}
                        />
                      ) : message.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' ? (
                        <ComprehensiveQuestionsComponent
                          primaryStakeholders={message.metadata?.comprehensiveQuestions?.primaryStakeholders || []}
                          secondaryStakeholders={message.metadata?.comprehensiveQuestions?.secondaryStakeholders || []}
                          timeEstimate={normalizeTimeEstimate(message.metadata?.comprehensiveQuestions?.timeEstimate)}
                          businessContext={message.metadata?.businessContext}
                          onExport={() => exportQuestions('txt')}
                          onContinue={continueToAnalysis}
                        />
                      ) : message.content === 'ENHANCED_MULTISTAKEHOLDER_COMPONENT' ? (
                        <EnhancedMultiStakeholderComponent
                          industry={message.metadata?.industry}
                          stakeholders={normalizeStakeholdersForEnhanced(message.metadata?.stakeholders)}
                          businessContext={message.metadata?.businessContext}
                          onContinueWithCurrent={() => console.log('Continue with current')}
                          onViewDetailedPlan={() => console.log('View detailed plan')}
                        />
                      ) : message.content === 'STAKEHOLDER_QUESTIONS_COMPONENT' ? (
                        <StakeholderQuestionsComponent
                          stakeholders={normalizeStakeholdersForQuestions(message.metadata?.stakeholders)}
                          businessContext={message.metadata?.businessContext}
                          onExport={() => exportQuestions('txt')}
                          onContinue={continueToAnalysis}
                        />
                      ) : message.content === 'MULTI_STAKEHOLDER_COMPONENT' ? (
                        <MultiStakeholderChatMessage
                          onContinueWithCurrent={() => console.log('Continue with current')}
                          onViewDetailedPlan={() => console.log('View detailed plan')}
                        />
                      ) : message.content === 'STAKEHOLDER_ALERT_COMPONENT' ? (
                        <StakeholderAlert
                          onViewPlan={() => console.log('View plan')}
                          onDismiss={() => console.log('Dismiss alert')}
                          onContinueWithCurrent={() => console.log('Continue with current')}
                          onViewMultiStakeholder={() => console.log('View multi-stakeholder')}
                        />
                      ) : message.content === 'NEXT_STEPS_COMPONENT' ? (
                        <NextStepsChatMessage
                          onExportQuestions={() => exportQuestions('txt')}
                          onStartResearch={continueToAnalysis}
                        />
                      ) : message.content.includes('_COMPONENT') ? (
                        <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
                          <p className="text-sm text-muted-foreground">
                            Component: {message.content}
                          </p>
                          {message.metadata && (
                            <pre className="text-xs mt-2 overflow-auto">
                              {JSON.stringify(message.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="whitespace-pre-wrap">{message.content}</div>

                          {/* Show thinking process if available */}
                          {message.role === 'assistant' && message.metadata?.thinking_steps && message.metadata.thinking_steps.length > 0 && (
                            <div className="mt-4">
                              <SimpleThinkingDisplay
                                steps={message.metadata.thinking_steps}
                                className="max-w-none"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Timestamp and copy button */}
                      {!message.content.includes('_COMPONENT') && (
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs opacity-70">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                          {message.role === 'assistant' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyMessage(message.content)}
                              className="h-6 w-6 p-0 opacity-70 hover:opacity-100"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {message.role === 'user' && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 lg:w-8 lg:h-8 bg-muted rounded-full flex items-center justify-center">
                          <User className="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Show suggestions after assistant messages */}
                  {message.role === 'assistant' &&
                   index === state.messages.length - 1 &&
                   !state.isLoading &&
                   state.currentSuggestions.length > 0 &&
                   !message.content.includes('_COMPONENT') && (
                    <div className="mt-3 ml-8 lg:ml-11">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-muted-foreground">💡 Quick replies:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {state.currentSuggestions.map((suggestion, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            className="h-auto py-1 px-2 text-xs hover:bg-muted"
                            onClick={() => handleSuggestionClickLocal(suggestion)}
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}



              {state.isLoading && (
                <div className="flex gap-2 lg:gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 lg:w-8 lg:h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <Bot className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg p-2 lg:p-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Thinking Progress - Show during analysis */}
              {(isThinking || (state.isLoading && thinkingSteps.length > 0)) && (
                <div className="flex gap-2 lg:gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 lg:w-8 lg:h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <Bot className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
                    </div>
                  </div>
                  <div className="max-w-[85%] lg:max-w-[80%]">
                    <SimpleThinkingDisplay
                      steps={thinkingSteps}
                      className="max-w-none"
                    />
                    {thinkingError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                        Thinking process error: {thinkingError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* Input */}
          <div className="p-3 lg:p-4 border-t flex-shrink-0">
            <div className="flex gap-2">
              <Input
                value={state.input}
                onChange={(e) => actions.setInput(e.target.value)}
                onKeyDown={handleKeyDownLocal}
                placeholder="Describe your business idea or ask for help..."
                disabled={state.isLoading}
                className="flex-1 text-sm lg:text-base"
              />
              <Button
                onClick={() => handleSendLocal()}
                disabled={!state.input.trim() || state.isLoading}
                size="sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </Card>

        {/* Clear Confirmation Dialog */}
        {state.showClearConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-2">Clear Chat?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  This will clear your entire conversation and reset all progress. This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => actions.setShowClearConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={clearChat}
                  >
                    Clear Chat
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Context Panel - Hidden on mobile, shown on desktop */}
        <div className="hidden lg:block lg:col-span-1 min-h-0">
          <div className="h-full overflow-y-auto space-y-4 min-h-0">
            <ContextPanel
              context={context}
              questions={currentQuestions || undefined}
              onExport={() => exportQuestions('txt')}
              onContinueToAnalysis={continueToAnalysis}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
