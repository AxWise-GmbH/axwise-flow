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
  onComplete?: (questions: any) => void
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

  // Track request start time for completion timer
  const requestStartTime = Date.now();



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



    // Debug: Log what the backend is returning
    console.log('Backend response:', {
      hasQuestions: !!data.questions,
      questionsData: data.questions,
      extractedContext: data.metadata?.extracted_context,
      messageCount: apiMessages.length
    });

    // Calculate completion time for metadata
    const completionTimeMs = Date.now() - requestStartTime;
    const completionTimeSec = Math.round(completionTimeMs / 1000);

    const assistantMessage = createAssistantMessage(data.content, {
      questionCategory: (data.metadata?.questionCategory === 'discovery' ||
                       data.metadata?.questionCategory === 'validation' ||
                       data.metadata?.questionCategory === 'follow_up')
                       ? data.metadata.questionCategory as 'discovery' | 'validation' | 'follow_up' : undefined,
      researchStage: (data.metadata?.researchStage === 'initial' ||
                     data.metadata?.researchStage === 'validation' ||
                     data.metadata?.researchStage === 'analysis')
                     ? data.metadata.researchStage as 'initial' | 'validation' | 'analysis' : undefined,
      completionTimeMs,
      completionTimeSec,
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
    // Note: We don't stop thinking here because the thinking process
    // should remain visible after the user message. The thinking will
    // be cleared when the user sends a new message or clears the chat.
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
  // Backend returns: { questions: { stakeholders: { primary: [...], secondary: [...] }, estimatedTime: {...} } }
  if ((data.questions as any).stakeholders || (data.questions as any).estimatedTime) {
    // V3 Enhanced comprehensive questions format - fix data structure mapping
    const stakeholders = (data.questions as any).stakeholders || {};
    const timeEstimate = (data.questions as any).estimatedTime || {};

    // FIXED: Map stakeholder data correctly to include questions for each stakeholder
    const comprehensiveQuestions = {
      primaryStakeholders: (stakeholders.primary || []).map((stakeholder: any) => ({
        name: stakeholder.name || 'Primary Stakeholder',
        description: stakeholder.description || 'Primary stakeholder description',
        questions: {
          problemDiscovery: stakeholder.questions?.problemDiscovery || [],
          solutionValidation: stakeholder.questions?.solutionValidation || [],
          followUp: stakeholder.questions?.followUp || []
        }
      })),
      secondaryStakeholders: (stakeholders.secondary || []).map((stakeholder: any) => ({
        name: stakeholder.name || 'Secondary Stakeholder',
        description: stakeholder.description || 'Secondary stakeholder description',
        questions: {
          problemDiscovery: stakeholder.questions?.problemDiscovery || [],
          solutionValidation: stakeholder.questions?.solutionValidation || [],
          followUp: stakeholder.questions?.followUp || []
        }
      })),
      timeEstimate: {
        totalQuestions: timeEstimate.totalQuestions || 0,
        estimatedMinutes: timeEstimate.min && timeEstimate.max ? `${timeEstimate.min}-${timeEstimate.max}` : "0-0",
        breakdown: {
          baseTime: timeEstimate.min || 0,
          withBuffer: timeEstimate.max || 0,
          perQuestion: 2.5
        }
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
  onComplete?: (questions: any) => void
) => {
  console.log('🔧 Suggestion clicked:', suggestion);
  handleSendMessage(suggestion, state, actions, context, updateContext, updateQuestions, onComplete);
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
