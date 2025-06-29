/**
 * Research API Client - Conversation Routines Architecture
 * Handles all customer research related API calls with local storage for anonymous users
 *
 * USING CONVERSATION ROUTINES: /api/research/conversation-routines/chat endpoint
 * - 2025 Conversation Routines framework by Giorgio Robino
 * - Efficient single-LLM approach with embedded workflow logic
 * - Context-driven decisions without complex state machines
 * - Proactive question generation (max 6 exchanges)
 * - Clean, simple, and highly effective
 */

import { RESEARCH_CONFIG, validateMessage, sanitizeInput } from '@/lib/config/research-config';
import {
  withRetry,
  withTimeout,
  ValidationError
} from '@/lib/utils/research-error-handler';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Use configuration for storage keys
const STORAGE_KEYS = RESEARCH_CONFIG.storageKeys;

// Generate anonymous user ID
function getOrCreateAnonymousUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';

  let userId = localStorage.getItem(STORAGE_KEYS.userId);
  if (!userId) {
    userId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem(STORAGE_KEYS.userId, userId);
  }
  return userId;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string | Date;
  metadata?: Record<string, any>;
}

export interface ResearchContext {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  stage?: string;
  questionsGenerated?: boolean;
  multiStakeholderConsidered?: boolean;
  multiStakeholderDetected?: boolean;
  detectedStakeholders?: {
    primary: string[];
    secondary: string[];
    industry?: string;
  };
}

export interface ChatRequest {
  messages: Message[];
  input: string;
  context?: ResearchContext;
  session_id?: string;
  user_id?: string;
  // Modular V1+V3 options
  enable_enhanced_analysis?: boolean;
  enable_thinking_process?: boolean;
}

export interface ChatResponse {
  content: string;
  metadata?: {
    questionCategory?: string;
    researchStage?: string;
    suggestions?: string[];
    extracted_context?: Record<string, any>;
  };
  questions?: GeneratedQuestions;
  session_id?: string;
  thinking_process?: Array<{
    step: string;
    status: 'in_progress' | 'completed' | 'failed';
    details: string;
    duration_ms: number;
    timestamp: number;
  }>;
  enhanced_analysis?: Record<string, any>;
  performance_metrics?: Record<string, any>;
  api_version?: string;
}

export interface GeneratedQuestions {
  problemDiscovery: string[];
  solutionValidation: string[];
  followUp: string[];
}

export interface ResearchSession {
  id: number;
  session_id: string;
  user_id?: string;
  business_idea?: string;
  target_customer?: string;
  problem?: string;
  industry: string;
  stage: string;
  status: string;
  questions_generated: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  message_count?: number;
  messages?: Message[]; // For local storage
  isLocal?: boolean; // Flag to indicate local storage
}

// Local storage management functions
export class LocalResearchStorage {
  static getSessions(): ResearchSession[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.sessions);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading sessions from localStorage:', error);
      return [];
    }
  }

  static saveSession(session: ResearchSession): void {
    if (typeof window === 'undefined') return;

    try {
      const sessions = this.getSessions();
      const existingIndex = sessions.findIndex(s => s.session_id === session.session_id);

      if (existingIndex >= 0) {
        sessions[existingIndex] = { ...session, updated_at: new Date().toISOString() };
      } else {
        sessions.push({ ...session, isLocal: true });
      }

      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving session to localStorage:', error);
    }
  }

  static getSession(sessionId: string): ResearchSession | null {
    const sessions = this.getSessions();
    return sessions.find(s => s.session_id === sessionId) || null;
  }

  static deleteSession(sessionId: string): void {
    if (typeof window === 'undefined') return;

    try {
      const sessions = this.getSessions().filter(s => s.session_id !== sessionId);
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error deleting session from localStorage:', error);
    }
  }

  static getCurrentSession(): ResearchSession | null {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.currentSession);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading current session from localStorage:', error);
      return null;
    }
  }

  static setCurrentSession(session: ResearchSession | null): void {
    if (typeof window === 'undefined') return;

    try {
      if (session) {
        localStorage.setItem(STORAGE_KEYS.currentSession, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEYS.currentSession);
      }
    } catch (error) {
      console.error('Error saving current session to localStorage:', error);
    }
  }

  static clearAll(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(STORAGE_KEYS.sessions);
      localStorage.removeItem(STORAGE_KEYS.currentSession);
      localStorage.removeItem(STORAGE_KEYS.userId);
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }
}

/**
 * Send a chat message to the research assistant
 * For anonymous users, this only calls the LLM API without storing in database
 */
