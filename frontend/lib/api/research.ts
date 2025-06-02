/**
 * Research API Client
 * Handles all customer research related API calls with local storage for anonymous users
 */

import { RESEARCH_CONFIG, validateMessage, sanitizeInput } from '@/lib/config/research-config';
import {
  withRetry,
  withTimeout,
  ErrorHandler,
  NetworkError,
  ValidationError,
  logError
} from '@/lib/utils/research-error-handler';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Use configuration for storage keys
const STORAGE_KEYS = RESEARCH_CONFIG.storageKeys;

// Generate anonymous user ID
function getOrCreateAnonymousUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';

  let userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
  if (!userId) {
    userId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
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
      const stored = localStorage.getItem(STORAGE_KEYS.SESSIONS);
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

      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
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
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error deleting session from localStorage:', error);
    }
  }

  static getCurrentSession(): ResearchSession | null {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
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
        localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
      }
    } catch (error) {
      console.error('Error saving current session to localStorage:', error);
    }
  }

  static clearAll(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(STORAGE_KEYS.SESSIONS);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
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
  const sessionId = request.session_id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const requestWithAnonymousUser = {
    ...request,
    input: sanitizedInput,
    session_id: sessionId,
    user_id: anonymousUserId,
  };

  // Use retry and timeout wrappers
  return await withRetry(async () => {
    return await withTimeout(async () => {
      const response = await fetch(`${API_BASE_URL}/api/research/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestWithAnonymousUser),
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
          business_idea: result.metadata?.extracted_context?.business_idea || currentSession?.business_idea,
          target_customer: result.metadata?.extracted_context?.target_customer || currentSession?.target_customer,
          problem: result.metadata?.extracted_context?.problem || currentSession?.problem,
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

      return result;
    });
  });
}

/**
 * Generate research questions based on context
 */
export async function generateResearchQuestions(
  context: ResearchContext,
  conversationHistory: Message[]
): Promise<GeneratedQuestions> {
  const response = await fetch(`${API_BASE_URL}/api/research/generate-questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context,
      conversationHistory,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get list of research sessions
 * For anonymous users, returns sessions from localStorage
 */
export async function getResearchSessions(limit: number = 20, userId?: string): Promise<ResearchSession[]> {
  // For anonymous users, return local sessions only
  if (!userId || userId.startsWith('anon_')) {
    const localSessions = LocalResearchStorage.getSessions();
    return localSessions
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, limit);
  }

  // For authenticated users, fetch from backend
  const params = new URLSearchParams({ limit: limit.toString() });
  if (userId) {
    params.append('user_id', userId);
  }

  const response = await fetch(`${API_BASE_URL}/api/research/sessions?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get a specific research session by ID
 * For local sessions, retrieves from localStorage
 */
export async function getResearchSession(sessionId: string): Promise<ResearchSession> {
  // Check if it's a local session first
  if (sessionId.startsWith('local_')) {
    const localSession = LocalResearchStorage.getSession(sessionId);
    if (localSession) {
      return localSession;
    }
    throw new Error('Local session not found');
  }

  // For backend sessions, fetch from API
  const response = await fetch(`${API_BASE_URL}/api/research/sessions/${sessionId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete a research session
 * For local sessions, removes from localStorage
 */
export async function deleteResearchSession(sessionId: string): Promise<void> {
  // Check if it's a local session first
  if (sessionId.startsWith('local_')) {
    LocalResearchStorage.deleteSession(sessionId);
    return;
  }

  // For backend sessions, delete via API
  const response = await fetch(`${API_BASE_URL}/api/research/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
  }
}

/**
 * Test Gemini connection
 */
export async function testGeminiConnection(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/research/test-gemini`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
