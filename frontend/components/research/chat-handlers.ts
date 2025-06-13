/**
 * API handlers and message processing for the Customer Research Chat Interface
 * Extracted from ChatInterface.tsx for better modularity
 */

import { Message, ApiResponse, ChatState, ChatActions } from './types';
import { sendResearchChatMessage, getResearchSession, type Message as ApiMessage } from '@/lib/api/research';
import { validateMessage } from '@/lib/config/research-config';
import { formatErrorForUser, logError } from '@/lib/utils/research-error-handler';
import {
  createUserMessage,
  createAssistantMessage,
  extractSuggestions,
  hasCompleteQuestions,
  convertToSimpleQuestions,
  logSuggestionsDebug,
  scrollToBottomIfNeeded
} from './chat-utils';

/**
 * Handle sending a message to the research API
 */
export const handleSendMessage = async (
  messageText: string | undefined,
  state: ChatState,
  actions: ChatActions,
  context: any,
  updateContext: (updates: any) => void,
  updateQuestions: (questions: any) => void,
  onComplete?: (questions: any) => void,
  startThinking?: (requestId: string) => void
) => {
  const textToSend = messageText || state.input;
  if (!textToSend.trim() || state.isLoading) return;

  // Validate input
  const validation = validateMessage(textToSend);
  if (!validation.isValid) {
    const errorMessage: Message = {
      id: Date.now().toString(),
      content: validation.error || 'Please check your input and try again.',
      role: 'assistant',
      timestamp: new Date(),
    };
    actions.setMessages(prev => [...prev, errorMessage]);
    return;
  }

  const userMessage = createUserMessage(textToSend);

  actions.setMessages(prev => [...prev, userMessage]);
  actions.setInput('');
  actions.setIsLoading(true);
  actions.setConversationStarted(true);

  // Generate a temporary request ID for thinking progress
  const tempRequestId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Start thinking visualization immediately
  if (startThinking) {
    console.log('🧠 Starting immediate thinking visualization with temp ID:', tempRequestId);
    startThinking(tempRequestId);
  }

  try {
    // Convert messages to API format
    const apiMessages: ApiMessage[] = [...state.messages, userMessage].map(msg => ({
      id: msg.id,
      content: msg.content,
      role: msg.role,
      timestamp: msg.timestamp.toISOString(),
      metadata: msg.metadata
    }));

    // Call the research API using the new client with V3 Simple features enabled
    const data = await sendResearchChatMessage({
      messages: apiMessages,
      input: textToSend,
      context: context,
      session_id: state.sessionId || undefined,
      user_id: undefined, // Will be populated when auth is added
      // Enable V3 Simple features
      enable_enhanced_analysis: true,
      enable_thinking_process: true,
    });

    // Get real request ID from backend response for debugging
    const realRequestId = (data as any).metadata?.request_id || (data as any).request_id;

    // If we have a real request ID and it's different from temp ID, update thinking progress
    if (realRequestId && realRequestId !== tempRequestId && startThinking) {
      console.log('🧠 Switching to real request ID:', realRequestId);
      // Note: For now we'll keep using the temp ID since the backend thinking is already complete
      // In a real-time system, we'd switch to polling the real ID
    }

    // Debug: Log what the backend is returning
    console.log('Backend response:', {
      hasQuestions: !!data.questions,
      questionsData: data.questions,
      extractedContext: data.metadata?.extracted_context,
      messageCount: apiMessages.length,
      requestId: realRequestId,
      thinkingProcess: data.thinking_process,
      thinkingStepsCount: data.thinking_process?.length || 0
    });

    const assistantMessage = createAssistantMessage(data.content, {
      questionCategory: (data.metadata?.questionCategory === 'discovery' ||
                       data.metadata?.questionCategory === 'validation' ||
                       data.metadata?.questionCategory === 'follow_up')
                       ? data.metadata.questionCategory as 'discovery' | 'validation' | 'follow_up' : undefined,
      researchStage: (data.metadata?.researchStage === 'initial' ||
                     data.metadata?.researchStage === 'validation' ||
                     data.metadata?.researchStage === 'analysis')
                     ? data.metadata.researchStage as 'initial' | 'validation' | 'analysis' : undefined,
      // Include thinking process from backend response
      thinking_steps: data.thinking_process || [],
      // Include all other metadata from the API response
      ...data.metadata
    });

    actions.setMessages(prev => [...prev, assistantMessage]);

    // Update session ID from response
    if (data.session_id && !state.sessionId) {
      actions.setSessionId(data.session_id);
    }

    // Update suggestions from API response with better extraction and fallbacks
    const suggestions = extractSuggestions(data, context, hasCompleteQuestions(data.questions));
    actions.setCurrentSuggestions(suggestions);

    logSuggestionsDebug(suggestions, data, context);

    // Update context from LLM-extracted information in API response
    if (data.metadata?.extracted_context) {
      const extractedContext = data.metadata.extracted_context;

      const newContext = {
        businessIdea: extractedContext.business_idea || context.businessIdea,
        targetCustomer: extractedContext.target_customer || context.targetCustomer,
        problem: extractedContext.problem || context.problem,
        questionsGenerated: extractedContext.questions_generated || context.questionsGenerated
      };
      updateContext(newContext);
    }

    // Process questions if generated
    if (data.questions) {
      await processGeneratedQuestions(
        data,
        actions,
        updateQuestions,
        updateContext,
        context,
        onComplete
      );
    }

  } catch (error) {
    logError(error, 'ChatInterface.handleSend');

    // Use error handler for consistent error messages
    const errorContent = formatErrorForUser(error);

    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: errorContent,
      role: 'assistant',
      timestamp: new Date(),
    };
    actions.setMessages(prev => [...prev, errorMessage]);
  } finally {
    actions.setIsLoading(false);
    // Note: We don't stop thinking here because the final thinking steps
    // from the backend response should be displayed in the message
  }
};

