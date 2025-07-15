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
  suggestions?: string[]; // Direct suggestions field for conversation routines
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
      const sessions = stored ? JSON.parse(stored) : [];

      // Process sessions to set questions_generated flag based on message content
      return sessions.map((session: any) => {
        // Check if session has questionnaire data in messages - use same logic as questionnaire page
        // Also check for COMPREHENSIVE_QUESTIONS_COMPONENT content type
        const hasQuestionnaire = session.messages?.some((msg: any) =>
          msg.metadata?.comprehensiveQuestions ||
          (msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions)
        );

        return {
          ...session,
          questions_generated: hasQuestionnaire || session.questions_generated || false,
          isLocal: true
        };
      });
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

      // Debug logging for suggestions
      console.log('🔧 Raw API response suggestions:', result.suggestions);
      console.log('🔧 Raw API response structure:', {
        content: result.content?.substring(0, 50) + '...',
        suggestions: result.suggestions,
        metadata: result.metadata,
        context: result.context
      });

      // Store the conversation both locally and on backend
      if (typeof window !== 'undefined') {
        const currentSession = LocalResearchStorage.getCurrentSession();
        const messages = currentSession?.messages || [];

        // Add user message
        const userMessage: Message = {
          id: `user_${Date.now()}`,
          content: request.input,
          role: 'user' as const,
          timestamp: new Date().toISOString(),
        };
        messages.push(userMessage);

        // Add assistant response
        const assistantMessage: Message = {
          id: `assistant_${Date.now()}`,
          content: result.content,
          role: 'assistant' as const,
          timestamp: new Date().toISOString(),
          metadata: result.metadata,
        };
        messages.push(assistantMessage);

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

        // If questions were generated, ensure they're properly saved as a questionnaire component
        if (result.questions && result.should_generate_questions) {
          console.log('💾 Ensuring questionnaire is properly saved in conversation routines...');

          // Ensure messages array exists
          if (!session.messages) {
            session.messages = [];
          }

          // Check if we already have a questionnaire component
          const hasQuestionnaireComponent = session.messages.some(msg =>
            msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' &&
            msg.metadata?.comprehensiveQuestions
          );

          if (!hasQuestionnaireComponent) {
            console.log('🔧 Adding questionnaire component to conversation routines session');

            // Add questionnaire component message
            const questionnaireMessage: Message = {
              id: `questionnaire_${Date.now()}`,
              content: 'COMPREHENSIVE_QUESTIONS_COMPONENT',
              role: 'assistant',
              timestamp: new Date().toISOString(),
              metadata: {
                type: 'component',
                comprehensiveQuestions: result.questions,
                businessContext: session.business_idea
              }
            };

            session.messages.push(questionnaireMessage);
            session.message_count = session.messages.length;
          }

          // Ensure session is marked as completed with questionnaire
          session.questions_generated = true;
          session.status = 'completed';
          session.stage = 'completed';
          session.completed_at = new Date().toISOString();
        }

        LocalResearchStorage.saveSession(session);
        LocalResearchStorage.setCurrentSession(session);
      }

      // Convert Conversation Routines response to expected format
      const convertedResult: ChatResponse = {
        content: result.content,
        suggestions: result.suggestions, // Put suggestions at top level for extractSuggestions function
        metadata: {
          ...result.metadata,
          suggestions: result.suggestions, // Also keep in metadata for backward compatibility
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

      // Debug logging for converted result
      console.log('🔧 Converted result suggestions:', convertedResult.suggestions);
      console.log('🔧 Converted result metadata suggestions:', convertedResult.metadata?.suggestions);

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
 * Clean up empty sessions (sessions with 0 messages and no questionnaires)
 */
export async function cleanupEmptySessions(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/research/sessions?limit=100`);
    if (!response.ok) return;

    const sessions = await response.json();
    const emptySessions = sessions.filter((session: any) =>
      !session.questions_generated &&
      (!session.messages || session.messages.length === 0) &&
      session.session_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) // Only UUID sessions, not local_* sessions
    );

    console.log(`🧹 Cleaning up ${emptySessions.length} empty sessions...`);

    for (const session of emptySessions) {
      try {
        await fetch(`${API_BASE_URL}/api/research/sessions/${session.session_id}`, {
          method: 'DELETE'
        });
        console.log(`🗑️ Deleted empty session: ${session.session_id}`);
      } catch (error) {
        console.warn(`Failed to delete session ${session.session_id}:`, error);
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup empty sessions:', error);
  }
}

/**
 * Sync local session with questionnaire to database
 */
export async function syncLocalSessionToDatabase(session: ResearchSession): Promise<void> {
  if (!session.questions_generated || !session.messages) return;

  try {
    // Find questionnaire message
    const questionnaireMessage = session.messages.find((msg: any) =>
      msg.metadata?.comprehensiveQuestions
    );

    if (!questionnaireMessage?.metadata?.comprehensiveQuestions) return;

    // Create/update session in database with the original session_id
    const sessionData = {
      session_id: session.session_id,  // Preserve original session_id
      user_id: session.user_id,
      business_idea: session.business_idea,
      target_customer: session.target_customer,
      problem: session.problem,
      industry: session.industry,
      stage: session.stage,
      status: session.status,
      messages: session.messages,
      conversation_context: "",
      questions_generated: true
    };

    // Try to create session with specific ID
    let response = await fetch(`${API_BASE_URL}/api/research/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    });

    // If session already exists (500 error due to unique constraint), try to update it
    if (!response.ok && (response.status === 400 || response.status === 500)) {
      console.log(`🔄 Session ${session.session_id} already exists, updating instead...`);
      response = await fetch(`${API_BASE_URL}/api/research/sessions/${session.session_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_idea: sessionData.business_idea,
          target_customer: sessionData.target_customer,
          problem: sessionData.problem,
          industry: sessionData.industry,
          stage: sessionData.stage,
          status: sessionData.status,
          messages: sessionData.messages,
          conversation_context: sessionData.conversation_context,
          questions_generated: sessionData.questions_generated
        })
      });
    }

    if (response.ok) {
      // Save questionnaire data
      await fetch(`${API_BASE_URL}/api/research/sessions/${session.session_id}/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionnaireMessage.metadata.comprehensiveQuestions)
      });

      console.log(`✅ Synced local session ${session.session_id} to database`);
    }
  } catch (error) {
    console.warn(`Failed to sync session ${session.session_id} to database:`, error);
  }
}

