/**
 * Custom hooks for the Customer Research Chat Interface
 * Extracted from ChatInterface.tsx for better modularity
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Message, ChatState, ChatActions, PollingConfig } from './types';
import { createInitialMessage, scrollToBottomIfNeeded } from './chat-utils';

/**
 * Main chat state management hook
 */
export const useChatState = () => {
  const [messages, setMessages] = useState<Message[]>([createInitialMessage()]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showStakeholderAlert, setShowStakeholderAlert] = useState(false);
  const [showMultiStakeholderPlan, setShowMultiStakeholderPlan] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [localQuestions, setLocalQuestions] = useState<any>(null);

  const state: ChatState = {
    messages,
    input,
    isLoading,
    conversationStarted,
    currentSuggestions,
    sessionId,
    showStakeholderAlert,
    showMultiStakeholderPlan,
    showClearConfirm,
    localQuestions
  };

  const actions: ChatActions = {
    setMessages,
    setInput,
    setIsLoading,
    setConversationStarted,
    setCurrentSuggestions,
    setSessionId,
    setShowStakeholderAlert,
    setShowMultiStakeholderPlan,
    setShowClearConfirm,
    setLocalQuestions
  };

  return { state, actions };
};

/**
 * Hook for managing scroll behavior
 */
export const useScrollManagement = (messages: Message[]) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [messages]);

  return { messagesEndRef };
};



/**
 * Hook for managing keyboard interactions
 */
export const useKeyboardHandlers = (
  input: string,
  isLoading: boolean,
  handleSend: () => void
) => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return { handleKeyDown };
};

/**
 * Hook for managing chat clearing functionality
 */
export const useChatClear = (
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setInput: React.Dispatch<React.SetStateAction<string>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setConversationStarted: React.Dispatch<React.SetStateAction<boolean>>,
  setCurrentSuggestions: React.Dispatch<React.SetStateAction<string[]>>,
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>,
  setShowClearConfirm: React.Dispatch<React.SetStateAction<boolean>>,
  updateContext: (updates: any) => void
) => {
  const handleClearClick = useCallback(() => {
    // If there are only 1-2 messages (initial + maybe one user message), clear immediately
    if (messages.length <= 2) {
      clearChat();
    } else {
      // Show confirmation for longer conversations
      setShowClearConfirm(true);
    }
  }, [messages.length]);

  const clearChat = useCallback(() => {
    // Reset all state to initial values
    setMessages([createInitialMessage()]);
    setInput('');
    setIsLoading(false);
    setConversationStarted(false);
    setCurrentSuggestions([]); // Clear suggestions on reset
    setSessionId(null);
    setShowClearConfirm(false);

    // Reset context using the hook
    updateContext({
      businessIdea: '',
      targetCustomer: '',
      problem: '',
      questionsGenerated: false,
      multiStakeholderConsidered: false
    });
  }, [setMessages, setInput, setIsLoading, setConversationStarted, setCurrentSuggestions, setSessionId, setShowClearConfirm, updateContext]);

  return { handleClearClick, clearChat };
};

/**
 * Hook for managing session loading
 */
export const useSessionLoading = (
  loadSessionId: string | undefined,
  loadSession: (sessionId: string) => Promise<void>
) => {
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);

  // Load session when loadSessionId changes, but only once per session
  useEffect(() => {
    if (loadSessionId && loadSessionId !== loadedSessionId) {
      console.log('🔄 Loading session (once):', loadSessionId);
      loadSession(loadSessionId).then(() => {
        setLoadedSessionId(loadSessionId);
      }).catch((error) => {
        console.error('❌ Failed to load session:', error);
      });
    }
  }, [loadSessionId]); // Remove loadSession from dependencies to prevent infinite loop
};

/**
 * Hook for managing clipboard operations
 */
export const useClipboard = () => {
  const copyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      console.log('Message copied to clipboard');
    } catch (err) {
      console.error('Failed to copy message:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }, []);

  return { copyMessage };
};

/**
 * Hook for managing component visibility states
 */
export const useComponentVisibility = () => {
  const [visibilityStates, setVisibilityStates] = useState<Record<string, boolean>>({});

  const toggleVisibility = useCallback((id: string) => {
    setVisibilityStates(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }, []);

  const setVisibility = useCallback((id: string, visible: boolean) => {
    setVisibilityStates(prev => ({
      ...prev,
      [id]: visible
    }));
  }, []);

  return { visibilityStates, toggleVisibility, setVisibility };
};

/**
 * Hook for managing form validation
 */
export const useFormValidation = () => {
  const validateInput = useCallback((input: string): { isValid: boolean; error?: string } => {
    if (!input.trim()) {
      return { isValid: false, error: 'Please enter a message' };
    }

    if (input.length > 1000) {
      return { isValid: false, error: 'Message is too long (max 1000 characters)' };
    }

    return { isValid: true };
  }, []);

  return { validateInput };
};

/**
 * Hook for managing debounced operations
 */
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Hook for managing loading timer with milliseconds
 */
export const useLoadingTimer = (isLoading: boolean) => {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Reset timer when loading starts
      const now = Date.now();
      setStartTime(now);
      setElapsedMs(0);

      // Start timer with 100ms precision
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - now);
      }, 100);
    } else {
      // Clear timer when loading stops
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setStartTime(null);
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLoading]);

  // Format time as "Xs" or "X.Xs"
  const formatTime = (ms: number): string => {
    if (ms < 1000) {
      return '0s';
    }
    const seconds = ms / 1000;
    if (seconds < 10) {
      return `${seconds.toFixed(1)}s`;
    }
    return `${Math.floor(seconds)}s`;
  };

  return formatTime(elapsedMs);
};

/**
 * Hook for saving session data
 */
export const useSaveSession = (state: any, context: any) => {
  const saveSession = useCallback(async () => {
    try {
      if (!state.sessionId) {
        console.warn('No session ID available for saving');
        return;
      }

      // Only save local sessions (backend sessions are auto-saved)
      if (state.sessionId.startsWith('local_')) {
        console.log('💾 Saving local session:', state.sessionId);

        // Import LocalResearchStorage dynamically
        const { LocalResearchStorage } = await import('@/lib/api/research');

        // Get current session
        let session = LocalResearchStorage.getSession(state.sessionId);

        if (session) {
          // Update session with current state
          session.messages = state.messages;
          session.message_count = state.messages.length;
          session.updated_at = new Date().toISOString();

          // Check if questionnaire was generated
          const hasQuestionnaire = state.messages.some((msg: any) =>
            msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' ||
            msg.metadata?.comprehensiveQuestions
          );

          if (hasQuestionnaire) {
            session.questions_generated = true;
            session.status = 'completed';
            session.stage = 'completed';
            session.completed_at = new Date().toISOString();
          }

          // Update context data
          if (context.businessIdea) session.business_idea = context.businessIdea;
          if (context.targetCustomer) session.target_customer = context.targetCustomer;
          if (context.problem) session.problem = context.problem;
          if (context.industry) session.industry = context.industry;

          // Save the updated session
          LocalResearchStorage.saveSession(session);
          console.log('✅ Local session saved successfully');
        } else {
          console.warn('⚠️ Local session not found for saving');
        }
      } else {
        console.log('Backend session - auto-saved via API');
      }
    } catch (error) {
      console.error('❌ Failed to save session:', error);
      throw error;
    }
  }, [state.sessionId, state.messages, context]);

  return { saveSession };
};
