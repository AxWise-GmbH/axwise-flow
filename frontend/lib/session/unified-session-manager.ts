/**
 * Unified Session Management System
 *
 * Single source of truth for all session persistence:
 * - Primary: Backend database (when available)
 * - Fallback: localStorage (offline/development)
 * - Cache: In-memory state (performance)
 */

import { ResearchSession, Message } from '@/lib/api/research';

export interface SessionSyncStatus {
  isLocal: boolean;
  isSynced: boolean;
  lastSyncAt?: string;
  syncError?: string;
}

export interface UnifiedSession extends ResearchSession {
  syncStatus: SessionSyncStatus;
}

export class UnifiedSessionManager {
  private static instance: UnifiedSessionManager;
  private sessionCache = new Map<string, UnifiedSession>();
  private syncQueue = new Set<string>();
  private isOnline = true;

  private constructor() {
    // Monitor online status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.processSyncQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  static getInstance(): UnifiedSessionManager {
    if (!UnifiedSessionManager.instance) {
      UnifiedSessionManager.instance = new UnifiedSessionManager();
    }
    return UnifiedSessionManager.instance;
  }

  /**
   * Get session from unified storage (cache -> localStorage -> backend)
   */
  async getSession(sessionId: string): Promise<UnifiedSession | null> {
    try {
      // 1. Check cache first
      if (this.sessionCache.has(sessionId)) {
        console.log(`📋 Session ${sessionId} loaded from cache`);
        return this.sessionCache.get(sessionId)!;
      }

      // 2. Determine storage type by session ID
      const isLocal = sessionId.startsWith('local_');
      let session: ResearchSession | null = null;

      if (isLocal) {
        // Load from localStorage
        session = await this.getLocalSession(sessionId);
      } else {
        // Try backend first, fallback to localStorage
        try {
          session = await this.getBackendSession(sessionId);
          // If backend session has no messages, try localStorage as fallback
          if (!session.messages || session.messages.length === 0) {
            console.warn(`Backend session ${sessionId} has no messages, checking localStorage`);
            const localSession = await this.getLocalSession(sessionId);
            if (localSession && localSession.messages && localSession.messages.length > 0) {
              console.log(`Using messages from localStorage for session ${sessionId}`);
              session.messages = localSession.messages;
            }
          }
        } catch (error) {
          console.warn(`Backend session ${sessionId} not found, checking localStorage`);
          session = await this.getLocalSession(sessionId);
        }
      }

      if (!session) {
        return null;
      }

      // 3. Create unified session with sync status
      const unifiedSession: UnifiedSession = {
        ...session,
        syncStatus: {
          isLocal,
          isSynced: !isLocal, // Backend sessions are considered synced
          lastSyncAt: isLocal ? undefined : new Date().toISOString()
        }
      };

      // 4. Cache the session
      this.sessionCache.set(sessionId, unifiedSession);

      console.log(`✅ Session ${sessionId} loaded successfully`);
      return unifiedSession;

    } catch (error) {
      console.error(`❌ Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save session to unified storage with automatic sync
   */
  async saveSession(session: UnifiedSession): Promise<void> {
    try {
      const sessionId = session.session_id;

      // 1. Update cache
      this.sessionCache.set(sessionId, {
        ...session,
        updated_at: new Date().toISOString()
      });

      // 2. Always save to localStorage (for offline access)
      await this.saveLocalSession(session);

      // 3. Sync to backend if online and not a local-only session
      if (this.isOnline && !session.syncStatus.isLocal) {
        try {
          await this.saveBackendSession(session);
          session.syncStatus.isSynced = true;
          session.syncStatus.lastSyncAt = new Date().toISOString();
          session.syncStatus.syncError = undefined;
        } catch (error) {
          console.warn(`Failed to sync session ${sessionId} to backend:`, error);
          session.syncStatus.isSynced = false;
          session.syncStatus.syncError = error instanceof Error ? error.message : 'Sync failed';
          this.syncQueue.add(sessionId);
        }
      } else if (!this.isOnline) {
        // Queue for sync when online
        this.syncQueue.add(sessionId);
        session.syncStatus.isSynced = false;
      }

      console.log(`💾 Session ${sessionId} saved successfully`);

    } catch (error) {
      console.error(`❌ Failed to save session ${session.session_id}:`, error);
      throw error;
    }
  }

  /**
   * Create new session with unified management
   */
  async createSession(sessionData: Partial<ResearchSession>): Promise<UnifiedSession> {
    try {
      let session: ResearchSession;

      if (this.isOnline) {
        // Try to create on backend first
        try {
          session = await this.createBackendSession(sessionData);
        } catch (error) {
          console.warn('Backend session creation failed, creating locally:', error);
          session = this.createLocalSession(sessionData);
        }
      } else {
        // Create locally when offline
        session = this.createLocalSession(sessionData);
      }

      const unifiedSession: UnifiedSession = {
        ...session,
        syncStatus: {
          isLocal: session.session_id.startsWith('local_'),
          isSynced: !session.session_id.startsWith('local_'),
          lastSyncAt: session.session_id.startsWith('local_') ? undefined : new Date().toISOString()
        }
      };

      // Cache and save
      this.sessionCache.set(session.session_id, unifiedSession);
      await this.saveLocalSession(unifiedSession);

      console.log(`🆕 Session ${session.session_id} created successfully`);
      return unifiedSession;

    } catch (error) {
      console.error('❌ Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Get all sessions from unified storage
   */
  async getAllSessions(): Promise<UnifiedSession[]> {
    try {
      const allSessions = new Map<string, UnifiedSession>();

      // 1. Get local sessions
      const localSessions = await this.getAllLocalSessions();
      localSessions.forEach(session => {
        allSessions.set(session.session_id, {
          ...session,
          syncStatus: {
            isLocal: true,
            isSynced: false
          }
        });
      });

      // 2. Get backend sessions (if online)
      if (this.isOnline) {
        try {
          const backendSessions = await this.getAllBackendSessions();
          backendSessions.forEach(session => {
            allSessions.set(session.session_id, {
              ...session,
              syncStatus: {
                isLocal: false,
                isSynced: true,
                lastSyncAt: new Date().toISOString()
              }
            });
          });
        } catch (error) {
          console.warn('Failed to fetch backend sessions:', error);
        }
      }

      // 3. Sort by updated_at (newest first)
      const sessions = Array.from(allSessions.values()).sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      console.log(`📋 Loaded ${sessions.length} sessions from unified storage`);
      return sessions;

    } catch (error) {
      console.error('❌ Failed to load all sessions:', error);
      return [];
    }
  }

  /**
   * Delete session from all storage layers
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      // Remove from cache
      this.sessionCache.delete(sessionId);

      // Remove from sync queue
      this.syncQueue.delete(sessionId);

      // Remove from localStorage
      await this.deleteLocalSession(sessionId);

      // Remove from backend (if not local session)
      if (!sessionId.startsWith('local_') && this.isOnline) {
        try {
          await this.deleteBackendSession(sessionId);
        } catch (error) {
          console.warn(`Failed to delete backend session ${sessionId}:`, error);
        }
      }

      console.log(`🗑️ Session ${sessionId} deleted successfully`);

    } catch (error) {
      console.error(`❌ Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Force sync all pending sessions to backend
   */
  async syncPendingSessions(): Promise<void> {
    if (!this.isOnline || this.syncQueue.size === 0) {
      return;
    }

    console.log(`🔄 Syncing ${this.syncQueue.size} pending sessions...`);

    const syncPromises = Array.from(this.syncQueue).map(async (sessionId) => {
      try {
        const session = await this.getSession(sessionId);
        if (session && !session.syncStatus.isSynced) {
          await this.saveBackendSession(session);
          session.syncStatus.isSynced = true;
          session.syncStatus.lastSyncAt = new Date().toISOString();
          session.syncStatus.syncError = undefined;
          this.syncQueue.delete(sessionId);
        }
      } catch (error) {
        console.error(`Failed to sync session ${sessionId}:`, error);
      }
    });

    await Promise.allSettled(syncPromises);
    console.log(`✅ Sync completed. ${this.syncQueue.size} sessions remaining in queue.`);
  }

  // Private helper methods for storage operations
  private async getLocalSession(sessionId: string): Promise<ResearchSession | null> {
    if (typeof window === 'undefined') return null;

    try {
      const { LocalResearchStorage } = await import('@/lib/api/research');
      return LocalResearchStorage.getSession(sessionId);
    } catch (error) {
      console.error('Failed to load local session:', error);
      return null;
    }
  }

  private async saveLocalSession(session: UnifiedSession): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const { LocalResearchStorage } = await import('@/lib/api/research');
      LocalResearchStorage.saveSession(session);
    } catch (error) {
      console.error('Failed to save local session:', error);
      throw error;
    }
  }

  private async getAllLocalSessions(): Promise<ResearchSession[]> {
    if (typeof window === 'undefined') return [];

    try {
      const { LocalResearchStorage } = await import('@/lib/api/research');
      return LocalResearchStorage.getSessions();
    } catch (error) {
      console.error('Failed to load local sessions:', error);
      return [];
    }
  }

  private async deleteLocalSession(sessionId: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const { LocalResearchStorage } = await import('@/lib/api/research');
      LocalResearchStorage.deleteSession(sessionId);
    } catch (error) {
      console.error('Failed to delete local session:', error);
    }
  }