/**
 * Process generated questions from API response
 */
const processGeneratedQuestions = async (
  data: ApiResponse,
  actions: ChatActions,
  updateQuestions: (questions: any) => void,
  updateContext: (updates: any) => void,
  context: any,
  onComplete?: (questions: any) => void
) => {
  // Check if we have comprehensive questions (V3 enhanced format)
  if ((data.questions as any).primaryStakeholders || (data.questions as any).secondaryStakeholders) {
    // V3 Enhanced comprehensive questions format
    const comprehensiveQuestions = {
      primaryStakeholders: (data.questions as any).primaryStakeholders || [],
      secondaryStakeholders: (data.questions as any).secondaryStakeholders || [],
      timeEstimate: (data.questions as any).timeEstimate || {
        totalQuestions: 0,
        estimatedMinutes: "0-0",
        breakdown: { baseTime: 0, withBuffer: 0, perQuestion: 2.5 }
      }
    };

    // Add comprehensive questions component
    const comprehensiveQuestionsMessage: Message = {
      id: Date.now().toString() + '_comprehensive_questions',
      content: 'COMPREHENSIVE_QUESTIONS_COMPONENT',
      role: 'assistant',
      timestamp: new Date(),
      metadata: {
        type: 'component',
        comprehensiveQuestions,
        businessContext: (data as any).context_analysis?.business_idea || context.businessIdea
      }
    };

    actions.setMessages(prev => [...prev, comprehensiveQuestionsMessage]);

    // Update local questions state for backward compatibility
    const allQuestions = convertToSimpleQuestions(comprehensiveQuestions);

    actions.setLocalQuestions(allQuestions);
    updateQuestions(allQuestions);
    updateContext({ questionsGenerated: true });

    // Always add next steps for comprehensive questions
    const nextStepsMessage: Message = {
      id: Date.now().toString() + '_nextsteps',
      content: 'NEXT_STEPS_COMPONENT',
      role: 'assistant',
      timestamp: new Date()
    };

    actions.setMessages(prev => [...prev, nextStepsMessage]);

    if (onComplete) {
      onComplete(allQuestions);
    }

    return; // Exit early to avoid duplicate processing

  } else {
    // Legacy format (V1/V2) - fallback to old component
    const apiQuestions = {
      problemDiscovery: data.questions.problemDiscovery || [],
      solutionValidation: data.questions.solutionValidation || [],
      followUp: data.questions.followUp || []
    };

    // Update the questions state directly
    actions.setLocalQuestions(apiQuestions);
    updateQuestions(apiQuestions); // Also update the useResearch hook
    updateContext({ questionsGenerated: true });

    // Add formatted questions component (legacy)
    const questionsMessage: Message = {
      id: Date.now().toString() + '_questions',
      content: 'FORMATTED_QUESTIONS_COMPONENT',
      role: 'assistant',
      timestamp: new Date(),
      metadata: { type: 'component', questions: apiQuestions }
    };

    actions.setMessages(prev => [...prev, questionsMessage]);

    // Process stakeholder detection for legacy format
    await processLegacyStakeholders(data, actions, updateContext, context);

    // Always add next steps for legacy format
    const nextStepsMessage: Message = {
      id: Date.now().toString() + '_nextsteps',
      content: 'NEXT_STEPS_COMPONENT',
      role: 'assistant',
      timestamp: new Date()
    };

    actions.setMessages(prev => [...prev, nextStepsMessage]);

    if (onComplete) {
      onComplete(apiQuestions);
    }
  }
};

