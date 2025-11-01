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

// Helper function to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add auth in production or when explicitly enabled
  const isProduction = process.env.NODE_ENV === 'production';
  const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';

  if (isProduction || enableClerkValidation) {
    try {
      // For client-side API calls, we need to get the token from the frontend API route
      // This function is used by client-side components, so we can't use server-side auth here
      console.warn('⚠️ Client-side auth token retrieval not implemented in utility function');
      console.warn('⚠️ This should be handled by the frontend API routes instead');
    } catch (error) {
      console.warn('Failed to get auth token:', error);
    }
  } else {
    // Development mode - use development token
    headers['Authorization'] = 'Bearer DEV_TOKEN_REDACTED';
    console.log('🔧 Using development token for API requests');
  }

  return headers;
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
  location?: string; // Added to keep region/location context
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
    full_prompt?: string;
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
  location?: string; // Added to store region/location
  stage: string;
  status: string;
  questions_generated: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  message_count?: number;
  messages?: Message[]; // For local storage
  conversation_context?: string; // Short executive summary/narrative for sidebar
  isLocal?: boolean; // Flag to indicate local storage
}

// Local storage management functions
export class LocalResearchStorage {
  static getSessions(): ResearchSession[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.sessions);
      let sessions = [];

      if (stored) {
        const parsedData = JSON.parse(stored);

        // Handle both object and array formats
        if (Array.isArray(parsedData)) {
          sessions = parsedData;
        } else if (typeof parsedData === 'object' && parsedData !== null) {
          // Convert object to array (keys are session IDs, values are session objects)
          sessions = Object.values(parsedData);
          console.log('🔧 LocalResearchStorage: Converted object format to array format');
        } else {
          console.error('❌ LocalResearchStorage: Unexpected data format:', typeof parsedData);
          sessions = [];
        }
      }

      // Process sessions to set questions_generated flag based on ACTUAL message content
      // REPAIR corrupted sessions instead of removing them
      let repairedCount = 0;
      const repairedSessions = sessions.map((session: any) => {
        // Check for corruption: questions_generated=true but no actual questionnaire data
        const hasMessages = Array.isArray(session.messages) && session.messages.length > 0;
        const hasQuestionnaire = hasMessages && session.messages.some((msg: any) =>
          msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' &&
          msg.metadata?.comprehensiveQuestions
        );

        // Auto-repair corrupted sessions by resetting the flag
        if (session.questions_generated && !hasQuestionnaire) {
          console.log(`🔧 REPAIRING: Fixing corrupted session ${session.session_id} (resetting questions_generated to false)`);
          session.questions_generated = false;
          repairedCount++;
        }

        return session;
      });