/**
 * Get list of research sessions
 * Fetches from backend API with localStorage fallback and syncs local questionnaires
 */
export async function getResearchSessions(limit: number = 20, userId?: string): Promise<ResearchSession[]> {
  try {
    // Try to fetch from backend first
    const response = await fetch(`${API_BASE_URL}/api/research/sessions?limit=${limit}${userId ? `&user_id=${userId}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const backendSessions = await response.json();

      // Convert backend format to frontend format and fetch questionnaire data
      const convertedSessions: ResearchSession[] = await Promise.all(backendSessions.map(async (session: any) => {
        // If session has questionnaire data, add it to messages for compatibility
        const messages = session.messages || [];
        let questionnaireData = session.research_questions;

        // If session has questionnaires but no research_questions data, fetch it separately
        if (session.questions_generated && !questionnaireData) {
          try {
            console.log(`🔄 Fetching questionnaire data for session ${session.session_id}`);
            const questionnaireResponse = await fetch(`${API_BASE_URL}/api/research/sessions/${session.session_id}/questionnaire`);
            if (questionnaireResponse.ok) {
              const questionnaireResult = await questionnaireResponse.json();
              questionnaireData = questionnaireResult.questionnaire;
              console.log(`✅ Fetched questionnaire data for session ${session.session_id}`);
            }
          } catch (error) {
            console.warn(`Failed to fetch questionnaire for session ${session.session_id}:`, error);
          }
        }

        console.log(`🔍 Session ${session.session_id} questionnaire data:`, {
          questions_generated: session.questions_generated,
          has_research_questions: !!questionnaireData,
          research_questions_type: typeof questionnaireData,
          research_questions_keys: questionnaireData ? Object.keys(questionnaireData) : null
        });

        if (session.questions_generated && questionnaireData) {
          // Check if questionnaire message already exists
          const hasQuestionnaireMessage = messages.some((msg: any) =>
            msg.metadata?.comprehensiveQuestions
          );

          if (!hasQuestionnaireMessage) {
            // Add questionnaire message for compatibility with frontend logic
            console.log(`🔧 Adding questionnaire message for session ${session.session_id}`);
            messages.push({
              id: `questionnaire_${Date.now()}`,
              content: 'COMPREHENSIVE_QUESTIONS_COMPONENT',
              role: 'assistant',
              timestamp: session.completed_at || session.updated_at,
              metadata: {
                type: 'component',
                comprehensiveQuestions: questionnaireData,
                businessContext: session.business_idea
              }
            });
          }
        }

        const convertedSession = {
          id: session.id,
          session_id: session.session_id,
          user_id: session.user_id,
          business_idea: session.business_idea,
          target_customer: session.target_customer,
          problem: session.problem,
          industry: session.industry,
          stage: session.stage,
          status: session.status,
          questions_generated: session.questions_generated,
          created_at: session.created_at,
          updated_at: session.updated_at,
          completed_at: session.completed_at,
          message_count: session.message_count,
          messages: messages,
          isLocal: false
        };

        console.log(`🔍 Converted session ${session.session_id}:`, {
          questions_generated: convertedSession.questions_generated,
          messages_count: convertedSession.messages?.length || 0,
          has_questionnaire_message: convertedSession.messages?.some(m => m.metadata?.comprehensiveQuestions)
        });

        return convertedSession;
      }));

      // Merge with local sessions for offline support
      let localSessions = LocalResearchStorage.getSessions();

      // Check if we should force restore (for testing)
      const forceRestore = window.location.search.includes('forceRestore=true');
      if (forceRestore) {
        console.log(`🔧 Force restore mode enabled`);
      }

      // Sync local sessions with questionnaires to database (background operation)
      // Temporarily disabled to test auto-restore
      if (!forceRestore) {
        localSessions
          .filter(session => session.questions_generated && session.session_id.startsWith('local_'))
          .forEach(session => {
            syncLocalSessionToDatabase(session).catch(err =>
              console.warn('Background sync failed:', err)
            );
          });
      }

      // Clean up empty sessions (background operation)
      cleanupEmptySessions().catch(err =>
        console.warn('Background cleanup failed:', err)
      );

      // Auto-restore: If backend has sessions that don't exist locally, restore them to localStorage
      let restoredCount = 0;
      console.log(`🔍 Auto-restore check: ${convertedSessions.length} backend sessions, ${localSessions.length} local sessions`);

      convertedSessions.forEach(backendSession => {
        const existsLocally = localSessions.some(local => local.session_id === backendSession.session_id);
        console.log(`🔍 Session ${backendSession.session_id}: existsLocally=${existsLocally}, isLocal=${backendSession.session_id.startsWith('local_')}, hasQuestions=${backendSession.questions_generated}`);

        if ((forceRestore || !existsLocally) && backendSession.session_id.startsWith('local_') && backendSession.questions_generated) {
          // Restore this session to localStorage for offline access
          const restoredSession = {
            ...backendSession,
            isLocal: true
          };
          console.log(`🔄 ${forceRestore ? 'Force-restoring' : 'Auto-restoring'} session:`, restoredSession);
          LocalResearchStorage.saveSession(restoredSession);
          console.log(`🔄 ${forceRestore ? 'Force-restored' : 'Auto-restored'} session ${backendSession.session_id} to localStorage`);

          // Debug: Verify the session was actually saved
          const savedSession = LocalResearchStorage.getSession(backendSession.session_id);
          console.log(`🔍 Verification - Session ${backendSession.session_id} saved:`, !!savedSession);

          // Debug: Check localStorage directly
          const directCheck = localStorage.getItem(STORAGE_KEYS.sessions);
          console.log(`🔍 Direct localStorage check:`, directCheck ? 'EXISTS' : 'EMPTY');
          restoredCount++;
        }
      });

      // If we restored any sessions, refresh the local sessions list
      if (restoredCount > 0) {
        localSessions = LocalResearchStorage.getSessions();
        console.log(`✅ Auto-restored ${restoredCount} sessions to localStorage`);
      }

      // Prioritize local sessions - they may have questionnaire data that backend doesn't have
      const mergedSessions = [...localSessions];

      // Add backend sessions that don't exist locally
      convertedSessions.forEach(backendSession => {
        const existsLocally = localSessions.some(local => local.session_id === backendSession.session_id);
        if (!existsLocally) {
          mergedSessions.push(backendSession);
        }
      });

      const allSessions = mergedSessions;

      return allSessions
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, limit);
    } else {
      throw new Error(`Backend responded with ${response.status}`);
    }
  } catch (error) {
    console.warn('Failed to fetch sessions from backend, using localStorage:', error);

    // Fallback to local sessions
    const localSessions = LocalResearchStorage.getSessions();
    return localSessions
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, limit);
  }
}

