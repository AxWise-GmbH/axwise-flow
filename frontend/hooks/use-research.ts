'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateResearchQuestions,
  LocalResearchStorage,
  getResearchSession,
  type ResearchSession as APIResearchSession,
  type Message,
  type GeneratedQuestions as APIGeneratedQuestions
} from '@/lib/api/research';

export interface ResearchQuestion {
  id: string;
  question: string;
  category: 'discovery' | 'validation' | 'follow_up';
  purpose: string;
  followUpPrompts?: string[];
}

export interface ResearchSession {
  id: string;
  businessIdea: string;
  targetCustomer: string;
  problem: string;
  stage: string;
  questions: ResearchQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchContext {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  stage?: string;
  questionsGenerated?: boolean;
  multiStakeholderConsidered?: boolean;
}

export interface GeneratedQuestions {
  problemDiscovery: string[];
  solutionValidation: string[];
  followUp: string[];
}

interface UseResearchReturn {
  // State
  currentSession: ResearchSession | null;
  context: ResearchContext;
  questions: GeneratedQuestions | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  updateContext: (updates: Partial<ResearchContext>) => void;
  generateQuestions: (conversationHistory: any[]) => Promise<GeneratedQuestions | null>;
  saveSession: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  exportQuestions: (format: 'pdf' | 'json' | 'csv') => Promise<void>;
  continueToAnalysis: () => void;