      // If we repaired corrupted sessions, update localStorage
      if (repairedCount > 0) {
        console.log(`🔧 REPAIR: Fixed ${repairedCount} corrupted sessions in localStorage`);
        try {
          localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(repairedSessions));
        } catch (error) {
          console.error('Failed to update localStorage after repair:', error);
        }
      }

      return repairedSessions.map((session: any) => {
        // Check if session has questionnaire data in messages - support both new and legacy formats
        const hasQuestionnaire = Array.isArray(session.messages) && session.messages.some((msg: any) => {
          const meta = msg?.metadata || {};
          const hasModern = !!meta.comprehensiveQuestions;
          const hasLegacy = !!meta.questionnaire || !!meta.comprehensive_questions;
          const hasComponent = msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && (hasModern || hasLegacy);
          return hasModern || hasLegacy || hasComponent;
        });

        // Debug logging for remaining data inconsistency detection
        if (session.questions_generated && !hasQuestionnaire) {
          console.log(`🚨 DATA MISMATCH: Session ${session.session_id} flagged questions_generated=true but no questionnaire message detected`);
          console.log(`   Business idea: ${session.business_idea}`);
          console.log(`   Messages count: ${session.messages?.length || 0}`);
          console.log(`   Stored questions_generated: ${session.questions_generated}`);
        }

        return {
          ...session,
          // Fix the questions_generated flag based on actual message content
          questions_generated: hasQuestionnaire,
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

  static cleanupStaleQuestionnaires(): void {
    if (typeof window === 'undefined') return;

    console.log('🧹 Cleaning up stale questionnaire data...');

    try {
      const sessions = this.getSessions();
      let cleanedCount = 0;

      const cleanedSessions = sessions.map(session => {
        if (session.messages) {
          // Remove duplicate questionnaire messages, keep only the latest
          const questionnaireMessages = session.messages.filter(msg =>
            msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions
          );

          if (questionnaireMessages.length > 1) {
            // Keep only the most recent questionnaire message
            const latestQuestionnaire = questionnaireMessages.sort((a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )[0];

            // Remove all questionnaire messages and add back only the latest
            session.messages = session.messages.filter(msg =>
              !(msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions)
            );
            session.messages.push(latestQuestionnaire);

            cleanedCount++;
            console.log(`🔧 Cleaned ${questionnaireMessages.length - 1} duplicate questionnaires from session ${session.session_id}`);
          }
        }
        return session;
      });

      if (cleanedCount > 0) {
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(cleanedSessions));
        console.log(`✅ Cleaned up ${cleanedCount} sessions with duplicate questionnaires`);
      }
    } catch (error) {
      console.error('Error cleaning up stale questionnaires:', error);
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

  /**
   * Clean up corrupted sessions from localStorage
   * This removes sessions that have questions_generated=true but no actual messages
   * Also fixes sessions with mixed content by removing duplicate/conflicting messages
   */
  static cleanupCorruptedSessions(): number {
    if (typeof window === 'undefined') return 0;

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.sessions);
      if (!stored) return 0;

      const sessions = JSON.parse(stored);
      const sessionsArray = Array.isArray(sessions) ? sessions : Object.values(sessions);

      let cleanedSessions = [];
      let removedCount = 0;
      let fixedCount = 0;

      for (const session of sessionsArray) {
        const hasMessages = Array.isArray(session.messages) && session.messages.length > 0;
        const isCorrupted = session.questions_generated && !hasMessages;

        if (isCorrupted) {
          console.log(`🧹 REMOVING corrupted session ${session.session_id} (no messages but flagged as having questionnaires)`);
          removedCount++;
          continue;
        }

        // Fix sessions with mixed content by cleaning up duplicate questionnaire messages
        if (hasMessages) {
          const cleanedSession = this.fixMixedContentInSession(session);
          if (cleanedSession !== session) {
            fixedCount++;
            console.log(`🔧 FIXED mixed content in session ${session.session_id}`);
          }
          cleanedSessions.push(cleanedSession);
        } else {
          cleanedSessions.push(session);
        }
      }

      if (removedCount > 0 || fixedCount > 0) {
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(cleanedSessions));
        console.log(`🧹 Cleanup complete: removed ${removedCount} corrupted sessions, fixed ${fixedCount} sessions with mixed content`);
      } else {
        console.log(`🧹 No cleanup needed - all sessions are clean`);
      }

      return removedCount + fixedCount;
    } catch (error) {
      console.error('Error cleaning up corrupted sessions:', error);
      return 0;
    }
  }

  /**
   * Fix mixed content in a session by detecting and removing conversations from different business contexts
   * and ensuring consistent business context throughout the session
   */
  private static fixMixedContentInSession(session: any): any {
    if (!Array.isArray(session.messages) || session.messages.length === 0) {
      return session;
    }

    // Detect mixed business contexts by looking for multiple business idea introductions
    const businessIntroMessages = session.messages.filter((msg: any) =>
      msg.role === 'user' && (
        msg.content.toLowerCase().includes('i want to open') ||
        msg.content.toLowerCase().includes('i want to create') ||
        msg.content.toLowerCase().includes('i want to start')
      )
    );

    // If there are multiple business introductions, this indicates mixed content
    if (businessIntroMessages.length > 1) {
      console.log(`🚨 MIXED CONTENT DETECTED: Found ${businessIntroMessages.length} different business conversations in session ${session.session_id}`);

      // Find the most recent business conversation by timestamp
      const sortedBusinessMessages = businessIntroMessages.sort((a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const latestBusinessMessage = sortedBusinessMessages[0];
      const latestBusinessTimestamp = new Date(latestBusinessMessage.timestamp);

      console.log(`🔧 Keeping only the latest business conversation starting from: "${latestBusinessMessage.content}"`);

      // Keep only messages from the latest business conversation onwards
      const cleanedMessages = session.messages.filter((msg: any) => {
        const msgTimestamp = new Date(msg.timestamp);
        return msgTimestamp >= latestBusinessTimestamp;
      });

      // Update business context to match the latest conversation
      const latestBusinessIdea = this.extractBusinessIdeaFromMessage(latestBusinessMessage.content);

      // Extract target customer and problem from the cleaned messages
      const extractedContext = this.extractContextFromCleanedMessages(cleanedMessages);

      // Remove any questionnaire messages since they're based on mixed content
      const messagesWithoutQuestionnaire = cleanedMessages.filter((msg: any) =>
        msg.content !== 'COMPREHENSIVE_QUESTIONS_COMPONENT'
      );

      console.log(`🔧 Removed questionnaire from mixed content session - it needs to be regenerated for: "${latestBusinessIdea}"`);
      console.log(`🔧 Extracted context: target_customer="${extractedContext.target_customer}", problem="${extractedContext.problem}"`);

      const finalTargetCustomer = extractedContext.target_customer || session.target_customer || '';
      const finalProblem = extractedContext.problem || session.problem || '';

      console.log(`🔧 Final session context: target_customer="${finalTargetCustomer}", problem="${finalProblem}"`);

      return {
        ...session,
        messages: messagesWithoutQuestionnaire,
        message_count: messagesWithoutQuestionnaire.length,
        business_idea: latestBusinessIdea,
        target_customer: finalTargetCustomer,
        problem: finalProblem,
        questions_generated: false // Reset this so questionnaire can be regenerated
      };
    }

    // Also check for duplicate questionnaire messages
    const questionnaireMessages = session.messages.filter((msg: any) =>
      msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions
    );

    if (questionnaireMessages.length > 1) {
      console.log(`🔧 Found ${questionnaireMessages.length} questionnaire messages in session ${session.session_id}, keeping only the latest`);

      const sortedQuestionnaires = questionnaireMessages.sort((a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const latestQuestionnaire = sortedQuestionnaires[0];

      const cleanedMessages = session.messages.filter((msg: any) => {
        if (msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions) {
          return msg.id === latestQuestionnaire.id;
        }
        return true;
      });

      return {
        ...session,
        messages: cleanedMessages,
        message_count: cleanedMessages.length
      };
    }

    return session;
  }

  /**
   * Extract business idea from a user message
   */
  private static extractBusinessIdeaFromMessage(content: string): string {
    // Simple extraction - look for text after "I want to open/create/start"
    const patterns = [
      /i want to open (.+)/i,
      /i want to create (.+)/i,
      /i want to start (.+)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return content;
  }

  /**
   * Extract target customer and problem context from cleaned messages
   * This uses multiple strategies to find business context information
   */
  private static extractContextFromCleanedMessages(messages: any[]): { target_customer: string; problem: string } {
    console.log(`🔍 CONTEXT EXTRACTION: Analyzing ${messages.length} messages for business context`);

    let target_customer = '';
    let problem = '';

    // Strategy 1: Look for assistant-user question-answer pairs with expanded patterns
    for (let i = 0; i < messages.length - 1; i++) {
      const currentMsg = messages[i];
      const nextMsg = messages[i + 1];

      if (currentMsg.role === 'assistant' && nextMsg.role === 'user') {
        const assistantContent = currentMsg.content.toLowerCase();
        const userResponse = nextMsg.content.trim();

        console.log(`🔍 Checking assistant question: "${assistantContent.substring(0, 100)}..."`);
        console.log(`🔍 User response: "${userResponse.substring(0, 100)}..."`);

        // Expanded patterns for target customer questions
        const targetCustomerPatterns = [
          'target customer', 'who specifically', 'who would be your', 'who are you targeting',
          'who is your audience', 'who would use', 'who would benefit', 'who are your customers',
          'what type of customers', 'which customers', 'customer segment', 'target market',
          'who would pay', 'who needs this', 'primary users', 'ideal customer'
        ];

        const isTargetCustomerQuestion = targetCustomerPatterns.some(pattern =>
          assistantContent.includes(pattern)
        );

        if (isTargetCustomerQuestion && userResponse.length > 10) {
          target_customer = userResponse;
          console.log(`✅ EXTRACTED target_customer from Q&A: "${target_customer}"`);
        }

        // Expanded patterns for problem/pain point questions
        const problemPatterns = [
          'pain point', 'problem', 'what\'s the main', 'challenge', 'difficulty',
          'issue', 'struggle', 'frustration', 'what bothers', 'what\'s wrong',
          'what needs fixing', 'what\'s broken', 'inefficiency', 'bottleneck',
          'what\'s missing', 'gap in the market', 'unmet need'
        ];

        const isProblemQuestion = problemPatterns.some(pattern =>
          assistantContent.includes(pattern)
        );

        if (isProblemQuestion && userResponse.length > 10) {
          problem = userResponse;
          console.log(`✅ EXTRACTED problem from Q&A: "${problem}"`);
        }
      }
    }

    // Strategy 2: Look for business context keywords in all user messages
    if (!target_customer || !problem) {
      console.log(`🔍 FALLBACK EXTRACTION: Looking for business context in all user messages`);

      for (const msg of messages) {
        if (msg.role === 'user') {
          const content = msg.content.toLowerCase();
          const originalContent = msg.content.trim();

          // Look for target customer indicators in user messages
          if (!target_customer) {
            // Look for sentences that describe target customers
            const customerSentencePatterns = [
              /(.{0,50})(smes?|small businesses?|enterprises?|companies|agencies|startups|retailers|restaurants|clinics|hospitals|schools|universities|developers|designers|consultants|freelancers|professionals)(.{0,100})/i,
              /(target|serve|help|work with|focus on)(.{0,100})/i
            ];

            for (const pattern of customerSentencePatterns) {
              const match = originalContent.match(pattern);
              if (match && match[0].length > 20) {
                target_customer = match[0].trim();
                console.log(`✅ EXTRACTED target_customer from context: "${target_customer}"`);
                break;
              }
            }
          }

          // Look for problem indicators in user messages
          if (!problem) {
            const problemIndicators = [
              'outdated', 'manual', 'inefficient', 'slow', 'expensive', 'difficult',
              'time-consuming', 'error-prone', 'unreliable', 'lacking', 'missing',
              'broken', 'frustrating', 'complicated', 'confusing'
            ];

            const hasProblemContext = problemIndicators.some(indicator =>
              content.includes(indicator)
            );

            if (hasProblemContext && originalContent.length > 20) {
              // Extract sentences that describe problems
              const problemSentencePatterns = [
                /(.{0,100})(outdated|manual|inefficient|slow|expensive|difficult|time-consuming|error-prone|unreliable|lacking|missing|broken|frustrating|complicated|confusing)(.{0,100})/i,
                /(problem|issue|challenge|difficulty|struggle|pain|frustration)(.{0,100})/i
              ];

              for (const pattern of problemSentencePatterns) {
                const match = originalContent.match(pattern);
                if (match && match[0].length > 15) {
                  problem = match[0].trim();
                  console.log(`✅ EXTRACTED problem from context: "${problem}"`);
                  break;
                }
              }
            }
          }
        }
      }
    }

    // Strategy 3: Look for comprehensive business descriptions in longer user messages
    if (!target_customer || !problem) {
      console.log(`🔍 COMPREHENSIVE EXTRACTION: Looking for detailed business descriptions`);

      let extractedSentences = new Set(); // Track extracted sentences to avoid duplicates

      for (const msg of messages) {
        if (msg.role === 'user' && msg.content.length > 50) {
          const content = msg.content.trim();

          // If this message contains business context keywords and is substantial
          const businessKeywords = [
            'business', 'company', 'service', 'product', 'customers', 'clients',
            'market', 'industry', 'solution', 'platform', 'system', 'application'
          ];

          const hasBusinessContext = businessKeywords.some(keyword =>
            content.toLowerCase().includes(keyword)
          );

          if (hasBusinessContext) {
            const sentences = content.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 15);

            // Extract target customer first - prioritize sentences with customer-specific terms
            if (!target_customer && content.length > 30) {
              for (const sentence of sentences) {
                const lowerSentence = sentence.toLowerCase();

                // Strong customer indicators (prioritize these)
                const strongCustomerIndicators = ['smes', 'small businesses', 'enterprises', 'startups', 'agencies', 'companies', 'retailers', 'restaurants', 'clinics', 'hospitals', 'schools', 'universities'];
                const hasStrongCustomerIndicator = strongCustomerIndicators.some(indicator => lowerSentence.includes(indicator));

                // Weak customer indicators (only use if no strong ones found)
                const weakCustomerIndicators = ['customer', 'client', 'business', 'company'];
                const hasWeakCustomerIndicator = weakCustomerIndicators.some(indicator => lowerSentence.includes(indicator));

                // Avoid sentences that are clearly about problems
                const isProblemSentence = lowerSentence.includes('problem') || lowerSentence.includes('issue') ||
                                        lowerSentence.includes('struggle') || lowerSentence.includes('challenge') ||
                                        lowerSentence.includes('pain') || lowerSentence.includes('frustration');

                if ((hasStrongCustomerIndicator || hasWeakCustomerIndicator) && !isProblemSentence &&
                    sentence.length > 20 && !extractedSentences.has(sentence)) {
                  target_customer = sentence;
                  extractedSentences.add(sentence);
                  console.log(`✅ EXTRACTED target_customer from business description: "${target_customer}"`);
                  break;
                }
              }
            }

            // Extract problem - prioritize sentences with problem-specific terms, avoid customer sentences
            if (!problem && content.length > 30) {
              for (const sentence of sentences) {
                const lowerSentence = sentence.toLowerCase();

                // Skip sentences already used for target_customer
                if (extractedSentences.has(sentence)) {
                  continue;
                }

                // Strong problem indicators
                const strongProblemIndicators = ['problem', 'issue', 'challenge', 'struggle', 'pain point', 'frustration', 'difficulty'];
                const hasStrongProblemIndicator = strongProblemIndicators.some(indicator => lowerSentence.includes(indicator));

                // Descriptive problem indicators
                const descriptiveProblemIndicators = ['outdated', 'manual', 'inefficient', 'slow', 'expensive', 'difficult', 'time-consuming', 'error-prone', 'unreliable', 'lacking', 'missing', 'broken', 'frustrating', 'complicated', 'confusing'];
                const hasDescriptiveProblemIndicator = descriptiveProblemIndicators.some(indicator => lowerSentence.includes(indicator));

                // Avoid sentences that are clearly about customers/target market
                const isCustomerSentence = lowerSentence.includes('smes') || lowerSentence.includes('small business') ||
                                         lowerSentence.includes('agencies') || lowerSentence.includes('companies') ||
                                         lowerSentence.includes('target') || lowerSentence.includes('market');

                if ((hasStrongProblemIndicator || hasDescriptiveProblemIndicator) && !isCustomerSentence &&
                    sentence.length > 15) {
                  problem = sentence;
                  extractedSentences.add(sentence);
                  console.log(`✅ EXTRACTED problem from business description: "${problem}"`);
                  break;
                }
              }
            }
          }
        }
      }
    }

    console.log(`🔍 FINAL EXTRACTION RESULTS:`);
    console.log(`   target_customer: "${target_customer}"`);
    console.log(`   problem: "${problem}"`);

    return { target_customer, problem };
  }



  /**
   * Manually clean up a specific session by ID
   * Useful for fixing problematic sessions
   */
  static cleanupSpecificSession(sessionId: string): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.sessions);
      if (!stored) return false;

      const sessions = JSON.parse(stored);
      const sessionsArray = Array.isArray(sessions) ? sessions : Object.values(sessions);

      const sessionIndex = sessionsArray.findIndex((s: any) => s.session_id === sessionId);
      if (sessionIndex === -1) {
        console.log(`Session ${sessionId} not found`);
        return false;
      }

      const session = sessionsArray[sessionIndex];
      console.log(`🔧 Cleaning up session ${sessionId}: "${session.business_idea}"`);
      console.log(`🔧 Current context: target_customer="${session.target_customer}", problem="${session.problem}"`);

      const cleanedSession = this.fixMixedContentInSession(session);

      if (cleanedSession !== session) {
        sessionsArray[sessionIndex] = cleanedSession;
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessionsArray));
        console.log(`🔧 Fixed mixed content in session ${sessionId}`);
        return true;
      }

      console.log(`Session ${sessionId} was already clean`);
      return false;
    } catch (error) {
      console.error(`Error cleaning up session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Force cleanup of all sessions - useful for testing the improved extraction logic
   */
  static forceCleanupAllSessions(): number {
    if (typeof window === 'undefined') return 0;

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.sessions);
      if (!stored) return 0;

      const sessions = JSON.parse(stored);
      const sessionsArray = Array.isArray(sessions) ? sessions : Object.values(sessions);

      console.log(`🔧 FORCE CLEANUP: Processing ${sessionsArray.length} sessions with improved extraction logic`);

      let processedCount = 0;
      const cleanedSessions = sessionsArray.map((session: any) => {
        if (Array.isArray(session.messages) && session.messages.length > 0) {
          console.log(`🔧 Force processing session ${session.session_id}: "${session.business_idea}"`);
          console.log(`🔧 Current context: target_customer="${session.target_customer}", problem="${session.problem}"`);

          // Always run extraction to improve context, even if session already has some context
          const extractedContext = this.extractContextFromCleanedMessages(session.messages);

          // Update session with extracted context (prefer extracted over existing if extracted is better)
          const updatedSession = {
            ...session,
            target_customer: extractedContext.target_customer || session.target_customer || '',
            problem: extractedContext.problem || session.problem || '',
            updated_at: new Date().toISOString()
          };

          // Check if we made any improvements
          const hasImprovement =
            (extractedContext.target_customer && extractedContext.target_customer !== session.target_customer) ||
            (extractedContext.problem && extractedContext.problem !== session.problem);

          if (hasImprovement) {
            processedCount++;
            console.log(`🔧 Improved context for session ${session.session_id}:`);
            console.log(`   target_customer: "${session.target_customer}" → "${updatedSession.target_customer}"`);
            console.log(`   problem: "${session.problem}" → "${updatedSession.problem}"`);
          }

          // Also run the original mixed content cleanup
          const cleanedSession = this.fixMixedContentInSession(updatedSession);

          return cleanedSession;
        }
        return session;
      });

      if (processedCount > 0) {
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(cleanedSessions));
        console.log(`🔧 Force cleanup complete: processed ${processedCount} sessions`);
      } else {
        console.log(`🔧 Force cleanup complete: no changes needed`);
      }

      return processedCount;
    } catch (error) {
      console.error('Error in force cleanup:', error);
      return 0;
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
    request_sidebar_summary: true,
  };

  // Use retry and timeout wrappers
  return await withRetry(async () => {
    return await withTimeout(async () => {
      // Call the frontend API route which handles authentication
      const response = await fetch('/api/research/conversation-routines/chat', {
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

      // Evaluate whether questionnaire is non-empty (V3)
      const hasNonEmptyQuestions = !!(result?.questions && (
        ((result.questions.primaryStakeholders?.length || 0) + (result.questions.secondaryStakeholders?.length || 0)) > 0
      ) && ((result.questions.timeEstimate?.totalQuestions || 0) > 0));

      // Debug logging for suggestions
      console.log('🔧 Raw API response suggestions:', result.suggestions);
      console.log('🔧 Raw API response structure:', {
        content: result.content?.substring(0, 50) + '...',
        suggestions: result.suggestions,
        metadata: result.metadata,
        context: result.context,
        hasNonEmptyQuestions
      });

      // Store the conversation both locally and on backend
      if (typeof window !== 'undefined') {
        // IMPORTANT: always operate on the concrete session by ID to avoid cross-session contamination
        const existingSession = LocalResearchStorage.getSession(sessionId);
        const messages = existingSession?.messages ? [...existingSession.messages] : [];

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

        // Update or create session strictly by sessionId
        const session: ResearchSession = {
          id: existingSession?.id || Date.now(),
          session_id: sessionId,
          user_id: anonymousUserId,
          business_idea: result.context?.business_idea || result.metadata?.extracted_context?.business_idea || existingSession?.business_idea,
          target_customer: result.context?.target_customer || result.metadata?.extracted_context?.target_customer || existingSession?.target_customer,
          problem: result.context?.problem || result.metadata?.extracted_context?.problem || existingSession?.problem,
          industry: result.metadata?.extracted_context?.industry || existingSession?.industry || 'general',
          location: result.context?.location || result.context?.region || result.metadata?.extracted_context?.location || result.metadata?.extracted_context?.region || existingSession?.location,
          stage: result.metadata?.extracted_context?.stage || existingSession?.stage || 'initial',
          status: 'active',
          questions_generated: hasNonEmptyQuestions || existingSession?.questions_generated || false,
          created_at: existingSession?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          message_count: messages.length,
          messages,
          conversation_context: result.metadata?.sidebar_summary || existingSession?.conversation_context,
          isLocal: true,
        };

        // If questions were generated, ensure they're properly saved as a questionnaire component
        if (hasNonEmptyQuestions && result.should_generate_questions) {
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
          // Add extracted context for frontend compatibility (merge to preserve richer fields)
          extracted_context: {
            ...result.metadata?.extracted_context,
            business_idea: result.context?.business_idea ?? result.metadata?.extracted_context?.business_idea,
            target_customer: result.context?.target_customer ?? result.metadata?.extracted_context?.target_customer,
            problem: result.context?.problem ?? result.metadata?.extracted_context?.problem,
            // Prefer explicit location, fall back to region if provided
            location: (result.context?.location ?? result.context?.region ?? result.metadata?.extracted_context?.location ?? result.metadata?.extracted_context?.region),
            industry: result.context?.industry ?? result.metadata?.extracted_context?.industry,
            stage: result.metadata?.extracted_context?.stage ?? result.context?.stage,
            questions_generated: result.should_generate_questions || hasNonEmptyQuestions
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
    const response = await fetch(`/api/research/sessions?limit=100`, { cache: 'no-store' });
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
        await fetch(`/api/research/sessions/${session.session_id}`, {
          method: 'DELETE',
          cache: 'no-store'
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
  // Enhanced validation to prevent unnecessary syncs
  if (!session.questions_generated ||
      !session.messages ||
      !session.business_idea ||
      session.messages.length < 3) {  // Need meaningful conversation
    console.log(`⏭️ Skipping sync for session ${session.session_id} - insufficient data`);
    return;
  }

  try {
    console.log(`🔄 Syncing local session ${session.session_id} to database...`);

    // Find questionnaire message
    const questionnaireMessage = session.messages.find((msg: any) =>
      msg.metadata?.comprehensiveQuestions
    );

    if (!questionnaireMessage?.metadata?.comprehensiveQuestions) {
      console.log(`⏭️ Skipping sync for session ${session.session_id} - no questionnaire data`);
      return;
    }

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
    let response = await fetch(`/api/research/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    });

    // If session already exists (500 error due to unique constraint), try to update it
    if (!response.ok && (response.status === 400 || response.status === 500)) {
      console.log(`🔄 Session ${session.session_id} already exists, updating instead...`);
      response = await fetch(`/api/research/sessions/${session.session_id}`, {
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
      // Only save questionnaire data if the session has one and it's not already saved
      if (questionnaireMessage?.metadata?.comprehensiveQuestions && session.questions_generated) {
        try {
          const questionnaireResponse = await fetch(`/api/research/sessions/${session.session_id}/questionnaire`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questionnaireMessage.metadata.comprehensiveQuestions)
          });

          if (questionnaireResponse.ok) {
            console.log(`✅ Synced questionnaire for session ${session.session_id}`);
          } else {
            console.warn(`⚠️ Failed to sync questionnaire for session ${session.session_id}`);
          }
        } catch (error) {
          console.warn(`⚠️ Error syncing questionnaire for session ${session.session_id}:`, error);
        }
      }

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
    // Try to fetch from backend first via Next.js API proxy (attaches Clerk token)
    const response = await fetch(`/api/research/sessions?limit=${limit}${userId ? `&user_id=${userId}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
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
            const questionnaireResponse = await fetch(`/api/research/sessions/${session.session_id}/questionnaire`, { cache: 'no-store' });
            if (questionnaireResponse.ok) {
              const questionnaireResult = await questionnaireResponse.json();
              questionnaireData = questionnaireResult.questionnaire;
              console.log(`✅ Fetched questionnaire data for session ${session.session_id}`);
            }
          } catch (error) {
            console.warn(`Failed to fetch questionnaire for session ${session.session_id}:`, error);
          }
        }

        // Debug logging removed for cleaner console

        if (session.questions_generated && questionnaireData) {
          // Check if questionnaire message already exists - use consistent detection logic
          const hasQuestionnaireMessage = messages.some((msg: any) => {
            const meta = msg?.metadata || {};
            const hasModern = !!meta.comprehensiveQuestions;
            const hasLegacy = !!meta.questionnaire || !!meta.comprehensive_questions;
            const hasComponent = msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && (hasModern || hasLegacy);
            return hasModern || hasLegacy || hasComponent;
          });

          if (!hasQuestionnaireMessage) {
            // Add questionnaire message for compatibility with frontend logic
            console.log(`🔧 Adding questionnaire message for session ${session.session_id}`);
            console.log(`📋 Questionnaire data structure:`, {
              primaryStakeholders: questionnaireData.primaryStakeholders?.length || 0,
              secondaryStakeholders: questionnaireData.secondaryStakeholders?.length || 0,
              timeEstimate: questionnaireData.timeEstimate
            });

            const questionnaireMessage = {
              id: `questionnaire_${session.session_id}_${Date.now()}`,
              content: 'COMPREHENSIVE_QUESTIONS_COMPONENT',
              role: 'assistant',
              timestamp: session.completed_at || session.updated_at,
              metadata: {
                type: 'component',
                comprehensiveQuestions: questionnaireData,
                businessContext: session.business_idea,
                conversation_routine: true,
                questions_generated: true
              }
            };

            messages.push(questionnaireMessage);
            console.log(`✅ Questionnaire message added for session: ${session.session_id}`);
          } else {
            console.log(`✅ Questionnaire message already exists for session: ${session.session_id}`);
          }
        } else if (session.questions_generated && !questionnaireData) {
          console.warn(`⚠️ Session ${session.session_id} marked as questions_generated but no questionnaire data found`);
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

        // Debug logging removed for cleaner console

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
      // Disabled during active display to prevent race conditions
      const isDisplayingHistory = window.location.pathname.includes('research-chat-history');
      if (!forceRestore && !isDisplayingHistory) {
        console.log('🔄 Background sync enabled (not on history page)');
        localSessions
          .filter(session => session.questions_generated && session.session_id.startsWith('local_'))
          .forEach(session => {
            syncLocalSessionToDatabase(session).catch(err =>
              console.warn('Background sync failed:', err)
            );
          });
      } else if (isDisplayingHistory) {
        console.log('⏸️ Background sync disabled (on history page to prevent flickering)');
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
        // Debug logging removed for cleaner console

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

      // Merge sessions with precedence for the most complete/advanced data
      // 1) Start with local sessions as base
      const mergedMap = new Map<string, ResearchSession>();
      localSessions.forEach((s) => mergedMap.set(s.session_id, s));

      // 2) Merge backend sessions: prefer backend when it reflects a more advanced state
      convertedSessions.forEach((backendSession) => {
        const existing = mergedMap.get(backendSession.session_id);
        const backendHasQuestionnaire = !!backendSession.questions_generated || !!backendSession.completed_at;
        const localHasQuestionnaire = !!existing?.questions_generated || !!existing?.completed_at;

        if (!existing) {
          mergedMap.set(backendSession.session_id, backendSession);
          return;
        }

        // If backend is more advanced (questions generated or completed) and local is not, prefer backend
        if (backendHasQuestionnaire && !localHasQuestionnaire) {
          mergedMap.set(backendSession.session_id, backendSession);
          // Opportunistic passive sync even on history page to avoid stale local state
          try {
            if (typeof window !== 'undefined') {
              LocalResearchStorage.saveSession({ ...backendSession, isLocal: true });
            }
          } catch (e) {
            console.warn('Passive sync to localStorage failed:', e);
          }
          return;
        }

        // If both have similar state, prefer the most recently updated
        const backendUpdated = new Date(backendSession.updated_at).getTime();
        const localUpdated = new Date(existing.updated_at).getTime();
        if (backendUpdated > localUpdated) {
          mergedMap.set(backendSession.session_id, backendSession);
        }
      });

      // 3) Defensive: if questionnaire data exists but flag not set, set it for UI consistency
      for (const [id, session] of Array.from(mergedMap.entries())) {
        const hasQ = session.questions_generated || !!session.completed_at || session.messages?.some(m => m?.metadata?.comprehensiveQuestions);
        if (hasQ && !session.questions_generated) {
          mergedMap.set(id, { ...session, questions_generated: true });
        }
      }

      const allSessions = Array.from(mergedMap.values());

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
    // Try to fetch from backend first via Next.js API proxy (attaches Clerk token)
    const response = await fetch(`/api/research/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });

    if (response.ok) {
      const backendSession = await response.json();

      // Fetch messages separately (via proxy)
      let messages: Message[] = [];
      try {
        const messagesResponse = await fetch(`/api/research/sessions/${sessionId}/messages`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store'
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
    const response = await fetch(`/api/research/sessions`, {
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
    const response = await fetch(`/api/research/sessions/${sessionId}`, {
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

// Global helper functions for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).debugResearchCleanup = {
    forceCleanupAll: () => LocalResearchStorage.forceCleanupAllSessions(),
    cleanupCorrupted: () => LocalResearchStorage.cleanupCorruptedSessions(),
    showSessions: () => {
      const sessions = LocalResearchStorage.getSessions();
      console.log(`Found ${sessions.length} sessions:`);
      sessions.forEach((session, i) => {
        console.log(`${i + 1}. ${session.session_id}: "${session.business_idea}" | target_customer: "${session.target_customer}" | problem: "${session.problem}"`);
      });
      return sessions;
    },
    cleanupSpecific: (sessionId: string) => LocalResearchStorage.cleanupSpecificSession(sessionId)
  };

  console.log('🔧 Research cleanup helpers available at window.debugResearchCleanup');
}