/**
 * Get a specific research session by ID
 * Fetches from backend API with localStorage fallback
 */
export async function getResearchSession(sessionId: string): Promise<ResearchSession> {
  try {
    // Try to fetch from backend first
    const response = await fetch(`${API_BASE_URL}/api/research/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const backendSession = await response.json();

      // Fetch messages separately
      let messages: Message[] = [];
      try {
        const messagesResponse = await fetch(`${API_BASE_URL}/api/research/sessions/${sessionId}/messages`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          messages = messagesData.messages || [];
        }
      } catch (error) {
        console.warn('Failed to fetch messages for session:', error);
      }

      // Convert backend format to frontend format
      const convertedSession: ResearchSession = {
        id: backendSession.id,
        session_id: backendSession.session_id,
        user_id: backendSession.user_id,
        business_idea: backendSession.business_idea,
        target_customer: backendSession.target_customer,
        problem: backendSession.problem,
        industry: backendSession.industry,
        stage: backendSession.stage,
        status: backendSession.status,
        questions_generated: backendSession.questions_generated,
        created_at: backendSession.created_at,
        updated_at: backendSession.updated_at,
        completed_at: backendSession.completed_at,
        message_count: messages.length,
        messages: messages,
        isLocal: false
      };

      return convertedSession;
    } else {
      throw new Error(`Backend responded with ${response.status}`);
    }
  } catch (error) {
    console.warn('Failed to fetch session from backend, trying localStorage:', error);

    // Fallback to local session
    const localSession = LocalResearchStorage.getSession(sessionId);
    if (localSession) {
      return localSession;
    }
    throw new Error('Session not found');
  }
}

/**
 * Create a new research session
 * Creates on backend with localStorage fallback
 */
export async function createResearchSession(sessionData: {
  business_idea?: string;
  target_customer?: string;
  problem?: string;
  user_id?: string;
}): Promise<ResearchSession> {
  try {
    // Try to create on backend first
    const response = await fetch(`${API_BASE_URL}/api/research/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionData),
    });

    if (response.ok) {
      const backendSession = await response.json();

      // Convert backend format to frontend format
      const convertedSession: ResearchSession = {
        id: backendSession.id,
        session_id: backendSession.session_id,
        user_id: backendSession.user_id,
        business_idea: backendSession.business_idea,
        target_customer: backendSession.target_customer,
        problem: backendSession.problem,
        industry: backendSession.industry,
        stage: backendSession.stage,
        status: backendSession.status,
        questions_generated: backendSession.questions_generated,
        created_at: backendSession.created_at,
        updated_at: backendSession.updated_at,
        completed_at: backendSession.completed_at,
        message_count: 0,
        messages: [],
        isLocal: false
      };

      return convertedSession;
    } else {
      throw new Error(`Backend responded with ${response.status}`);
    }
  } catch (error) {
    console.warn('Failed to create session on backend, creating locally:', error);

    // Fallback to local session creation
    const sessionId = `local_${Date.now()}`;
    const localSession: ResearchSession = {
      id: Date.now(), // Use timestamp as numeric ID for local sessions
      session_id: sessionId,
      user_id: sessionData.user_id,
      business_idea: sessionData.business_idea,
      target_customer: sessionData.target_customer,
      problem: sessionData.problem,
      industry: 'general',
      stage: 'initial',
      status: 'active',
      questions_generated: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: undefined,
      message_count: 0,
      messages: [],
      isLocal: true
    };

    LocalResearchStorage.saveSession(localSession);
    return localSession;
  }
}

/**
 * Delete a research session
 * Deletes from backend and localStorage
 */
export async function deleteResearchSession(sessionId: string): Promise<void> {
  try {
    // Try to delete from backend first
    const response = await fetch(`${API_BASE_URL}/api/research/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to delete session from backend: ${response.status}`);
    }
  } catch (error) {
    console.warn('Failed to delete session from backend:', error);
  }

  // Always delete from localStorage as well
  LocalResearchStorage.deleteSession(sessionId);
}

/**
 * Test Gemini connection - DEPRECATED
 * This endpoint no longer exists
 */
export async function testGeminiConnection(): Promise<any> {
  throw new Error('Test endpoint no longer available - use conversation routines health check');
}