  // Utilities
  getCompletionPercentage: () => number;
  getCurrentStage: () => 'initial' | 'business_idea' | 'target_customer' | 'problem_validation' | 'solution_validation';
}

export function useResearch(): UseResearchReturn {
  const [currentSession, setCurrentSession] = useState<ResearchSession | null>(null);
  const [context, setContext] = useState<ResearchContext>({});
  const [questions, setQuestions] = useState<GeneratedQuestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Update context
  const updateContext = useCallback((updates: Partial<ResearchContext>) => {
    setContext(prev => ({ ...prev, ...updates }));
  }, []);

  // Generate questions using the API
  const generateQuestions = useCallback(async (conversationHistory: Message[]): Promise<GeneratedQuestions | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await generateResearchQuestions(context, conversationHistory);
      const generatedQuestions: GeneratedQuestions = {
        problemDiscovery: data.problemDiscovery || [],
        solutionValidation: data.solutionValidation || [],
        followUp: data.followUp || [],
      };

      setQuestions(generatedQuestions);
      updateContext({ questionsGenerated: true });

      // Save to local storage
      const currentSession = LocalResearchStorage.getCurrentSession();
      if (currentSession) {
        const updatedSession = {
          ...currentSession,
          questions_generated: true,
          updated_at: new Date().toISOString(),
        };
        LocalResearchStorage.saveSession(updatedSession);
        LocalResearchStorage.setCurrentSession(updatedSession);
      }

      return generatedQuestions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate questions';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [context, updateContext]);

  // Save session to local storage (for anonymous users)
  const saveSession = useCallback(async () => {
    if (!context.businessIdea || !questions) return;

    setIsLoading(true);
    try {
      const currentSession = LocalResearchStorage.getCurrentSession();
      const sessionId = currentSession?.session_id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const sessionData: APIResearchSession = {
        id: currentSession?.id || Date.now(),
        session_id: sessionId,
        user_id: currentSession?.user_id || 'anonymous',
        business_idea: context.businessIdea,
        target_customer: context.targetCustomer || '',
        problem: context.problem || '',
        industry: currentSession?.industry || 'general',
        stage: context.stage || 'completed',
        status: 'active',
        questions_generated: true,
        created_at: currentSession?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: currentSession?.message_count || 0,
        messages: currentSession?.messages || [],
        isLocal: true,
      };

      LocalResearchStorage.saveSession(sessionData);
      LocalResearchStorage.setCurrentSession(sessionData);

      // Convert to hook format for state
      const hookSession: ResearchSession = {
        id: sessionData.session_id,
        businessIdea: sessionData.business_idea || '',
        targetCustomer: sessionData.target_customer || '',
        problem: sessionData.problem || '',
        stage: sessionData.stage,
        questions: [
          ...questions.problemDiscovery.map((q, i) => ({
            id: `discovery_${i}`,
            question: q,
            category: 'discovery' as const,
            purpose: 'Understand the problem space',
          })),
          ...questions.solutionValidation.map((q, i) => ({
            id: `validation_${i}`,
            question: q,
            category: 'validation' as const,
            purpose: 'Validate solution fit',
          })),
          ...questions.followUp.map((q, i) => ({
            id: `followup_${i}`,
            question: q,
            category: 'follow_up' as const,
            purpose: 'Gather additional insights',
          })),
        ],
        createdAt: new Date(sessionData.created_at),
        updatedAt: new Date(sessionData.updated_at),
      };

      setCurrentSession(hookSession);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save session';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [context, questions]);

  // Load existing session from local storage or API
  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const session = await getResearchSession(sessionId);

      // Convert API session to hook format
      const hookSession: ResearchSession = {
        id: session.session_id,
        businessIdea: session.business_idea || '',
        targetCustomer: session.target_customer || '',
        problem: session.problem || '',
        stage: session.stage,
        questions: [], // Will be populated from messages or generated questions
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
      };

      setCurrentSession(hookSession);

      // Reconstruct context from session
      setContext({
        businessIdea: session.business_idea,
        targetCustomer: session.target_customer,
        problem: session.problem,
        stage: session.stage,
        questionsGenerated: session.questions_generated,
      });

      // If it's a local session, set it as current
      if (session.isLocal) {
        LocalResearchStorage.setCurrentSession(session);
      }

      // For now, clear questions - they'll be regenerated if needed
      setQuestions(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load session';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Export questions in different formats
  const exportQuestions = useCallback(async (format: 'pdf' | 'json' | 'csv') => {
    if (!questions) {
      setError('No questions available to export');
      return;
    }

    try {
      // Create export content
      const exportData = {
        businessIdea: context.businessIdea || 'Not specified',
        targetCustomer: context.targetCustomer || 'Not specified',
        problem: context.problem || 'Not specified',
        questions: {
          problemDiscovery: questions.problemDiscovery,
          solutionValidation: questions.solutionValidation,
          followUp: questions.followUp
        },
        generatedAt: new Date().toISOString()
      };

      if (format === 'json') {
        // Export as JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'research-questions.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // For PDF/CSV, create a formatted text version
        const textContent = `Customer Research Questions
Generated: ${new Date().toLocaleDateString()}

Business Idea: ${exportData.businessIdea}
Target Customer: ${exportData.targetCustomer}
Problem: ${exportData.problem}

PROBLEM DISCOVERY QUESTIONS:
${questions.problemDiscovery.map((q, i) => `${i + 1}. ${q}`).join('\n')}

SOLUTION VALIDATION QUESTIONS:
${questions.solutionValidation.map((q, i) => `${i + 1}. ${q}`).join('\n')}

FOLLOW-UP QUESTIONS:
${questions.followUp.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `research-questions.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export questions';
      setError(errorMessage);
    }
  }, [questions, context]);

  // Continue to analysis (integrate with your existing dashboard)
  const continueToAnalysis = useCallback(() => {
    // Save session first, then navigate
    saveSession().then(() => {
      router.push('/unified-dashboard/upload');
    });
  }, [saveSession, router]);

  // Get completion percentage
  const getCompletionPercentage = useCallback(() => {
    let completed = 0;
    const total = 4;

    if (context.businessIdea) completed++;
    if (context.targetCustomer) completed++;
    if (context.problem) completed++;
    if (context.questionsGenerated) completed++;

    return Math.round((completed / total) * 100);
  }, [context]);

  // Get current conversation stage
  const getCurrentStage = useCallback((): 'initial' | 'business_idea' | 'target_customer' | 'problem_validation' | 'solution_validation' => {
    if (!context.businessIdea) return 'initial';
    if (!context.targetCustomer) return 'business_idea';
    if (!context.problem) return 'target_customer';
    if (!context.questionsGenerated) return 'problem_validation';
    return 'solution_validation';
  }, [context]);

  // Initialize from localStorage on mount
  useEffect(() => {
    const currentSession = LocalResearchStorage.getCurrentSession();
    if (currentSession) {
      setContext({
        businessIdea: currentSession.business_idea,
        targetCustomer: currentSession.target_customer,
        problem: currentSession.problem,
        stage: currentSession.stage,
        questionsGenerated: currentSession.questions_generated,
      });

      // Convert to hook format
      const hookSession: ResearchSession = {
        id: currentSession.session_id,
        businessIdea: currentSession.business_idea || '',
        targetCustomer: currentSession.target_customer || '',
        problem: currentSession.problem || '',
        stage: currentSession.stage,
        questions: [],
        createdAt: new Date(currentSession.created_at),
        updatedAt: new Date(currentSession.updated_at),
      };

      setCurrentSession(hookSession);
    }
  }, []);

  // Auto-save context changes to localStorage
  useEffect(() => {
    if (context.businessIdea && context.targetCustomer && context.problem) {
      // Auto-save when we have enough context
      const timeoutId = setTimeout(() => {
        if (questions) {
          saveSession();
        }
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [context, questions, saveSession]);

  return {
    // State
    currentSession,
    context,
    questions,
    isLoading,
    error,

    // Actions
    updateContext,
    generateQuestions,
    saveSession,
    loadSession,
    exportQuestions,
    continueToAnalysis,

    // Utilities
    getCompletionPercentage,
    getCurrentStage,
  };
}
