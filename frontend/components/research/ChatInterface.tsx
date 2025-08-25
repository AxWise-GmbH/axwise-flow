'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Download, Copy, ArrowLeft, RotateCcw, Play } from 'lucide-react';
import { ContextPanel } from './ContextPanel';
import { NextStepsChatMessage } from './NextStepsChatMessage';

import { ComprehensiveQuestionsComponent } from './ComprehensiveQuestionsComponent';

import { EnhancedMultiStakeholderComponent } from './EnhancedMultiStakeholderComponent';
import { StakeholderQuestionsComponent } from './StakeholderQuestionsComponent';

// Client-side timestamp component to avoid hydration errors
function ClientTimestamp({ timestamp }: { timestamp: Date }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null; // Return null instead of empty string to avoid hydration mismatch
  }

  return <span>{timestamp.toLocaleTimeString('en-GB')}</span>;
}
import { MultiStakeholderChatMessage } from './MultiStakeholderChatMessage';
import { StakeholderAlert } from './StakeholderAlert';

import { useUnifiedResearch } from '@/lib/context/unified-research-context';
import { useChatMobileOptimization } from '@/hooks/useMobileViewport';

// Import modular components
import { ChatInterfaceProps } from './types';
import {
  useChatState,
  useScrollManagement,
  useChatClear,
  useSessionLoading,
  useClipboard,
  useLoadingTimer,
  useSaveSession
} from './chat-hooks';
import {
  handleSendMessage
} from './chat-handlers';

// Legacy conversion function removed - V3 Enhanced format only

