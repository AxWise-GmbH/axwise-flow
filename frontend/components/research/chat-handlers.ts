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
  logSuggestionsDebug,
  scrollToBottomIfNeeded
} from './chat-utils';

/**
 * Save questionnaire data to backend
 */
const saveQuestionnaireToBackend = async (sessionId: string, questionnaireData: any): Promise<void> => {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const response = await fetch(`${API_BASE_URL}/api/research/sessions/${sessionId}/questionnaire`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(questionnaireData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save questionnaire: ${errorText}`);
  }

  return response.json();
};

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
    console.log('🔧 DUPLICATE DEBUG: Backend response:', {
      hasQuestions: !!data.questions,
      questionsData: data.questions,
      questionsType: typeof data.questions,
      questionsKeys: data.questions ? Object.keys(data.questions) : [],
      hasStakeholders: !!(data.questions as any)?.stakeholders,
      hasEstimatedTime: !!(data.questions as any)?.estimatedTime,
      hasProblemDiscovery: !!(data.questions as any)?.problemDiscovery,
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

    // Debug: Log the full API response to see what we're getting
    console.log('🔍 Full API response:', {
      hasQuestions: !!data.questions,
      questionsKeys: data.questions ? Object.keys(data.questions) : [],
      hasMetadata: !!data.metadata,
      metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
      fullData: data
    });



    // Process questions if generated
    if (data.questions) {
      console.log('✅ Processing questions from API response');
      await processGeneratedQuestions(
        data,
        actions,
        updateQuestions,
        updateContext,
        context,
        onComplete
      );
    } else {
      console.log('❌ No questions found in API response');
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
  console.log('🔧 V3 Enhanced: processGeneratedQuestions called with:', {
    questionsData: data.questions,
    hasPrimaryStakeholders: !!(data.questions as any)?.primaryStakeholders,
    hasSecondaryStakeholders: !!(data.questions as any)?.secondaryStakeholders,
    hasTimeEstimate: !!(data.questions as any)?.timeEstimate,
    questionsKeys: data.questions ? Object.keys(data.questions) : []
  });

  // V3 ENHANCED FORMAT ONLY - Process stakeholder-based questions
  // Backend returns: { questions: { primaryStakeholders: [...], secondaryStakeholders: [...], timeEstimate: {...} } }

  console.log('🔧 V3 Enhanced Processing: Backend response received');

  const questionsData = data.questions as any;

  // Validate V3 format - reject if not in expected format
  if (!questionsData?.primaryStakeholders && !questionsData?.secondaryStakeholders) {
    console.error('❌ Invalid questionnaire format - V3 Enhanced format required');
    throw new Error('Invalid questionnaire format received from backend');
  }

  console.log('🔧 V3 Enhanced Processing: Stakeholder data analysis:', {
    hasPrimaryStakeholders: !!questionsData?.primaryStakeholders,
    hasSecondaryStakeholders: !!questionsData?.secondaryStakeholders,
    hasTimeEstimate: !!questionsData?.timeEstimate,
    primaryStakeholdersLength: questionsData?.primaryStakeholders?.length || 0,
    secondaryStakeholdersLength: questionsData?.secondaryStakeholders?.length || 0
  });

  // Use V3 format directly (no legacy conversion)
  const processedQuestionsData = questionsData;

  // Process V3 enhanced stakeholder-based questions (using converted data if needed)
  const comprehensiveQuestions = {
    primaryStakeholders: (processedQuestionsData.primaryStakeholders || []).map((stakeholder: any) => ({
      name: stakeholder.name || 'Primary Stakeholder',
      description: stakeholder.description || 'Primary stakeholder description',
      questions: {
        problemDiscovery: stakeholder.questions?.problemDiscovery || [],
        solutionValidation: stakeholder.questions?.solutionValidation || [],
        followUp: stakeholder.questions?.followUp || []
      }
    })),
    secondaryStakeholders: (processedQuestionsData.secondaryStakeholders || []).map((stakeholder: any) => ({
      name: stakeholder.name || 'Secondary Stakeholder',
      description: stakeholder.description || 'Secondary stakeholder description',
      questions: {
        problemDiscovery: stakeholder.questions?.problemDiscovery || [],
        solutionValidation: stakeholder.questions?.solutionValidation || [],
        followUp: stakeholder.questions?.followUp || []
      }
    })),
    timeEstimate: {
      totalQuestions: processedQuestionsData.timeEstimate?.totalQuestions || 0,
      estimatedMinutes: processedQuestionsData.timeEstimate?.estimatedMinutes || 0, // Keep as number for questionnaire page
      estimatedMinutesDisplay: (() => {
        const minutes = processedQuestionsData.timeEstimate?.estimatedMinutes;
        // Handle both number (new format) and string (legacy format)
        if (typeof minutes === 'number') {
          // Convert number to string range format for chat components
          const minTime = Math.max(20, minutes - 5);
          const maxTime = minutes + 5;
          return `${minTime}-${maxTime}`;
        }
        return minutes || "0-0";
      })(),
      breakdown: processedQuestionsData.timeEstimate?.breakdown || {
        primary: 0,
        secondary: 0,
        perQuestion: 3
      }
    }
  };

  console.log('🔧 V3 Enhanced Processing: Generated comprehensive questions:', {
    primaryStakeholders: comprehensiveQuestions.primaryStakeholders.length,
    secondaryStakeholders: comprehensiveQuestions.secondaryStakeholders.length,
    totalQuestions: comprehensiveQuestions.timeEstimate.totalQuestions,
    estimatedMinutes: comprehensiveQuestions.timeEstimate.estimatedMinutes
  });

  // Add comprehensive questions component
  const messageId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}_comprehensive_questions`;
  const comprehensiveQuestionsMessage: Message = {
    id: messageId,
    content: 'COMPREHENSIVE_QUESTIONS_COMPONENT',
    role: 'assistant',
    timestamp: new Date(),
    metadata: {
      type: 'component',
      comprehensiveQuestions,
      businessContext: (data as any).context_analysis?.business_idea || context.businessIdea
    }
  };

  console.log('🔧 V3 Enhanced Processing: Adding comprehensive questions component');

  actions.setMessages(prev => {
    // Check if we already have a COMPREHENSIVE_QUESTIONS_COMPONENT with actual questions
    const existingComprehensiveComponent = prev.find(m => {
      if (m.content !== 'COMPREHENSIVE_QUESTIONS_COMPONENT') return false;
      const existingQuestions = m.metadata?.comprehensiveQuestions?.timeEstimate?.totalQuestions || 0;
      return existingQuestions > 0; // Only consider it existing if it has actual questions
    });

    if (existingComprehensiveComponent) {
      console.log('🔧 V3 Enhanced Processing: Questions component already exists, skipping');
      return prev; // Return unchanged array
    }

    // If we have an empty component and this new one has questions, replace the empty one
    const emptyComprehensiveComponent = prev.find(m => {
      if (m.content !== 'COMPREHENSIVE_QUESTIONS_COMPONENT') return false;
      const existingQuestions = m.metadata?.comprehensiveQuestions?.timeEstimate?.totalQuestions || 0;
      return existingQuestions === 0; // Find empty component
    });

    if (emptyComprehensiveComponent && comprehensiveQuestions.timeEstimate.totalQuestions > 0) {
      console.log('🔧 V3 Enhanced Processing: Replacing empty component with actual questions');
      // Remove the empty component and add the new one
      const filteredMessages = prev.filter(m => m.id !== emptyComprehensiveComponent.id);
      return [...filteredMessages, comprehensiveQuestionsMessage];
    }

    return [...prev, comprehensiveQuestionsMessage];
  });

  // Update context - no need for legacy format conversion
  updateContext({ questionsGenerated: true });

  // Save comprehensive questionnaire data to backend if we have a session ID
  if (data.session_id && !data.session_id.startsWith('local_')) {
    try {
      await saveQuestionnaireToBackend(data.session_id, comprehensiveQuestions);
      console.log('✅ Questionnaire saved to backend successfully');
    } catch (error) {
      console.error('❌ Failed to save questionnaire to backend:', error);
      // Don't throw error - this is not critical for the user experience
    }
  }

  // Ensure local sessions are properly saved with questionnaire data
  if (data.session_id && data.session_id.startsWith('local_')) {
    try {
      console.log('💾 Ensuring local questionnaire is properly saved...');

      // Import LocalResearchStorage dynamically
      const { LocalResearchStorage } = await import('@/lib/api/research');

      // Get current session
      let session = LocalResearchStorage.getSession(data.session_id);

      if (session) {
        // Update session to mark questions as generated
        session.questions_generated = true;
        session.status = 'completed';
        session.stage = 'completed';
        session.completed_at = new Date().toISOString();
        session.updated_at = new Date().toISOString();

        // Ensure the questionnaire message is properly formatted
        const questionnaireMessageExists = session.messages?.some(msg =>
          msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' &&
          msg.metadata?.comprehensiveQuestions
        );

        if (!questionnaireMessageExists) {
          console.log('🔧 Adding missing questionnaire component to local session');

          // Add the questionnaire message if it doesn't exist
          const questionnaireMessage = {
            id: `questionnaire_${Date.now()}`,
            content: 'COMPREHENSIVE_QUESTIONS_COMPONENT',
            role: 'assistant' as const,
            timestamp: new Date().toISOString(),
            metadata: {
              type: 'component',
              comprehensiveQuestions,
              businessContext: session.business_idea
            }
          };

          session.messages = session.messages || [];
          session.messages.push(questionnaireMessage);
          session.message_count = session.messages.length;
        }

        // Save the updated session
        LocalResearchStorage.saveSession(session);
        console.log('✅ Local questionnaire saved successfully');
      } else {
        console.warn('⚠️ Local session not found for questionnaire saving');
      }
    } catch (error) {
      console.error('❌ Failed to save local questionnaire:', error);
    }
  }

  // Always add next steps for comprehensive questions
  const nextStepsMessage: Message = {
    id: Date.now().toString() + '_nextsteps',
    content: 'NEXT_STEPS_COMPONENT',
    role: 'assistant',
    timestamp: new Date(),
    metadata: {
      type: 'component',
      timeEstimate: comprehensiveQuestions.timeEstimate
    }
  };

  actions.setMessages(prev => [...prev, nextStepsMessage]);

  if (onComplete) {
    onComplete(comprehensiveQuestions);
  }

  return; // V3 Enhanced format processing complete
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

    let sessionData;

    // Check if it's a local session (starts with 'local_')
    if (sessionId.startsWith('local_')) {
      console.log('Loading local session from localStorage');
      // Import LocalResearchStorage dynamically to avoid SSR issues
      const { LocalResearchStorage } = await import('@/lib/api/research');
      sessionData = LocalResearchStorage.getSession(sessionId);

      if (!sessionData) {
        console.error('Local session not found in localStorage:', sessionId);
        return;
      }
    } else {
      // Load from backend API
      sessionData = await getResearchSession(sessionId);
    }

    console.log('Session data loaded:', sessionData);

    // Update context from session
    updateContext({
      businessIdea: sessionData.business_idea,
      targetCustomer: sessionData.target_customer,
      problem: sessionData.problem,
      questionsGenerated: sessionData.questions_generated,
      multiStakeholderConsidered: sessionData.questions_generated // If questions exist, assume multi-stakeholder was considered
    });

    // Load actual messages from the session if available
    if (sessionData.messages && sessionData.messages.length > 0) {
      console.log(`Loading ${sessionData.messages.length} messages from session`);

      // Convert message format to chat interface format
      const chatMessages = sessionData.messages.map((msg: any, index: number) => ({
        id: msg.id || `loaded_${index}`,
        content: msg.content,
        role: msg.role,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        metadata: msg.metadata || {}
      }));

      actions.setMessages(chatMessages);
      actions.setConversationStarted(true);
    } else {
      // If no messages, start with a welcome message
      actions.setMessages([
        {
          id: '1',
          content: "Hi! I'm your customer research assistant. I can see you have a previous session. Let's continue from where you left off.",
          role: 'assistant',
          timestamp: new Date(),
        }
      ]);
    }

    // Set session ID
    actions.setSessionId(sessionId);

    console.log('Session loaded successfully with', sessionData.messages?.length || 0, 'messages');
  } catch (error) {
    console.error('Failed to load session:', error);
  }
};
