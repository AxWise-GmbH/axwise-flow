'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Download, Copy, ArrowLeft, RotateCcw } from 'lucide-react';
import { ContextPanel } from './ContextPanel';
import { NextStepsChatMessage } from './NextStepsChatMessage';

import { ComprehensiveQuestionsComponent } from './ComprehensiveQuestionsComponent';

import { EnhancedMultiStakeholderComponent } from './EnhancedMultiStakeholderComponent';
import { StakeholderQuestionsComponent } from './StakeholderQuestionsComponent';
import { MultiStakeholderChatMessage } from './MultiStakeholderChatMessage';
import { StakeholderAlert } from './StakeholderAlert';

import { useResearch } from '@/hooks/use-research';
import { useChatMobileOptimization } from '@/hooks/useMobileViewport';

// Import modular components
import { ChatInterfaceProps } from './types';
import {
  useChatState,
  useScrollManagement,
  useChatClear,
  useSessionLoading,
  useClipboard,
  useLoadingTimer
} from './chat-hooks';
import {
  handleSendMessage,
  loadSession
} from './chat-handlers';

// Legacy conversion function removed - V3 Enhanced format only

export function ChatInterface({ onComplete, onBack, loadSessionId }: ChatInterfaceProps) {
  const {
    context,
    questions,
    updateContext,
    updateQuestions,
    exportQuestions,
    continueToAnalysis,
    clearAllData,
  } = useResearch();

  // Use modular hooks for state management
  const { state, actions } = useChatState();
  const { messagesEndRef } = useScrollManagement(state.messages);
  const { copyMessage } = useClipboard();
  const formattedElapsedTime = useLoadingTimer(state.isLoading);

  // Mobile optimization hooks
  const { handleMessageSent, handleNewMessage, ensureInputVisible } = useChatMobileOptimization();

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

  // Use original clear chat
  const clearChat = originalClearChat;

  // Local state for questions to handle API responses directly
  const currentQuestions = state.localQuestions || questions;

  // FIXED: Add proper handler functions for broken buttons
  const handleContinueWithCurrent = () => {
    // Continue with current stakeholder configuration
    handleSendLocal("Let's proceed with the current stakeholder configuration.");
  };

  const handleViewDetailedPlan = () => {
    // Show detailed research plan
    handleSendLocal("Please show me a detailed research plan for these stakeholders.");
  };

  const handleViewPlan = () => {
    // Show research plan
    handleSendLocal("Can you show me the research plan?");
  };

  const handleDismissAlert = () => {
    // Dismiss the stakeholder alert
    handleSendLocal("I understand. Let's continue with the current approach.");
  };

  const handleViewMultiStakeholder = () => {
    // View multi-stakeholder options
    handleSendLocal("Please show me multi-stakeholder research options.");
  };

  // Create handlers using modular functions
  const handleSendLocal = async (messageText?: string) => {
    await handleSendMessage(
      messageText,
      state,
      actions,
      context,
      updateContext,
      updateQuestions,
      onComplete
    );

    // Handle mobile optimization after sending message
    handleMessageSent();
  };

  const handleSuggestionClickLocal = (suggestion: string) => {
    // FIXED: Removed console.log placeholder, using actual functionality

    // Handle special suggestions
    if (suggestion === "I don't know") {
      // Send immediately to chat
      handleSendLocal(suggestion);
    } else if (suggestion === "All of the above") {
      // Add all other suggestions to input field with commas (excluding special options)
      const regularSuggestions = state.currentSuggestions.filter(s =>
        s !== "I don't know" && s !== "All of the above"
      );
      const combinedText = regularSuggestions.join(', ');
      actions.setInput(combinedText);
    } else {
      // Regular suggestion - send to chat
      handleSendLocal(suggestion);
    }
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

  // Handle new messages for mobile optimization
  React.useEffect(() => {
    if (state.messages.length > 0) {
      handleNewMessage();
    }
  }, [state.messages.length, handleNewMessage]);

  // Helper function to normalize timeEstimate for ComprehensiveQuestionsComponent
  const normalizeTimeEstimate = (timeEstimate: any) => {
    if (!timeEstimate) {
      return {
        totalQuestions: 0,
        estimatedMinutes: "0-0",
        breakdown: {
          baseTime: 0,
          withBuffer: 0,
          perQuestion: 3.0  // Updated to 3 minutes per question (realistic 2-4 minute range)
        }
      };
    }

    // Handle new backend format: {min: 15, max: 20, totalQuestions: 13}
    if (timeEstimate.min !== undefined && timeEstimate.max !== undefined) {
      return {
        totalQuestions: timeEstimate.totalQuestions || 0,
        estimatedMinutes: `${timeEstimate.min}-${timeEstimate.max}`,
        breakdown: {
          baseTime: timeEstimate.min || 0,
          withBuffer: timeEstimate.max || 0,
          perQuestion: timeEstimate.totalQuestions > 0 ? (timeEstimate.min / timeEstimate.totalQuestions) : 3.0  // Updated to 3 minutes per question
        }
      };
    }

    // Handle legacy format: {estimatedMinutes: "15-20", totalQuestions: 13, breakdown: {...}}
    return {
      totalQuestions: timeEstimate.totalQuestions || 0,
      estimatedMinutes: timeEstimate.estimatedMinutes || "0-0",
      breakdown: {
        baseTime: timeEstimate.breakdown?.baseTime || 0,
        withBuffer: timeEstimate.breakdown?.withBuffer || 0,
        perQuestion: timeEstimate.breakdown?.perQuestion || 3.0  // Updated to 3 minutes per question
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
        // Extract actual questions from backend response
        const questions = s.questions || {};
        result.push({
          name: typeof s === 'string' ? s : s.name || 'Primary Stakeholder',
          type: 'primary',
          description: typeof s === 'string' ? 'Primary stakeholder' : s.description || 'Primary stakeholder',
          questions: {
            discovery: questions.problemDiscovery || ['What challenges do you currently face?', 'How do you handle this today?'],
            validation: questions.solutionValidation || ['Would this solution help you?', 'What features are most important?'],
            followUp: questions.followUp || ['Any other thoughts?', 'Would you recommend this?']
          }
        });
      });
    }
    if (stakeholders.secondary) {
      const secondaryStakeholders = Array.isArray(stakeholders.secondary)
        ? stakeholders.secondary
        : [stakeholders.secondary];
      secondaryStakeholders.forEach((s: any) => {
        // Extract actual questions from backend response
        const questions = s.questions || {};
        result.push({
          name: typeof s === 'string' ? s : s.name || 'Secondary Stakeholder',
          type: 'secondary',
          description: typeof s === 'string' ? 'Secondary stakeholder' : s.description || 'Secondary stakeholder',
          questions: {
            discovery: questions.problemDiscovery || ['How does this affect you?', 'What do you see as the main challenges?'],
            validation: questions.solutionValidation || ['Would you support this solution?', 'What concerns would you have?'],
            followUp: questions.followUp || ['Any additional feedback?', 'What else should we know?']
          }
        });
      });
    }
    return result;
  };

  return (
    <div className="w-full chat-container flex flex-col overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 flex-1 p-4 min-h-0 overflow-hidden">
        {/* Chat Interface */}
        <Card className="lg:col-span-2 flex flex-col h-full min-h-0 overflow-hidden">
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
          <ScrollArea className="flex-1 p-3 lg:p-4 overflow-y-auto chat-messages-area">
            <div className="space-y-4 pb-4">
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
                      {message.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' ? (
                        (() => {
                          // DEBUG: Log what data is actually available in the message
                          console.log('🔧 ChatInterface COMPREHENSIVE_QUESTIONS_COMPONENT rendering:', {
                            messageId: message.id,
                            hasMetadata: !!message.metadata,
                            hasComprehensiveQuestions: !!message.metadata?.comprehensiveQuestions,
                            metadataKeys: message.metadata ? Object.keys(message.metadata) : [],
                            comprehensiveQuestionsKeys: message.metadata?.comprehensiveQuestions ? Object.keys(message.metadata.comprehensiveQuestions) : [],
                            primaryStakeholdersCount: message.metadata?.comprehensiveQuestions?.primaryStakeholders?.length || 0,
                            secondaryStakeholdersCount: message.metadata?.comprehensiveQuestions?.secondaryStakeholders?.length || 0,
                            timeEstimate: message.metadata?.comprehensiveQuestions?.timeEstimate,
                            fallbackPrimary: message.questions?.stakeholders?.primary?.length || 0,
                            fallbackSecondary: message.questions?.stakeholders?.secondary?.length || 0
                          });

                          return (
                            <ComprehensiveQuestionsComponent
                              primaryStakeholders={
                                message.metadata?.comprehensiveQuestions?.primaryStakeholders ||
                                message.questions?.stakeholders?.primary ||
                                []
                              }
                              secondaryStakeholders={
                                message.metadata?.comprehensiveQuestions?.secondaryStakeholders ||
                                message.questions?.stakeholders?.secondary ||
                                []
                              }
                              timeEstimate={normalizeTimeEstimate(
                                message.metadata?.comprehensiveQuestions?.timeEstimate ||
                                message.questions?.estimatedTime
                              )}
                              businessContext={message.metadata?.businessContext}
                              onExport={() => exportQuestions('txt')}
                              onContinue={continueToAnalysis}
                              onDashboard={async () => {
                                // Save current session before navigating
                                try {
                                  await saveSession();
                                } catch (error) {
                                  console.error('Failed to save session:', error);
                                }
                                window.location.href = '/unified-dashboard/research';
                              }}
                            />
                          );
                        })()
                      ) : message.content === 'ENHANCED_MULTISTAKEHOLDER_COMPONENT' ? (
                        <EnhancedMultiStakeholderComponent
                          industry={message.metadata?.industry}
                          stakeholders={normalizeStakeholdersForEnhanced(message.metadata?.stakeholders)}
                          businessContext={message.metadata?.businessContext}
                          onContinueWithCurrent={handleContinueWithCurrent}
                          onViewDetailedPlan={handleViewDetailedPlan}
                        />
                      ) : message.content === 'STAKEHOLDER_QUESTIONS_COMPONENT' ? (
                        <StakeholderQuestionsComponent
                          stakeholders={normalizeStakeholdersForQuestions(
                            message.metadata?.stakeholders ||
                            message.questions?.stakeholders
                          )}
                          businessContext={message.metadata?.businessContext}
                          onExport={() => exportQuestions('txt')}
                          onContinue={continueToAnalysis}
                        />
                      ) : message.content === 'MULTI_STAKEHOLDER_COMPONENT' ? (
                        <MultiStakeholderChatMessage
                          onContinueWithCurrent={handleContinueWithCurrent}
                          onViewDetailedPlan={handleViewDetailedPlan}
                        />
                      ) : message.content === 'STAKEHOLDER_ALERT_COMPONENT' ? (
                        <StakeholderAlert
                          onViewPlan={handleViewPlan}
                          onDismiss={handleDismissAlert}
                          onContinueWithCurrent={handleContinueWithCurrent}
                          onViewMultiStakeholder={handleViewMultiStakeholder}
                        />
                      ) : message.content === 'NEXT_STEPS_COMPONENT' ? (
                        <NextStepsChatMessage
                          onExportQuestions={() => exportQuestions('txt')}
                          onStartResearch={continueToAnalysis}
                          timeEstimate={message.metadata?.timeEstimate}
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
                        {state.currentSuggestions.map((suggestion, idx) => {
                          const isSpecial = suggestion === "I don't know" || suggestion === "All of the above";
                          return (
                            <Button
                              key={idx}
                              variant={isSpecial ? "secondary" : "outline"}
                              size="sm"
                              className={`h-auto py-1 px-2 text-xs ${
                                isSpecial
                                  ? "bg-muted/50 hover:bg-muted border-dashed"
                                  : "hover:bg-muted"
                              }`}
                              onClick={() => handleSuggestionClickLocal(suggestion)}
                            >
                              {suggestion}
                            </Button>
                          );
                        })}
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
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formattedElapsedTime}
                      </span>
                    </div>
                  </div>
                </div>
              )}


            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* Input - Fixed at bottom with mobile optimization */}
          <div className="p-3 lg:p-4 border-t flex-shrink-0 chat-input-container">
            <div className="flex gap-2 items-end">
              <Input
                value={state.input}
                onChange={(e) => actions.setInput(e.target.value)}
                onKeyDown={handleKeyDownLocal}
                onFocus={ensureInputVisible}
                placeholder="Describe your business idea or ask for help..."
                disabled={state.isLoading}
                className="flex-1 text-sm lg:text-base min-h-[44px] resize-none chat-input"
                style={{
                  fontSize: '16px', // Prevents zoom on iOS
                  WebkitAppearance: 'none' // Removes iOS styling
                }}
              />
              <Button
                onClick={() => handleSendLocal()}
                disabled={!state.input.trim() || state.isLoading}
                size="sm"
                className="h-[44px] w-[44px] flex-shrink-0 chat-send-button"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 hidden sm:block chat-help-text">
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