export async function sendResearchChatMessage(request: ChatRequest): Promise<ChatResponse> {
  // Validate input message
  const validation = validateMessage(request.input);
  if (!validation.isValid) {
    throw new ValidationError(validation.error);
  }

  // Sanitize input
  const sanitizedInput = sanitizeInput(request.input);

  // For anonymous users, use a local session ID and don't store in database
  const anonymousUserId = getOrCreateAnonymousUserId();
  const sessionId = request.session_id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // Convert to Conversation Routines format
  const conversationRoutineRequest = {
    input: sanitizedInput,
    messages: request.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    session_id: sessionId,
    user_id: anonymousUserId,
  };

  // Use retry and timeout wrappers
  return await withRetry(async () => {
    return await withTimeout(async () => {
      const response = await fetch(`${API_BASE_URL}/api/research/conversation-routines/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(conversationRoutineRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      const result = await response.json();

      // Store the conversation locally for anonymous users
      if (typeof window !== 'undefined') {
        const currentSession = LocalResearchStorage.getCurrentSession();
        const messages = currentSession?.messages || [];

        // Add user message
        messages.push({
          id: `user_${Date.now()}`,
          content: request.input,
          role: 'user',
          timestamp: new Date().toISOString(),
        });

        // Add assistant response
        messages.push({
          id: `assistant_${Date.now()}`,
          content: result.content,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          metadata: result.metadata,
        });

        // Update or create session
        const session: ResearchSession = {
          id: Date.now(),
          session_id: sessionId,
          user_id: anonymousUserId,
          business_idea: result.context?.business_idea || result.metadata?.extracted_context?.business_idea || currentSession?.business_idea,
          target_customer: result.context?.target_customer || result.metadata?.extracted_context?.target_customer || currentSession?.target_customer,
          problem: result.context?.problem || result.metadata?.extracted_context?.problem || currentSession?.problem,
          industry: result.metadata?.extracted_context?.industry || currentSession?.industry || 'general',
          stage: result.metadata?.extracted_context?.stage || currentSession?.stage || 'initial',
          status: 'active',
          questions_generated: !!result.questions || currentSession?.questions_generated || false,
          created_at: currentSession?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          message_count: messages.length,
          messages,
          isLocal: true,
        };

        LocalResearchStorage.saveSession(session);
        LocalResearchStorage.setCurrentSession(session);
      }

      // Convert Conversation Routines response to expected format
      const convertedResult: ChatResponse = {
        content: result.content,
        metadata: {
          ...result.metadata,
          suggestions: result.suggestions,
          conversation_routine: true,
          context_completeness: result.context?.get_completeness_score ? result.context.get_completeness_score() :
            (result.context?.business_idea && result.context?.target_customer && result.context?.problem ? 1.0 :
             result.context?.business_idea && result.context?.target_customer ? 0.7 :
             result.context?.business_idea ? 0.4 : 0.0),
          exchange_count: result.context?.exchange_count || 0,
          fatigue_signals: result.context?.user_fatigue_signals || [],
          // Add extracted context for frontend compatibility
          extracted_context: {
            business_idea: result.context?.business_idea,
            target_customer: result.context?.target_customer,
            problem: result.context?.problem,
            questions_generated: result.should_generate_questions || !!result.questions
          }
        },
        questions: result.questions,
        session_id: result.session_id,
        // Map thinking process if available
        thinking_process: result.metadata?.thinking_process || [],
        performance_metrics: result.metadata?.performance_metrics || {},
        api_version: "conversation-routines"
      };

      return convertedResult;
    });
  });
}

/**
 * Generate research questions - DEPRECATED
 * Questions are now generated automatically by conversation routines
 * This function is kept for backward compatibility but not used
 */
export async function generateResearchQuestions(
  context: ResearchContext,
  conversationHistory: Message[]
): Promise<GeneratedQuestions> {
  // This endpoint no longer exists - questions are generated by conversation routines
  throw new Error('Questions are now generated automatically by conversation routines');
}

/**
 * Get list of research sessions
 * Only supports local sessions now (no backend persistence)
 */
export async function getResearchSessions(limit: number = 20, userId?: string): Promise<ResearchSession[]> {
  // Only local sessions are supported now
  const localSessions = LocalResearchStorage.getSessions();
  return localSessions
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
}

/**
 * Get a specific research session by ID
 * Only supports local sessions now
 */
export async function getResearchSession(sessionId: string): Promise<ResearchSession> {
  // Only local sessions are supported
  const localSession = LocalResearchStorage.getSession(sessionId);
  if (localSession) {
    return localSession;
  }
  throw new Error('Session not found');
}

/**
 * Delete a research session
 * Only supports local sessions now
 */
export async function deleteResearchSession(sessionId: string): Promise<void> {
  // Only local sessions are supported
  LocalResearchStorage.deleteSession(sessionId);
}

/**
 * Test Gemini connection - DEPRECATED
 * This endpoint no longer exists
 */
export async function testGeminiConnection(): Promise<any> {
  throw new Error('Test endpoint no longer available - use conversation routines health check');
}