/**
 * Process stakeholder detection for legacy question format
 */
const processLegacyStakeholders = async (
  data: ApiResponse,
  actions: ChatActions,
  updateContext: (updates: any) => void,
  context: any
) => {
  // Use LLM-detected stakeholders from API response if available, otherwise fallback to local detection
  let stakeholderData = null;
  if (data.metadata?.extracted_context?.detected_stakeholders) {
    stakeholderData = data.metadata.extracted_context.detected_stakeholders;
    console.log('LLM-detected stakeholders from API:', stakeholderData);
  } else {
    console.log('No LLM stakeholders in API response, using fallback detection');
    // Fallback to local detection would be handled by the component
  }

  if (stakeholderData) {
    // Update context with stakeholder information for the right panel
    updateContext({
      multiStakeholderConsidered: true,
      multiStakeholderDetected: true,
      detectedStakeholders: stakeholderData
    });

    // Add enhanced multi-stakeholder component if detected (only in chat, not in right panel)
    const enhancedMultiStakeholderMessage: Message = {
      id: Date.now().toString() + '_enhanced_multistakeholder',
      content: 'ENHANCED_MULTISTAKEHOLDER_COMPONENT',
      role: 'assistant',
      timestamp: new Date(),
      metadata: { type: 'component', stakeholders: stakeholderData }
    };

    actions.setMessages(prev => [...prev, enhancedMultiStakeholderMessage]);
  }
};

/**
 * Handle suggestion click
 */
export const handleSuggestionClick = (
  suggestion: string,
  state: ChatState,
  actions: ChatActions,
  context: any,
  updateContext: (updates: any) => void,
  updateQuestions: (questions: any) => void,
  onComplete?: (questions: any) => void,
  startThinking?: (requestId: string) => void
) => {
  console.log('🔧 Suggestion clicked:', suggestion);
  handleSendMessage(suggestion, state, actions, context, updateContext, updateQuestions, onComplete, startThinking);
};

/**
 * Load a research session
 */
export const loadSession = async (
  sessionId: string,
  actions: ChatActions,
  updateContext: (updates: any) => void
) => {
  try {
    console.log('Loading session:', sessionId);
    const sessionData = await getResearchSession(sessionId);
    console.log('Session data loaded:', sessionData);

    // Update context from session
    updateContext({
      businessIdea: sessionData.business_idea,
      targetCustomer: sessionData.target_customer,
      problem: sessionData.problem,
      questionsGenerated: sessionData.questions_generated,
      multiStakeholderConsidered: sessionData.questions_generated // If questions exist, assume multi-stakeholder was considered
    });

    // Load messages into chat - Note: messages might not be available in the API response
    // For now, we'll start with a fresh conversation when loading a session
    actions.setMessages([
      {
        id: '1',
        content: "Hi! I'm your customer research assistant. I can see you have a previous session. Let's continue from where you left off.",
        role: 'assistant',
        timestamp: new Date(),
      }
    ]);

    // Set session ID
    actions.setSessionId(sessionId);

    console.log('Session loaded successfully');
  } catch (error) {
    console.error('Failed to load session:', error);
  }
};