export function ChatInterface({ onComplete, onBack, loadSessionId }: ChatInterfaceProps) {
  const { state: unifiedState, actions: unifiedActions } = useUnifiedResearch();

  // Use modular hooks for state management
  const { state, actions } = useChatState();

  // Ensure initial message is present when no session is loading
  React.useEffect(() => {
    if (!loadSessionId && state.messages.length === 0 && unifiedState.messages.length === 0) {
      console.log('Initializing chat with welcome message');
      const { createInitialMessage } = require('./chat-utils');
      const initialMessage = createInitialMessage();
      actions.setMessages([initialMessage]);
      // Also sync to unified state
      unifiedActions.setMessages([{
        ...initialMessage,
        timestamp: initialMessage.timestamp.toISOString()
      }]);
    }
  }, [loadSessionId, state.messages.length, unifiedState.messages.length, actions, unifiedActions]);
  const { messagesEndRef } = useScrollManagement(state.messages);
  const { copyMessage } = useClipboard();
  const formattedElapsedTime = useLoadingTimer(state.isLoading);
  const { saveSession } = useSaveSession(state, unifiedState.businessContext);

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
    unifiedActions.updateBusinessContext
  );

  // Use original clear chat
  const clearChat = originalClearChat;

  // Simple continue to analysis function
  const continueToAnalysis = () => {
    window.location.href = '/unified-dashboard/research';
  };

  // Local state for questions to handle API responses directly
  const currentQuestions = state.localQuestions || unifiedState.questionnaire;

  // Enhanced export function that uses comprehensive stakeholder questions
  const exportComprehensiveQuestions = (format: 'txt' | 'json' | 'csv' = 'txt') => {
    if (!currentQuestions) {
      console.error('No questions available to export');
      return;
    }

    // Find the latest message with comprehensive questions data
    let comprehensiveData = null;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const message = state.messages[i];
      if (message.metadata?.comprehensiveQuestions) {
        comprehensiveData = message.metadata.comprehensiveQuestions;
        break;
      }
    }

    // Debug the actual data structure
    console.log('🔍 [Export Debug] Found comprehensive data:', comprehensiveData);
    console.log('🔍 [Export Debug] Primary stakeholders:', comprehensiveData?.primaryStakeholders?.length || 0);
    console.log('🔍 [Export Debug] Secondary stakeholders:', comprehensiveData?.secondaryStakeholders?.length || 0);

    try {
      if (format === 'txt') {
        // V3 Enhanced format only - comprehensive stakeholder structure required
        if (!comprehensiveData || (!comprehensiveData.primaryStakeholders && !comprehensiveData.secondaryStakeholders)) {
          throw new Error('Invalid questionnaire format - V3 Enhanced format required');
        }

        console.log('📋 Using V3 Enhanced stakeholder format');
        const primaryStakeholders = comprehensiveData.primaryStakeholders || [];
        const secondaryStakeholders = comprehensiveData.secondaryStakeholders || [];
        const timeEstimate = comprehensiveData.timeEstimate || {};

          const textContent = `# Customer Research Questionnaire
Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}

## Business Context
**Business Idea:** ${unifiedState.businessContext.businessIdea || 'Not specified'}
**Target Customer:** ${unifiedState.businessContext.targetCustomer || 'Not specified'}
**Problem:** ${unifiedState.businessContext.problem || 'Not specified'}

---

## 📊 Questionnaire Overview
**Primary Stakeholders:** ${primaryStakeholders.length}
**Secondary Stakeholders:** ${secondaryStakeholders.length}
**Total Questions:** ${timeEstimate.totalQuestions || 0}
**Estimated Time:** ${timeEstimate.estimatedMinutesDisplay || timeEstimate.estimatedMinutes || '0-0'} minutes per conversation

---

## 🎯 PRIMARY STAKEHOLDERS
*Focus First - Start with these ${primaryStakeholders.length} stakeholders to validate core business assumptions*

${primaryStakeholders.map((stakeholder: any, index: number) => `
### ${index + 1}. ${stakeholder.name}
${stakeholder.description}

#### 🔍 Problem Discovery Questions
${(stakeholder.questions?.problemDiscovery || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n\n')}

#### ✅ Solution Validation Questions
${(stakeholder.questions?.solutionValidation || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n\n')}

#### 💡 Follow-up Questions
${(stakeholder.questions?.followUp || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n\n')}

---`).join('\n')}

## 👥 SECONDARY STAKEHOLDERS
*Research Later - Expand to these ${secondaryStakeholders.length} stakeholders after validating primary assumptions*

${secondaryStakeholders.map((stakeholder: any, index: number) => `
### ${index + 1}. ${stakeholder.name}
${stakeholder.description}

#### 🔍 Problem Discovery Questions
${(stakeholder.questions?.problemDiscovery || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n\n')}

#### ✅ Solution Validation Questions
${(stakeholder.questions?.solutionValidation || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n\n')}

#### 💡 Follow-up Questions
${(stakeholder.questions?.followUp || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n\n')}

---`).join('\n')}

## 📋 RESEARCH INSTRUCTIONS

### Interview Process
1. **Start with Primary Stakeholders** - Focus on validating core assumptions first
2. **Schedule focused conversations** - Use the time estimates provided for each stakeholder
3. **Use questions as a guide** - Let conversation flow naturally, but ensure key topics are covered
4. **Ask follow-up questions** - Dig deeper into interesting responses
5. **Look for patterns** - Identify common themes across multiple interviews

### After Interviews
1. **Upload transcripts to AxWise** - For automated analysis and insights
2. **Generate Product Requirements** - Transform insights into actionable requirements
3. **Create user stories** - Based on validated customer needs
4. **Iterate on your concept** - Use insights to refine your business idea

---

Generated by AxWise Customer Research Assistant
Ready for simulation bridge and interview analysis`;

          const blob = new Blob([textContent], { type: 'text/plain' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `research-questionnaire-${new Date().toISOString().split('T')[0]}.txt`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          console.log('✅ Comprehensive questionnaire exported successfully');
          return;

      }
    } catch (error) {
      console.error('❌ Failed to export comprehensive questions:', error);
    }
  };

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
      unifiedState.businessContext,
      unifiedActions.updateBusinessContext,
      (questionnaire: any) => {
        console.log('📋 Updating questionnaire in unified state:', questionnaire);
        unifiedActions.setQuestionnaire({
          primaryStakeholders: questionnaire.primaryStakeholders || [],
          secondaryStakeholders: questionnaire.secondaryStakeholders || [],
          timeEstimate: questionnaire.timeEstimate || null,
          generated: true,
          generatedAt: new Date().toISOString()
        });
        unifiedActions.markQuestionnaireGenerated();
      },
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

  const loadSessionLocal = useCallback(async (sessionId: string) => {
    await unifiedActions.loadSession(sessionId);
  }, [unifiedActions]);

  // Keyboard handlers
  const handleKeyDownLocal = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendLocal();
    }
  };

  // Session loading with unified system
  React.useEffect(() => {
    if (loadSessionId && !unifiedState.sessionLoading &&
        (!unifiedState.currentSession || unifiedState.currentSession.session_id !== loadSessionId)) {
      console.log('Loading session with unified system:', loadSessionId);
      unifiedActions.loadSession(loadSessionId);
    } else if (!loadSessionId && !unifiedState.currentSession) {
      console.log('No session to load, starting fresh chat');
      // Ensure we have initial message for fresh chat
      if (state.messages.length === 0 && unifiedState.messages.length === 0) {
        const { createInitialMessage } = require('./chat-utils');
        const initialMessage = createInitialMessage();
        actions.setMessages([initialMessage]);
        // Also sync to unified state
        unifiedActions.setMessages([{
          ...initialMessage,
          timestamp: initialMessage.timestamp.toISOString()
        }]);
      }
    }
  }, [loadSessionId, unifiedState.sessionLoading, unifiedState.currentSession, unifiedActions, state.messages.length, actions]);

  // One-time sync when session loads (no infinite loop)
  React.useEffect(() => {
    if (unifiedState.currentSession && unifiedState.messages.length > 0) {
      console.log('Syncing loaded session messages to chat state:', {
        sessionId: unifiedState.currentSession.session_id,
        unifiedMessagesCount: unifiedState.messages.length,
        currentStateMessagesCount: state.messages.length
      });

      // Only sync if we don't already have the same messages
      const needsSync = state.messages.length <= 1 || // Allow sync if we only have initial message
                       state.messages.length !== unifiedState.messages.length ||
                       state.messages[0]?.id !== unifiedState.messages[0]?.id;

      if (needsSync) {
        // Convert unified messages to old format
        const convertedMessages = unifiedState.messages.map(msg => ({
          ...msg,
          timestamp: typeof msg.timestamp === 'string' ? new Date(msg.timestamp) : msg.timestamp
        }));
        actions.setMessages(convertedMessages);
        actions.setConversationStarted(true);
        console.log('✅ Messages synced successfully');
      } else {
        console.log('📋 Messages already synced, skipping');
      }
    } else if (!unifiedState.currentSession && !loadSessionId) {
      // No session to load, ensure we have the initial message
      console.log('No session to load, ensuring initial message is present');
      if (state.messages.length === 0 && unifiedState.messages.length === 0) {
        const { createInitialMessage } = require('./chat-utils');
        const initialMessage = createInitialMessage();
        actions.setMessages([initialMessage]);
        // Also sync to unified state
        unifiedActions.setMessages([{
          ...initialMessage,
          timestamp: initialMessage.timestamp.toISOString()
        }]);
      }
    }
  }, [unifiedState.currentSession?.session_id, unifiedState.messages.length, loadSessionId]); // Depend on session ID, message count, and loadSessionId

  // Handle new messages for mobile optimization
  React.useEffect(() => {
    if (state.messages.length > 0) {
      handleNewMessage();
    }
  }, [state.messages.length, handleNewMessage]);

  // Helper function to normalize timeEstimate for ComprehensiveQuestionsComponent
  const normalizeTimeEstimate = React.useCallback((timeEstimate: any) => {
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
      estimatedMinutes: timeEstimate.estimatedMinutes || 0, // Keep as number
      estimatedMinutesDisplay: timeEstimate.estimatedMinutesDisplay || timeEstimate.estimatedMinutes || "0-0", // String for display
      breakdown: {
        baseTime: timeEstimate.breakdown?.baseTime || 0,
        withBuffer: timeEstimate.breakdown?.withBuffer || 0,
        perQuestion: timeEstimate.breakdown?.perQuestion || 3.0  // Updated to 3 minutes per question
      }
    };
  }, []);

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
                <Button variant="outline" size="sm" onClick={() => exportComprehensiveQuestions('txt')}>
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
                        <ComprehensiveQuestionsComponent
                          primaryStakeholders={
                            message.metadata?.comprehensiveQuestions?.primaryStakeholders ||
                            []
                          }
                          secondaryStakeholders={
                            message.metadata?.comprehensiveQuestions?.secondaryStakeholders ||
                            []
                          }
                          timeEstimate={normalizeTimeEstimate(
                            message.metadata?.comprehensiveQuestions?.timeEstimate
                          )}
                          businessContext={message.metadata?.businessContext}
                          onExport={() => exportComprehensiveQuestions('txt')}
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
                            message.metadata?.stakeholders
                          )}
                          businessContext={message.metadata?.businessContext}
                          onExport={() => exportComprehensiveQuestions('txt')}
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
                          onExportQuestions={() => exportComprehensiveQuestions('txt')}
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
                          {/* Check if this is questionnaire content that should be rendered as component */}
                          {message.content.includes('### Primary Stakeholders:') ||
                           message.content.includes('## Primary Stakeholders') ||
                           message.content.includes('**1. ') ||
                           message.content.includes('Here are the comprehensive research questions') ||
                           message.content.includes('Here are comprehensive research questions') ||
                           message.content.includes('categorized by stakeholder') ||
                           (message.content.includes('stakeholder') && message.content.includes('Questions')) ||
                           (message.content.includes('Problem Discovery Questions') && message.content.includes('Solution Validation Questions')) ? (
                            // Parse the questionnaire content and use the proper component
                            (() => {
                              // Try to parse the questionnaire content into structured data
                              const parseQuestionnaireContent = (content: string) => {
                                const primaryStakeholders: any[] = [];
                                const secondaryStakeholders: any[] = [];

                                // Split by major sections
                                const sections = content.split(/(?=##\s)/);

                                sections.forEach(section => {
                                  if (section.includes('Primary Stakeholders')) {
                                    // Parse primary stakeholders
                                    const stakeholderMatches = section.split(/(?=\*\*\d+\.)/);
                                    stakeholderMatches.forEach(match => {
                                      const nameMatch = match.match(/\*\*(\d+\.\s+[^*]+)\*\*/);
                                      const descMatch = match.match(/\*Description:\s*([^*]+)\*/);

                                      if (nameMatch) {
                                        const name = nameMatch[1];
                                        const description = descMatch ? descMatch[1].trim() : '';

                                        // Extract questions
                                        const problemDiscovery: string[] = [];
                                        const solutionValidation: string[] = [];
                                        const followUp: string[] = [];

                                        // Simple question extraction
                                        const lines = match.split('\n');
                                        let currentCategory = '';

                                        lines.forEach(line => {
                                          if (line.includes('Problem Discovery Questions')) {
                                            currentCategory = 'problem';
                                          } else if (line.includes('Solution Validation Questions')) {
                                            currentCategory = 'solution';
                                          } else if (line.includes('Follow-Up Questions') || line.includes('Follow-up Questions')) {
                                            currentCategory = 'followup';
                                          } else if (line.trim().startsWith('*') && line.includes('?')) {
                                            const question = line.replace(/^\s*\*\s*/, '').trim();
                                            if (currentCategory === 'problem') {
                                              problemDiscovery.push(question);
                                            } else if (currentCategory === 'solution') {
                                              solutionValidation.push(question);
                                            } else if (currentCategory === 'followup') {
                                              followUp.push(question);
                                            }
                                          }
                                        });

                                        primaryStakeholders.push({
                                          name,
                                          description,
                                          questions: {
                                            problemDiscovery,
                                            solutionValidation,
                                            followUp
                                          }
                                        });
                                      }
                                    });
                                  } else if (section.includes('Secondary Stakeholders')) {
                                    // Parse secondary stakeholders (similar logic)
                                    const stakeholderMatches = section.split(/(?=\*\*\d+\.)/);
                                    stakeholderMatches.forEach(match => {
                                      const nameMatch = match.match(/\*\*(\d+\.\s+[^*]+)\*\*/);
                                      const descMatch = match.match(/\*Description:\s*([^*]+)\*/);

                                      if (nameMatch) {
                                        const name = nameMatch[1];
                                        const description = descMatch ? descMatch[1].trim() : '';

                                        const problemDiscovery: string[] = [];
                                        const solutionValidation: string[] = [];
                                        const followUp: string[] = [];

                                        const lines = match.split('\n');
                                        let currentCategory = '';

                                        lines.forEach(line => {
                                          if (line.includes('Problem Discovery Questions')) {
                                            currentCategory = 'problem';
                                          } else if (line.includes('Solution Validation Questions')) {
                                            currentCategory = 'solution';
                                          } else if (line.includes('Follow-Up Questions') || line.includes('Follow-up Questions')) {
                                            currentCategory = 'followup';
                                          } else if (line.trim().startsWith('*') && line.includes('?')) {
                                            const question = line.replace(/^\s*\*\s*/, '').trim();
                                            if (currentCategory === 'problem') {
                                              problemDiscovery.push(question);
                                            } else if (currentCategory === 'solution') {
                                              solutionValidation.push(question);
                                            } else if (currentCategory === 'followup') {
                                              followUp.push(question);
                                            }
                                          }
                                        });

                                        secondaryStakeholders.push({
                                          name,
                                          description,
                                          questions: {
                                            problemDiscovery,
                                            solutionValidation,
                                            followUp
                                          }
                                        });
                                      }
                                    });
                                  }
                                });

                                return { primaryStakeholders, secondaryStakeholders };
                              };

                              const parsedData = parseQuestionnaireContent(message.content);

                              // Calculate time estimate
                              const totalQuestions = parsedData.primaryStakeholders.reduce((acc, s) =>
                                acc + (s.questions.problemDiscovery?.length || 0) +
                                      (s.questions.solutionValidation?.length || 0) +
                                      (s.questions.followUp?.length || 0), 0) +
                                parsedData.secondaryStakeholders.reduce((acc, s) =>
                                acc + (s.questions.problemDiscovery?.length || 0) +
                                      (s.questions.solutionValidation?.length || 0) +
                                      (s.questions.followUp?.length || 0), 0);

                              const timeEstimate = {
                                totalQuestions,
                                estimatedMinutes: `${Math.ceil(totalQuestions * 7)}-${Math.ceil(totalQuestions * 10)}`,
                                primaryQuestions: parsedData.primaryStakeholders.reduce((acc, s) =>
                                  acc + (s.questions.problemDiscovery?.length || 0) +
                                        (s.questions.solutionValidation?.length || 0) +
                                        (s.questions.followUp?.length || 0), 0),
                                secondaryQuestions: parsedData.secondaryStakeholders.reduce((acc, s) =>
                                  acc + (s.questions.problemDiscovery?.length || 0) +
                                        (s.questions.solutionValidation?.length || 0) +
                                        (s.questions.followUp?.length || 0), 0),
                                breakdown: {
                                  baseTime: totalQuestions * 7,
                                  withBuffer: totalQuestions * 10,
                                  perQuestion: 7
                                }
                              };

                              return (
                                <ComprehensiveQuestionsComponent
                                  primaryStakeholders={parsedData.primaryStakeholders}
                                  secondaryStakeholders={parsedData.secondaryStakeholders}
                                  timeEstimate={timeEstimate}
                                  businessContext={unifiedState.businessContext.businessIdea}
                                  onExport={() => exportComprehensiveQuestions('txt')}
                                  onDashboard={() => window.location.href = '/unified-dashboard/research'}
                                />
                              );
                            })()
                          ) : (
                            <div className="whitespace-pre-wrap">{message.content}</div>
                          )}
                        </div>
                      )}

                      {/* Timestamp and copy button */}
                      {!message.content.includes('_COMPONENT') && (
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs opacity-70">
                            <ClientTimestamp timestamp={typeof message.timestamp === 'string' ? new Date(message.timestamp) : message.timestamp} />
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
              context={unifiedState.businessContext}
              questions={currentQuestions || undefined}
              onExport={() => exportComprehensiveQuestions('txt')}
              onContinueToAnalysis={continueToAnalysis}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