  private async getBackendSession(sessionId: string): Promise<ResearchSession | null> {
    const { getResearchSession } = await import('@/lib/api/research');
    return getResearchSession(sessionId);
  }

  private async saveBackendSession(session: UnifiedSession): Promise<void> {
    // Implementation depends on your backend API
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const response = await fetch(`${API_BASE_URL}/api/research/sessions/${session.session_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });

    if (!response.ok) {
      throw new Error(`Backend save failed: ${response.statusText}`);
    }
  }

  private async getAllBackendSessions(): Promise<ResearchSession[]> {
    const { getResearchSessions } = await import('@/lib/api/research');
    return getResearchSessions();
  }

  private async createBackendSession(sessionData: Partial<ResearchSession>): Promise<ResearchSession> {
    const { createResearchSession } = await import('@/lib/api/research');
    return createResearchSession(sessionData);
  }

  private createLocalSession(sessionData: Partial<ResearchSession>): ResearchSession {
    const sessionId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      id: Date.now(),
      session_id: sessionId,
      user_id: sessionData.user_id || 'anonymous',
      business_idea: sessionData.business_idea || '',
      target_customer: sessionData.target_customer || '',
      problem: sessionData.problem || '',
      industry: sessionData.industry || 'general',
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
  }

  private async deleteBackendSession(sessionId: string): Promise<void> {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const response = await fetch(`${API_BASE_URL}/api/research/sessions/${sessionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Backend delete failed: ${response.statusText}`);
    }
  }

  private async processSyncQueue(): Promise<void> {
    if (this.syncQueue.size > 0) {
      console.log('🌐 Back online, processing sync queue...');
      await this.syncPendingSessions();
    }
  }
}

// Export singleton instance
export const sessionManager = UnifiedSessionManager.getInstance();
