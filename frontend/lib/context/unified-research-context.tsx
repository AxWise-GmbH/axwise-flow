'use client';

/**
 * Unified Research Context Provider
 *
 * Single source of truth for all research state:
 * - Session management
 * - Messages and conversation
 * - Business context
 * - Questionnaire data
 * - Sync status
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { sessionManager, UnifiedSession } from '@/lib/session/unified-session-manager';
import { Message } from '@/lib/api/research';

// Types
export interface BusinessContext {
  businessIdea: string;
  targetCustomer: string;
  problem: string;
  industry: string;
}

export interface QuestionnaireData {
  primaryStakeholders: any[];
  secondaryStakeholders: any[];
  timeEstimate: any;
  generated: boolean;
  generatedAt?: string;
}

export interface UnifiedResearchState {
  // Session
  currentSession: UnifiedSession | null;
  sessionLoading: boolean;

  // Messages
  messages: Message[];
  isLoading: boolean;

  // Business Context
  businessContext: BusinessContext;

  // Questionnaire
  questionnaire: QuestionnaireData;

  // UI State
  conversationStarted: boolean;
  currentSuggestions: string[];

  // Sync Status
  syncStatus: {
    isOnline: boolean;
    pendingSyncs: number;
    lastSyncAt?: string;
    syncError?: string;
  };
}

// Actions
type UnifiedResearchAction =
  | { type: 'SET_SESSION'; payload: UnifiedSession | null }
  | { type: 'SET_SESSION_LOADING'; payload: boolean }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'UPDATE_BUSINESS_CONTEXT'; payload: Partial<BusinessContext> }
  | { type: 'SET_QUESTIONNAIRE'; payload: QuestionnaireData }
  | { type: 'SET_CONVERSATION_STARTED'; payload: boolean }
  | { type: 'SET_SUGGESTIONS'; payload: string[] }
  | { type: 'UPDATE_SYNC_STATUS'; payload: Partial<UnifiedResearchState['syncStatus']> }
  | { type: 'RESET_STATE' };

// Initial state
const initialState: UnifiedResearchState = {
  currentSession: null,
  sessionLoading: false,
  messages: [],
  isLoading: false,
  businessContext: {
    businessIdea: '',
    targetCustomer: '',
    problem: '',
    industry: 'general'
  },
  questionnaire: {
    primaryStakeholders: [],
    secondaryStakeholders: [],
    timeEstimate: null,
    generated: false
  },
  conversationStarted: false,
  currentSuggestions: [],
  syncStatus: {
    isOnline: true,
    pendingSyncs: 0
  }
};

// Reducer
function unifiedResearchReducer(
  state: UnifiedResearchState,
  action: UnifiedResearchAction
): UnifiedResearchState {
  switch (action.type) {
    case 'SET_SESSION':
      // Only update if session actually changed to prevent infinite loops
      if (state.currentSession?.session_id === action.payload?.session_id) {
        return state;
      }
      return {
        ...state,
        currentSession: action.payload,
        businessContext: action.payload ? {
          businessIdea: action.payload.business_idea || '',
          targetCustomer: action.payload.target_customer || '',
          problem: action.payload.problem || '',
          industry: action.payload.industry || 'general'
        } : state.businessContext,
        messages: action.payload?.messages || [],
        questionnaire: {
          ...state.questionnaire,
          generated: action.payload?.questions_generated || false
        }
      };

    case 'SET_SESSION_LOADING':
      return { ...state, sessionLoading: action.payload };

    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'UPDATE_BUSINESS_CONTEXT':
      return {
        ...state,
        businessContext: { ...state.businessContext, ...action.payload }
      };

    case 'SET_QUESTIONNAIRE':
      return { ...state, questionnaire: action.payload };

    case 'SET_CONVERSATION_STARTED':
      return { ...state, conversationStarted: action.payload };

    case 'SET_SUGGESTIONS':
      return { ...state, currentSuggestions: action.payload };

    case 'UPDATE_SYNC_STATUS':
      return {
        ...state,
        syncStatus: { ...state.syncStatus, ...action.payload }
      };

    case 'RESET_STATE':
      return { ...initialState };

    default:
      return state;
  }
}

// Context
const UnifiedResearchContext = createContext<{
  state: UnifiedResearchState;
  actions: {
    // Session Management
    loadSession: (sessionId: string) => Promise<void>;
    createSession: (sessionData?: Partial<UnifiedSession>) => Promise<UnifiedSession>;
    saveCurrentSession: () => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;

    // Message Management
    addMessage: (message: Message) => void;
    setMessages: (messages: Message[]) => void;
    clearMessages: () => void;

    // Business Context
    updateBusinessContext: (updates: Partial<BusinessContext>) => void;

    // Questionnaire
    setQuestionnaire: (questionnaire: QuestionnaireData) => void;
    markQuestionnaireGenerated: () => void;

    // UI State
    setLoading: (loading: boolean) => void;
    setConversationStarted: (started: boolean) => void;
    setSuggestions: (suggestions: string[]) => void;

    // Sync Management
    forcSync: () => Promise<void>;

    // Reset
    resetState: () => void;
  };
} | null>(null);

// Provider Component
export function UnifiedResearchProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(unifiedResearchReducer, initialState);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      dispatch({ type: 'UPDATE_SYNC_STATUS', payload: { isOnline: true } });
      sessionManager.syncPendingSessions();
    };

    const handleOffline = () => {
      dispatch({ type: 'UPDATE_SYNC_STATUS', payload: { isOnline: false } });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-save session when state changes (disabled to prevent infinite loops)
  // TODO: Re-implement auto-save with proper dependency management
  /*
  useEffect(() => {
    if (state.currentSession && state.messages.length > 0) {
      const autoSave = async () => {
        try {
          const updatedSession: UnifiedSession = {
            ...state.currentSession!,
            messages: state.messages,
            message_count: state.messages.length,
            business_idea: state.businessContext.businessIdea,
            target_customer: state.businessContext.targetCustomer,
            problem: state.businessContext.problem,
            industry: state.businessContext.industry,
            questions_generated: state.questionnaire.generated,
            updated_at: new Date().toISOString()
          };

          await sessionManager.saveSession(updatedSession);
          dispatch({ type: 'SET_SESSION', payload: updatedSession });
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      };

      // Debounce auto-save
      const timeoutId = setTimeout(autoSave, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [state.messages, state.businessContext, state.questionnaire.generated]);
  */

  // Actions
  const actions = {
    // Session Management
    loadSession: useCallback(async (sessionId: string) => {
      dispatch({ type: 'SET_SESSION_LOADING', payload: true });
      try {
        const session = await sessionManager.getSession(sessionId);
        dispatch({ type: 'SET_SESSION', payload: session });
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        dispatch({ type: 'SET_SESSION_LOADING', payload: false });
      }
    }, []),

    createSession: useCallback(async (sessionData?: Partial<UnifiedSession>) => {
      const session = await sessionManager.createSession({
        ...sessionData,
        business_idea: state.businessContext.businessIdea,
        target_customer: state.businessContext.targetCustomer,
        problem: state.businessContext.problem,
        industry: state.businessContext.industry
      });
      dispatch({ type: 'SET_SESSION', payload: session });
      return session;
    }, [state.businessContext]),

    saveCurrentSession: useCallback(async () => {
      if (!state.currentSession) return;

      const updatedSession: UnifiedSession = {
        ...state.currentSession,
        messages: state.messages,
        message_count: state.messages.length,
        business_idea: state.businessContext.businessIdea,
        target_customer: state.businessContext.targetCustomer,
        problem: state.businessContext.problem,
        industry: state.businessContext.industry,
        questions_generated: state.questionnaire.generated,
        updated_at: new Date().toISOString()
      };

      await sessionManager.saveSession(updatedSession);
      dispatch({ type: 'SET_SESSION', payload: updatedSession });
    }, [state.currentSession, state.messages, state.businessContext, state.questionnaire.generated]),

    deleteSession: useCallback(async (sessionId: string) => {
      await sessionManager.deleteSession(sessionId);
      if (state.currentSession?.session_id === sessionId) {
        dispatch({ type: 'RESET_STATE' });
      }
    }, [state.currentSession]),

    // Message Management
    addMessage: useCallback((message: Message) => {
      dispatch({ type: 'ADD_MESSAGE', payload: message });
    }, []),

    setMessages: useCallback((messages: Message[]) => {
      dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, []),

    clearMessages: useCallback(() => {
      dispatch({ type: 'SET_MESSAGES', payload: [] });
    }, []),

    // Business Context
    updateBusinessContext: useCallback((updates: Partial<BusinessContext>) => {
      dispatch({ type: 'UPDATE_BUSINESS_CONTEXT', payload: updates });
    }, []),

    // Questionnaire
    setQuestionnaire: useCallback((questionnaire: QuestionnaireData) => {
      dispatch({ type: 'SET_QUESTIONNAIRE', payload: questionnaire });
    }, []),

    markQuestionnaireGenerated: useCallback(() => {
      dispatch({
        type: 'SET_QUESTIONNAIRE',
        payload: {
          ...state.questionnaire,
          generated: true,
          generatedAt: new Date().toISOString()
        }
      });
    }, [state.questionnaire]),

    // UI State
    setLoading: useCallback((loading: boolean) => {
      dispatch({ type: 'SET_LOADING', payload: loading });
    }, []),

    setConversationStarted: useCallback((started: boolean) => {
      dispatch({ type: 'SET_CONVERSATION_STARTED', payload: started });
    }, []),

    setSuggestions: useCallback((suggestions: string[]) => {
      dispatch({ type: 'SET_SUGGESTIONS', payload: suggestions });
    }, []),

    // Sync Management
    forcSync: useCallback(async () => {
      try {
        await sessionManager.syncPendingSessions();
        dispatch({
          type: 'UPDATE_SYNC_STATUS',
          payload: { lastSyncAt: new Date().toISOString(), syncError: undefined }
        });
      } catch (error) {
        dispatch({
          type: 'UPDATE_SYNC_STATUS',
          payload: { syncError: error instanceof Error ? error.message : 'Sync failed' }
        });
      }
    }, []),

    // Reset
    resetState: useCallback(() => {
      dispatch({ type: 'RESET_STATE' });
    }, [])
  };

  return (
    <UnifiedResearchContext.Provider value={{ state, actions }}>
      {children}
    </UnifiedResearchContext.Provider>
  );
}

// Hook
export function useUnifiedResearch() {
  const context = useContext(UnifiedResearchContext);
  if (!context) {
    throw new Error('useUnifiedResearch must be used within UnifiedResearchProvider');
  }
  return context;
}
